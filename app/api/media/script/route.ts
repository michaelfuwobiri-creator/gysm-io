import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed } from "@/lib/media/service";
import { generateScript } from "@/lib/media/providers/openaiText";

// POST { topic: string, style?: string } -> { id, text }. Synchronous --
// a chat completion is fast enough to run inline, same bucket as
// captions/tts.
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("script");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let topic = "";
  let style: string | undefined;
  try {
    const body = await req.json();
    topic = (body?.topic ?? "").toString().trim().slice(0, 500);
    style = body?.style ? body.style.toString().trim().slice(0, 100) : undefined;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!topic) {
    return Response.json({ error: "A topic is required." }, { status: 400 });
  }

  const id = await insertGeneration({ userId: user.id, kind: "script", provider: "openai", cost, input: { topic, style } });

  try {
    const { text } = await generateScript(topic, style);
    // Same convention captions/route.ts uses for text-shaped output --
    // no single "output URL" the way an image/video has, so store the
    // text itself as a data URL to fit the shared output_url column.
    const dataUrl = "data:text/plain;base64," + Buffer.from(text).toString("base64");
    await markDone(id, dataUrl);
    return Response.json({ id, text });
  } catch (error: any) {
    console.error("[media/script] generation failed:", error.message);
    await markFailed(id, user.id, cost, error.message);
    return Response.json({ error: "Script generation failed. Your credits were refunded." }, { status: 502 });
  }
}
