import { usageBlockedError } from "@/lib/planUsage";
import { getUser } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits";
import { AGENT_MIN_BALANCE } from "@/lib/credits-constants";
import { cleanLocalFolderName, sanitizeHistory } from "@/lib/agentCore";
import { runAgentTurn, type AgentEvent } from "@/lib/agent";
import { loadMemoryBlock } from "@/lib/agentMemory";
import { cleanAttachments } from "@/lib/agentAttachCore";

// GYSM Agent turn. Streams NDJSON AgentEvents (see lib/agent.ts).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "GYSM Agent isn't configured yet." }, { status: 503 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userText = typeof body?.text === "string" ? body.text.trim().slice(0, 8000) : "";
  const decision =
    body?.decision && typeof body.decision.toolCallId === "string"
      ? {
          toolCallId: body.decision.toolCallId as string,
          approve: body.decision.approve === true,
          // Secrets (set_env values) travel only in this one request; they are
          // never added to the conversation history sent to the model.
          secret: typeof body.decision.secret === "string" ? body.decision.secret.slice(0, 4000) : undefined,
        }
      : undefined;

  const localFolder = cleanLocalFolderName(body?.localFolder);
  const clientResult =
    body?.clientResult && typeof body.clientResult.toolCallId === "string"
      ? {
          toolCallId: body.clientResult.toolCallId as string,
          ok: body.clientResult.ok === true,
          output: typeof body.clientResult.output === "string" ? body.clientResult.output.slice(0, 120_000) : "",
          declined: body.clientResult.declined === true,
        }
      : undefined;

  const att = cleanAttachments(body?.attachments);
  if (att.error) return Response.json({ error: att.error }, { status: 400 });

  if (!userText && !decision && !clientResult && att.files.length === 0) {
    return Response.json({ error: "Tell the agent what to build." }, { status: 400 });
  }

  const balance = await getCreditBalance(user.id);
  if (balance < AGENT_MIN_BALANCE) {
    return Response.json(await usageBlockedError(user.id), { status: 402 });
  }

  const history = sanitizeHistory(body?.messages);
  const memory = await loadMemoryBlock(user.id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* the browser stopped listening (Stop pressed or tab closed) */
        }
      };
      try {
        await runAgentTurn({ userId: user.id, history, userText: userText || undefined, decision, localFolder, clientResult, memory, browser: body?.browser === true, attachments: att.files, signal: req.signal, emit });
      } catch (error: any) {
        console.error("[agent] turn failed:", error?.message || error);
        emit({ type: "error", error: "Couldn't reach your workspace. Please try again in a moment." });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
