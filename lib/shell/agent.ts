import Anthropic from "@anthropic-ai/sdk";
import { SHELL_MODEL, SHELL_CREDITS_PER_COMMAND, shellCreditsForUsage } from "@/lib/credits-constants";
import { chargeCredits } from "@/lib/credits";
import { runInSandbox } from "./sandbox";

// The GYSM Shell agent: Claude with two tools (run a command, share a
// file) driving the user's own sandbox.
//
// Two modes:
//   - "guide": every command is proposed with a plain-English explanation
//     and waits for the user to tap Run (or edit / skip it). Beginner mode.
//   - "auto": the agent runs commands itself and reports back, pausing
//     only for ones it flags as risky (deleting files, installing system
//     packages, anything hard to undo).
//
// The conversation (Anthropic message format) lives in the browser and is
// sent back each turn -- no new DB table. A user editing their own history
// can only affect their own sandbox, and every model call is still metered
// against their credits.

export type ShellMode = "guide" | "auto";

export type ShellEvent =
  | { type: "text"; text: string }
  | { type: "proposal"; toolUseId: string; command: string; explanation: string; risky: boolean }
  | { type: "command"; command: string; explanation: string; by: "ai" | "user" }
  | { type: "output"; output: string; exitCode: number; cwd: string; truncated: boolean }
  | { type: "skipped"; command: string }
  | { type: "file"; path: string }
  | { type: "credits"; spent: number; balance: number }
  | { type: "state"; messages: Anthropic.MessageParam[]; cwd: string }
  | { type: "error"; error: string; code?: string };

const MAX_STEPS_PER_TURN = 10;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "run_command",
    description:
      "Run one bash command in the user's Linux workspace and get its combined output. Commands start in the user's current folder; `cd` persists between commands.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "A single bash command (chain with && if needed)." },
        explanation: {
          type: "string",
          description:
            "One or two short sentences, in plain words a non-programmer understands, saying what this command does and why. Explain each flag that matters.",
        },
        risky: {
          type: "boolean",
          description:
            "true if the command deletes or overwrites files, installs system packages with sudo, changes permissions broadly, or is otherwise hard to undo.",
        },
      },
      required: ["command", "explanation", "risky"],
    },
  },
  {
    name: "share_file",
    description:
      "Give the user a download button for a file in their workspace (a result they asked for, e.g. a converted file or a report). Max 4 MB.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Path to the file, absolute or relative to the current folder." } },
      required: ["path"],
    },
  },
];

function systemPrompt(mode: ShellMode, cwd: string): string {
  return `You are GYSM Shell, a friendly assistant that gets things done on the user's own cloud Linux computer (Ubuntu, with Python 3, Node.js, git, curl and common tools; passwordless sudo; internet access). Most users are on a phone and many have never used a terminal.

How to work:
- Do the task with run_command, one command at a time. Look at each result before the next step.
- Every command needs a short plain-English explanation. No jargon without a one-line definition.
- Never run interactive programs (vim, nano, less, top, python with no script, ssh). They will hang. Write files with cat <<'EOF' heredocs or python scripts instead.
- Keep the user's work in ~/workspace unless they ask otherwise.
- Prefer small, safe, reversible steps. Mark anything destructive as risky.
- When you produce a file the user will want (a result, a report, a converted file), call share_file.
- Finish with a brief summary of what happened and what they can try next. Keep chat text short: phone screens are small. Use simple markdown at most.
- If the user wants to learn, teach: explain what the output means, and suggest one command they can type themselves next.
- Never try to reach GYSM's own servers, other users, or anything outside this sandbox's normal internet use. Refuse abuse (spam, attacks, crypto mining).

Mode: ${
    mode === "guide"
      ? "GUIDE -- the user approves every command before it runs, so explanations matter most."
      : "AUTO -- commands run immediately unless marked risky, in which case the user is asked first."
  }
Current folder: ${cwd || "~/workspace"}`;
}

// Bounds what a client can send back: total size, and a sane history
// length (oldest turns dropped at a clean user-text boundary so tool_use /
// tool_result pairs are never split).
const MAX_HISTORY_MESSAGES = 60;
const MAX_HISTORY_BYTES = 400_000;

export function sanitizeHistory(raw: unknown): Anthropic.MessageParam[] {
  if (!Array.isArray(raw)) return [];
  let messages = raw.filter(
    (m: any) => m && (m.role === "user" || m.role === "assistant") && (typeof m.content === "string" || Array.isArray(m.content))
  ) as Anthropic.MessageParam[];

  const isPlainUser = (m: Anthropic.MessageParam) =>
    m.role === "user" && (typeof m.content === "string" || !m.content.some((b: any) => b.type === "tool_result"));

  while (
    messages.length > 0 &&
    (messages.length > MAX_HISTORY_MESSAGES || JSON.stringify(messages).length > MAX_HISTORY_BYTES)
  ) {
    let cut = 1;
    while (cut < messages.length && !isPlainUser(messages[cut])) cut++;
    messages = messages.slice(cut);
  }
  while (messages.length > 0 && !isPlainUser(messages[0])) messages = messages.slice(1);

  // Repair any tool_use that isn't answered by the very next message (the
  // API rejects those). Only the final message may hold an open tool_use --
  // that's the proposal currently waiting on the user.
  const repaired: Anthropic.MessageParam[] = [];
  messages.forEach((m, i) => {
    repaired.push(m);
    if (m.role !== "assistant" || typeof m.content === "string" || i === messages.length - 1) return;
    const ids = m.content.filter((b: any) => b.type === "tool_use").map((b: any) => b.id as string);
    if (ids.length === 0) return;
    const next = messages[i + 1];
    const answered = new Set(
      next && next.role === "user" && Array.isArray(next.content)
        ? next.content.filter((b: any) => b.type === "tool_result").map((b: any) => b.tool_use_id)
        : []
    );
    const missing = ids.filter((id) => !answered.has(id));
    if (missing.length === 0) return;
    repaired.push({
      role: "user",
      content: missing.map((id) => ({ type: "tool_result" as const, tool_use_id: id, content: "The user did not run this command." })),
    });
  });
  return repaired;
}

function pendingToolUse(messages: Anthropic.MessageParam[]): Anthropic.ToolUseBlockParam | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || typeof last.content === "string") return null;
  return (last.content.find((b: any) => b.type === "tool_use") as Anthropic.ToolUseBlockParam) || null;
}

function formatToolOutput(r: { output: string; exitCode: number; cwd: string; truncated: boolean }): string {
  return `exit code: ${r.exitCode}\ncurrent folder: ${r.cwd}\n${r.truncated ? "(output truncated)\n" : ""}output:\n${r.output || "(no output)"}`;
}

export async function runShellTurn(opts: {
  userId: string;
  mode: ShellMode;
  cwd: string;
  history: Anthropic.MessageParam[];
  userText?: string;
  decision?: { toolUseId: string; approve: boolean; command?: string };
  emit: (e: ShellEvent) => void;
}): Promise<void> {
  const { userId, mode, emit } = opts;
  let cwd = opts.cwd;
  const messages = [...opts.history];
  let spent = 0;
  let balance = 0;

  const charge = async (credits: number) => {
    spent += credits;
    balance = await chargeCredits(userId, credits);
  };

  const execute = async (toolUse: Anthropic.ToolUseBlockParam, commandOverride?: string): Promise<string> => {
    const input = toolUse.input as any;
    if (toolUse.name === "share_file") {
      emit({ type: "file", path: String(input.path || "") });
      return "A download button was shown to the user.";
    }
    const command = (commandOverride ?? String(input.command || "")).trim();
    if (!command) return "No command given.";
    emit({ type: "command", command, explanation: String(input.explanation || ""), by: "ai" });
    const result = await runInSandbox(userId, command, cwd);
    cwd = result.cwd || cwd;
    await charge(SHELL_CREDITS_PER_COMMAND);
    emit({ type: "output", output: result.output, exitCode: result.exitCode, cwd, truncated: result.truncated });
    const edited = commandOverride && commandOverride.trim() !== String(input.command || "").trim();
    return (edited ? `(The user edited the command before running it. It ran as: ${command})\n` : "") + formatToolOutput(result);
  };

  // 1. Resolve a pending proposal (guide mode, or a risky command in auto).
  const pending = pendingToolUse(messages);
  if (pending) {
    let resultText: string;
    if (opts.decision && opts.decision.toolUseId === pending.id && opts.decision.approve) {
      resultText = await execute(pending, opts.decision.command);
    } else {
      emit({ type: "skipped", command: String((pending.input as any)?.command || "") });
      resultText = "The user chose not to run this command.";
    }
    const toolResult: Anthropic.ToolResultBlockParam = { type: "tool_result", tool_use_id: pending.id, content: resultText };
    if (opts.userText) {
      messages.push({ role: "user", content: [toolResult, { type: "text", text: opts.userText }] });
    } else {
      messages.push({ role: "user", content: [toolResult] });
    }
  } else if (opts.userText) {
    messages.push({ role: "user", content: opts.userText });
  } else {
    emit({ type: "error", error: "Nothing to do." });
    return;
  }

  // 2. Agent loop.
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 1 });
  try {
    for (let step = 0; step < MAX_STEPS_PER_TURN; step++) {
      const response = await anthropic.messages.create({
        model: SHELL_MODEL,
        max_tokens: 4096,
        system: systemPrompt(mode, cwd),
        tools: TOOLS,
        tool_choice: { type: "auto", disable_parallel_tool_use: true },
        messages,
      });
      await charge(shellCreditsForUsage(response.usage));

      messages.push({ role: "assistant", content: response.content as Anthropic.ContentBlockParam[] });
      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) emit({ type: "text", text: block.text });
      }

      const toolUse = response.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
      if (!toolUse || response.stop_reason !== "tool_use") break;

      const input = toolUse.input as any;
      const needsApproval = toolUse.name === "run_command" && (mode === "guide" || input?.risky === true);
      if (needsApproval) {
        emit({
          type: "proposal",
          toolUseId: toolUse.id,
          command: String(input?.command || ""),
          explanation: String(input?.explanation || ""),
          risky: input?.risky === true,
        });
        break;
      }

      const resultText = await execute(toolUse as Anthropic.ToolUseBlockParam);
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: resultText }] });

      if (step === MAX_STEPS_PER_TURN - 1) {
        emit({ type: "text", text: "_Paused after 10 steps. Say \"continue\" to keep going._" });
      }
    }
  } catch (error: any) {
    console.error("[shell] agent step failed:", error?.message || error);
    emit({ type: "error", error: "The AI had a problem. Please try again." });
  }

  // If we stopped right after running a tool (step cap or error), the
  // history ends on a user tool_result -- valid for the next turn, which
  // will append the user's next message to it.
  if (spent > 0) emit({ type: "credits", spent, balance });
  emit({ type: "state", messages, cwd });
}

/** One-shot plain-English explanation of a command (the "Explain" button). */
export async function explainCommand(userId: string, command: string, output?: string): Promise<{ text: string; spent: number; balance: number }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
  const response = await anthropic.messages.create({
    model: SHELL_MODEL,
    max_tokens: 700,
    system:
      "You explain Linux shell commands to complete beginners reading on a phone. Break the command into its parts (program, each flag, each argument) as a short bullet list, then one sentence on what it does overall. If output is given, add one or two sentences on what the output means. Flag anything dangerous. No preamble. Simple markdown only.",
    messages: [
      {
        role: "user",
        content: `Command:\n${command.slice(0, 2000)}${output ? `\n\nIts output:\n${output.slice(0, 3000)}` : ""}`,
      },
    ],
  });
  const spent = shellCreditsForUsage(response.usage);
  const balance = await chargeCredits(userId, spent);
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  return { text, spent, balance };
}
