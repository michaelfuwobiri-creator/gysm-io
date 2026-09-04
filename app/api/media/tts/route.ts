import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed } from "@/lib/media/service";
import { textToSpeech } from "@/lib/media/providers/openaiAudio";

// POST { text: string, voice?: string } -> { id, audioUrl } (a data:
// URL -- see the note in lib/media/providers/openaiAudio.ts about not
// having object storage configured yet).
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("tts");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let text = "";
  let voice = "alloy";
  try {
    const body = await req.json();
    text = (body?.text ?? "").toString().trim().slice(0, 4000);
    voice = (body?.voice ?? "alloy").toString();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!text) {
    return Response.json({ error: "Text is required." }, { status: 400 });
  }

  const id = await insertGeneration({ userId: user.id, kind: "tts", provider: "openai", cost, input: { text, voice } });

  try {
    const { audioBase64, mimeType } = await textToSpeech(text, voice);
    const audioUrl = `data:${mimeType};base64,${audioBase64}`;
    await markDone(id, audioUrl);
    return Response.json({ id, audioUrl });
  } catch (error: any) {
    console.error("[media/tts] generation failed:", error.message);
    await markFailed(id, user, cost, "tts", error.message);
    return Response.json({ error: "Text-to-speech failed. Your credits were refunded." }, { status: 502 });
  }
}
