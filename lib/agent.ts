import OpenAI from "openai";
import { chargeCredits } from "@/lib/credits";
import {
  AGENT_CREDITS_PER_COMMAND,
  AGENT_CREDITS_PER_DEPLOY,
  AGENT_MODEL,
  agentCreditsForUsage,
} from "@/lib/credits-constants";
import {
  AGENT_TOOLS,
  MAX_STEPS_PER_TURN,
  describeCall,
  isRiskyCommand,
  needsApproval,
  pendingToolCall,
  systemPrompt,
  type ChatMessage,
} from "@/lib/agentCore";
import { executeTool } from "@/lib/agentTools";

// GYSM Agent loop. The conversation (OpenAI chat format) lives in the
// browser and is sent back each turn. Tools that change something outside
// the workspace (deploy, create_db_table, risky commands) stop the loop with
// a `proposal`; the next request carries a `decision` that runs or rejects it.

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool"; toolCallId: string; name: string; summary: string }
  | { type: "tool_result"; toolCallId: string; name: string; ok: boolean; output: string }
  | { type: "proposal"; toolCallId: string; name: string; summary: string; detail: string; risky: boolean }
  | { type: "declined"; toolCallId: string; name: string }
  | { type: "credits"; spent: number; balance: number }
  | { type: "state"; messages: ChatMessage[] }
  | { type: "error"; error: string; code?: string };

const RESULT_UI_MAX = 4000;

function proposalDetail(name: string, args: any): string {
  if (name === "create_db_table") return String(args?.sql ?? "").slice(0, 6000);
  if (name === "run_command") return String(args?.cmd ?? "").slice(0, 2000);
  if (name === "deploy") return `Folder: ${String(args?.project ?? "")}`;
  return "";
}

export async function runAgentTurn(opts: {
  userId: string;
  history: ChatMessage[];
  userText?: string;
  decision?: { toolCallId: string; approve: boolean };
  emit: (e: AgentEvent) => void;
}): Promise<void> {
  const { userId, emit } = opts;
  const messages: ChatMessage[] = [...opts.history];
  let spent = 0;
  let balance = 0;

  const charge = async (credits: number) => {
    if (credits <= 0) return;
    spent += credits;
    balance = await chargeCredits(userId, credits);
  };

  const run = async (id: string, name: string, args: any): Promise<string> => {
    emit({ type: "tool", toolCallId: id, name, summary: describeCall(name, args) });
    const result = await executeTool(userId, name, args);
    if (result.creditsKind === "command") await charge(AGENT_CREDITS_PER_COMMAND);
    if (result.creditsKind === "deploy") await charge(AGENT_CREDITS_PER_DEPLOY);
    if (result.creditsKind === "db") await charge(AGENT_CREDITS_PER_COMMAND);
    emit({ type: "tool_result", toolCallId: id, name, ok: result.ok, output: result.output.slice(0, RESULT_UI_MAX) });
    return result.output;
  };

  // 1. Resolve a pending proposal.
  const pending = pendingToolCall(messages);
  if (pending) {
    let resultText: string;
    // Re-check on the server that this call really is one that needs
    // approval; anything else in a pending slot is just executed normally.
    if (opts.decision && opts.decision.toolCallId === pending.id && opts.decision.approve) {
      resultText = await run(pending.id, pending.name, pending.args);
    } else {
      emit({ type: "declined", toolCallId: pending.id, name: pending.name });
      resultText = "The user declined this action. Do not retry it; ask what they'd like instead.";
    }
    messages.push({ role: "tool", tool_call_id: pending.id, content: resultText });
    if (opts.userText) messages.push({ role: "user", content: opts.userText });
  } else if (opts.userText) {
    messages.push({ role: "user", content: opts.userText });
  } else {
    emit({ type: "error", error: "Nothing to do." });
    return;
  }

  // 2. Agent loop.
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  try {
    for (let step = 0; step < MAX_STEPS_PER_TURN; step++) {
      const response = await openai.chat.completions.create({
        model: AGENT_MODEL,
        messages: [{ role: "system", content: systemPrompt() }, ...(messages as any[])],
        tools: AGENT_TOOLS as any,
        parallel_tool_calls: false,
        max_completion_tokens: 8000,
      });
      if (response.usage) await charge(agentCreditsForUsage(response.usage));
      else await charge(1);

      const msg = response.choices[0]?.message;
      if (!msg) break;
      const call = msg.tool_calls?.find((t: any) => t.type === "function") as any;
      const assistant: ChatMessage = { role: "assistant", content: msg.content ?? null };
      if (call) assistant.tool_calls = [{ id: call.id, type: "function", function: { name: call.function.name, arguments: call.function.arguments || "{}" } }];
      messages.push(assistant);
      if (msg.content && msg.content.trim()) emit({ type: "text", text: msg.content });
      if (!call) break;

      let args: any = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        messages.push({ role: "tool", tool_call_id: call.id, content: "Your arguments were not valid JSON. Try again." });
        continue;
      }
      const name: string = call.function.name;

      if (needsApproval(name, args)) {
        emit({
          type: "proposal",
          toolCallId: call.id,
          name,
          summary: describeCall(name, args),
          detail: proposalDetail(name, args),
          risky: name === "run_command" ? isRiskyCommand(String(args?.cmd ?? ""), args?.risky === true) : true,
        });
        break; // wait for the user's decision
      }

      const out = await run(call.id, name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: out });

      if (step === MAX_STEPS_PER_TURN - 1) {
        emit({ type: "text", text: `_Paused after ${MAX_STEPS_PER_TURN} steps. Say "continue" to keep going._` });
      }
    }
  } catch (error: any) {
    console.error("[agent] step failed:", error?.message || error);
    emit({ type: "error", error: "The agent hit a problem. Please try again." });
  }

  // Never hand the browser a history that ends on an unanswered tool result
  // loop break: the next request's sanitizeHistory repairs open calls, so
  // just return what we have.
  emit({ type: "credits", spent, balance });
  emit({ type: "state", messages });
}
