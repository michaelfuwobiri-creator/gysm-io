import { getUser } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits";
import { SHELL_MIN_BALANCE_FOR_AI } from "@/lib/credits-constants";
import { runShellTurn, sanitizeHistory, type ShellEvent, type ShellMode } from "@/lib/shell/agent";

// GYSM Shell agent turn. Streams NDJSON ShellEvents (see lib/shell/agent.ts)
// so the phone UI shows each command and its output as it happens. A turn
// can run several model calls + sandbox commands, hence the long limit.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "GYSM Shell isn't configured yet." }, { status: 503 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const mode: ShellMode = body?.mode === "auto" ? "auto" : "guide";
  const cwd = typeof body?.cwd === "string" ? body.cwd.slice(0, 500) : "";
  const userText = typeof body?.text === "string" ? body.text.trim().slice(0, 8000) : "";
  const decision =
    body?.decision && typeof body.decision.toolUseId === "string"
      ? {
          toolUseId: body.decision.toolUseId as string,
          approve: body.decision.approve === true,
          command: typeof body.decision.command === "string" ? body.decision.command.slice(0, 8000) : undefined,
        }
      : undefined;

  if (!userText && !decision) {
    return Response.json({ error: "Type what you'd like to do." }, { status: 400 });
  }

  const balance = await getCreditBalance(user.id);
  if (balance < SHELL_MIN_BALANCE_FOR_AI) {
    return Response.json({ error: "You're out of credits.", code: "NO_CREDITS" }, { status: 402 });
  }

  const history = sanitizeHistory(body?.messages);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ShellEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runShellTurn({ userId: user.id, mode, cwd, history, userText: userText || undefined, decision, emit });
      } catch (error: any) {
        console.error("[shell/agent] turn failed:", error?.message || error);
        emit({ type: "error", error: "Couldn't reach your workspace. Please try again in a moment." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
