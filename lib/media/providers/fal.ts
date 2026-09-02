// Fal.ai -- image generation. REST docs: https://fal.ai/docs
//
// Uses the synchronous `fal.run` endpoint (blocks until the image is
// ready) rather than the async queue API, since image generation is
// fast enough to treat as a synchronous request in our route -- see
// SYNCHRONOUS_MEDIA_KINDS in lib/mediaCreditsConstants.ts.
//
// Not yet exercised against a live key (no FAL_API_KEY in this
// environment) -- this follows Fal's documented request/response shape,
// but the exact model slug and any required extra params should be
// double-checked against https://fal.ai/models once real generations
// are tested, and adjusted if the response shape differs.
const FAL_MODEL = "fal-ai/flux/dev";

export function isFalConfigured(): boolean {
  return !!process.env.FAL_API_KEY;
}

export async function generateImage(prompt: string): Promise<{ url: string }> {
  if (!process.env.FAL_API_KEY) {
    throw new Error("FAL_API_KEY is not set.");
  }
  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, image_size: "landscape_16_9" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fal.ai request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as any;
  const url = data?.images?.[0]?.url;
  if (!url) {
    throw new Error("Fal.ai response did not include an image URL.");
  }
  return { url };
}
