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

// Real, verified endpoint (confirmed 2026-09-03 against
// elevenlabs.io/docs/api-reference/text-to-sound-effects/convert):
// POST /v1/sound-generation, { text, duration_seconds? }, returns raw
// MP3 bytes (same shape as speakWithVoice below). Sound Effects
// Generator, 42-tool spec layer 4 item 22.
export async function generateSoundEffect(text: string, durationSeconds?: number): Promise<{ audioBase64: string; mimeType: string }> {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not set.");
  }
  const body: Record<string, unknown> = { text };
  if (durationSeconds) body.duration_seconds = Math.min(30, Math.max(0.5, durationSeconds));
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs sound-generation request failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return { audioBase64: Buffer.from(arrayBuffer).toString("base64"), mimeType: "audio/mpeg" };
}

// Real, verified endpoint (confirmed 2026-09-03 against
// elevenlabs.io/docs/api-reference/audio-isolation/convert): POST
// /v1/audio-isolation, multipart form with an `audio` file, returns raw
// isolated-voice audio bytes. Voice Enhancement / Noise Removal,
// 42-tool spec layer 4 item 21.
export async function isolateVoice(audioUrl: string): Promise<{ audioBase64: string; mimeType: string }> {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not set.");
  }
  const sourceRes = await fetch(audioUrl);
  if (!sourceRes.ok) {
    throw new Error(`Could not fetch source audio (${sourceRes.status}).`);
  }
  const sourceBlob = await sourceRes.blob();

  const form = new FormData();
  form.append("audio", sourceBlob, "audio.mp3");

  const res = await fetch("https://api.elevenlabs.io/v1/audio-isolation", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs audio-isolation request failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return { audioBase64: Buffer.from(arrayBuffer).toString("base64"), mimeType: "audio/mpeg" };
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
