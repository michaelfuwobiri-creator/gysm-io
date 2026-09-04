import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed } from "@/lib/media/service";
import { isolateVoice } from "@/lib/media/providers/elevenlabs";

// POST { audioUrl: string } -> { id, audioUrl }. Synchronous -- ElevenLabs'
// audio-isolation endpoint runs inline, same bucket as voice-clone.
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("voice-enhance");
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

  const id = await insertGeneration({ userId: user.id, kind: "voice-enhance", provider: "elevenlabs", cost, input: { audioUrl } });

  try {
    const { audioBase64, mimeType } = await isolateVoice(audioUrl);
    const outUrl = `data:${mimeType};base64,${audioBase64}`;
    await markDone(id, outUrl);
    return Response.json({ id, audioUrl: outUrl });
  } catch (error: any) {
    console.error("[media/voice-enhance] generation failed:", error.message);
    await markFailed(id, user, cost, "voice-enhance", error.message);
    return Response.json({ error: "Voice enhancement failed. Your credits were refunded." }, { status: 502 });
  }
}
