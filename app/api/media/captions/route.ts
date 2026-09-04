import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed } from "@/lib/media/service";
import { transcribeAudio } from "@/lib/media/providers/openaiAudio";

// POST { audioUrl: string } -> { id, vtt, text }. Synchronous (Whisper
// transcription is fast enough to run inline).
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("captions");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let audioUrl = "";
  try {
    const body = await req.json();
    audioUrl = (body?.audioUrl ?? "").toString().trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!audioUrl) {
    return Response.json({ error: "audioUrl is required." }, { status: 400 });
  }

  const id = await insertGeneration({ userId: user.id, kind: "captions", provider: "openai", cost, input: { audioUrl } });

  try {
    const { text, vtt } = await transcribeAudio(audioUrl);
    // Captions have no single "output URL" the way an image/video does --
    // store the VTT itself as a data URL so it fits the same output_url
    // column every other kind uses.
    const dataUrl = "data:text/vtt;base64," + Buffer.from(vtt).toString("base64");
    await markDone(id, dataUrl);
    return Response.json({ id, text, vtt });
  } catch (error: any) {
    console.error("[media/captions] generation failed:", error.message);
    await markFailed(id, user, cost, "captions", error.message);
    return Response.json({ error: "Captioning failed. Your credits were refunded." }, { status: 502 });
  }
}
