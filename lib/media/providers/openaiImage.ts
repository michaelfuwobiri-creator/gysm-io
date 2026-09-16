// OpenAI image generation (gpt-image-1) -- a fallback for plain
// text-to-image when FAL_API_KEY isn't configured but OPENAI_API_KEY
// already is. OPENAI_API_KEY already powers the core builder AI (see
// lib/ai/orchestrator.ts) and is confirmed live in production, while
// FAL_API_KEY has repeatedly failed to take effect for this account --
// so this lets "generate an image of X" work today on the key that's
// already proven to work, instead of staying blocked on a second
// provider account.
//
// Deliberately narrower than Fal: this only covers from-scratch
// generation. Image-to-image (a referenceImageUrl attached -- Asset
// Management's Cast/Settings/Objects, see lib/mediaAssets.ts) still
// requires Fal specifically; OpenAI's Images API doesn't do the same
// reference-conditioned diffusion Fal's flux/dev/image-to-image model
// does, and building an edit-mask equivalent here is out of scope.
// app/api/media/image/route.ts picks Fal when configured (it's the
// strictly more capable provider) and only falls back to this when
// Fal isn't available.
//
// gpt-image-1 returns base64 image data by default (no response_format
// param needed/supported the way dall-e-2/3 accepted "url"), confirmed
// against developers.openai.com/api/reference/resources/images (Sep
// 2026) -- so this returns a data: URL, the same "no object storage
// configured yet" pattern lib/media/providers/openaiAudio.ts already
// uses for TTS.
export function isOpenAiImageConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function generateImageOpenAI(prompt: string): Promise<{ url: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1536x1024",
      n: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI image request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as any;
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI image response did not include image data.");
  }
  return { url: `data:image/png;base64,${b64}` };
}
