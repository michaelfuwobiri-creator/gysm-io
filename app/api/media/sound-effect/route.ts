import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed } from "@/lib/media/service";
import { generateSoundEffect } from "@/lib/media/providers/elevenlabs";

// POST { text: string, durationSeconds?: number } -> { id, audioUrl }.
// Synchronous -- ElevenLabs' sound-generation endpoint is fast enough to
// run inline, same bucket as tts.
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("sound-effect");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let text = "";
  let durationSeconds: number | undefined;
  try {
    const body = await req.json();
    text = (body?.text ?? "").toString().trim().slice(0, 500);
    durationSeconds = body?.durationSeconds ? Number(body.durationSeconds) : undefined;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!text) {
    return Response.json({ error: 'A description is required (e.g. "whoosh, cinematic hit").' }, { status: 400 });
  }

  const id = await insertGeneration({ userId: user.id, kind: "sound-effect", provider: "elevenlabs", cost, input: { text, durationSeconds } });

  try {
    const { audioBase64, mimeType } = await generateSoundEffect(text, durationSeconds);
    const audioUrl = `data:${mimeType};base64,${audioBase64}`;
    await markDone(id, audioUrl);
    return Response.json({ id, audioUrl });
  } catch (error: any) {
    console.error("[media/sound-effect] generation failed:", error.message);
    await markFailed(id, user.id, cost, error.message);
    return Response.json({ error: "Sound effect generation failed. Your credits were refunded." }, { status: 502 });
  }
}
