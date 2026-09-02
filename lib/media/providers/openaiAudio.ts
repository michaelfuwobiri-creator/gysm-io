// OpenAI Whisper (transcription/captions) + OpenAI TTS -- reuses the
// existing OPENAI_API_KEY already configured for the builder's
// generation pipeline (see lib/ai/orchestrator.ts), no new account
// needed. Both are synchronous single-request calls.
export function isOpenAiAudioConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function transcribeAudio(audioUrl: string): Promise<{ text: string; vtt: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Could not fetch source audio (${audioRes.status}).`);
  }
  const audioBlob = await audioRes.blob();

  const form = new FormData();
  form.append("file", audioBlob, "audio.mp3");
  form.append("model", "whisper-1");
  form.append("response_format", "vtt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Whisper request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const vtt = await res.text();
  const text = vtt
    .split("\n")
    .filter((line) => line && !line.includes("-->") && line !== "WEBVTT")
    .join(" ")
    .trim();
  return { text, vtt };
}

export async function textToSpeech(text: string, voice: string = "alloy"): Promise<{ audioBase64: string; mimeType: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "tts-1", voice, input: text }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS request failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return { audioBase64: Buffer.from(arrayBuffer).toString("base64"), mimeType: "audio/mpeg" };
}
