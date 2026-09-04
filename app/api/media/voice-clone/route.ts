import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed } from "@/lib/media/service";
import { cloneVoice, speakWithVoice } from "@/lib/media/providers/elevenlabs";

// POST { sampleAudioUrl: string, text: string, voiceName?: string }
// -> { id, audioUrl, voiceId }. Clones a voice from the sample, then
// immediately speaks `text` in it. voiceId is returned so a caller can
// reuse the same cloned voice for later requests without re-cloning
// (ElevenLabs charges per clone, not per use).
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("voice-clone");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let sampleAudioUrl = "";
  let text = "";
  let voiceName = "";
  try {
    const body = await req.json();
    sampleAudioUrl = (body?.sampleAudioUrl ?? "").toString().trim();
    text = (body?.text ?? "").toString().trim().slice(0, 4000);
    voiceName = (body?.voiceName ?? "GYSM cloned voice").toString().slice(0, 60);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!sampleAudioUrl || !text) {
    return Response.json({ error: "sampleAudioUrl and text are required." }, { status: 400 });
  }

  const id = await insertGeneration({
    userId: user.id,
    kind: "voice-clone",
    provider: "elevenlabs",
    cost,
    input: { sampleAudioUrl, text, voiceName },
  });

  try {
    const { voiceId } = await cloneVoice(voiceName, sampleAudioUrl);
    const { audioBase64, mimeType } = await speakWithVoice(voiceId, text);
    const audioUrl = `data:${mimeType};base64,${audioBase64}`;
    await markDone(id, audioUrl);
    return Response.json({ id, audioUrl, voiceId });
  } catch (error: any) {
    console.error("[media/voice-clone] generation failed:", error.message);
    await markFailed(id, user, cost, "voice-clone", error.message);
    return Response.json({ error: "Voice cloning failed. Your credits were refunded." }, { status: 502 });
  }
}
