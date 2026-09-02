// ElevenLabs -- voice cloning + narration in a cloned voice. REST docs:
// https://elevenlabs.io/docs/api-reference
//
// cloneVoice() expects a publicly reachable sample-audio URL (matching
// the pattern the rest of this feature uses -- generated assets are
// referenced by URL, not uploaded as raw multipart form data through our
// own API). speakWithVoice() is synchronous.
export function isElevenLabsConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

export async function cloneVoice(name: string, sampleAudioUrl: string): Promise<{ voiceId: string }> {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not set.");
  }
  const sampleRes = await fetch(sampleAudioUrl);
  if (!sampleRes.ok) {
    throw new Error(`Could not fetch sample audio (${sampleRes.status}).`);
  }
  const sampleBlob = await sampleRes.blob();

  const form = new FormData();
  form.append("name", name);
  form.append("files", sampleBlob, "sample.mp3");

  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ElevenLabs voice-clone request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as any;
  if (!data?.voice_id) {
    throw new Error("ElevenLabs response did not include a voice_id.");
  }
  return { voiceId: data.voice_id };
}

export async function speakWithVoice(voiceId: string, text: string): Promise<{ audioBase64: string; mimeType: string }> {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not set.");
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs speech request failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return { audioBase64: Buffer.from(arrayBuffer).toString("base64"), mimeType: "audio/mpeg" };
}
