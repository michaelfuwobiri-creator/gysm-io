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
// Real, verified model (confirmed 2026-09-03 against
// fal.ai/models/fal-ai/flux/dev/image-to-image/api): input
// { image_url, prompt, strength? }, same output shape
// ({ images: [{ url }] }) as the text-to-image endpoint below, so
// generateImage() can share one response-parsing path for both. Used
// when a referenceImageUrl is passed in -- i.e. Asset Management's
// Cast/Settings/Objects (see lib/mediaAssets.ts) or any attached image
// -- for actual image-to-image generation instead of a fresh render
// that ignores the reference (closes 42-tool-spec Layer 1 item 4,
// "Image-to-Image / Omni Reference", to the extent a single
// image-conditioned diffusion pass gets you -- this is real
// image-to-image, not the stronger multi-shot identity-lock Google
// Flow's own "Ingredients" feature does).
const FAL_IMAGE_TO_IMAGE_MODEL = "fal-ai/flux/dev/image-to-image";

export function isFalConfigured(): boolean {
  return !!process.env.FAL_API_KEY;
}

export async function generateImage(prompt: string, referenceImageUrl?: string): Promise<{ url: string }> {
  if (!process.env.FAL_API_KEY) {
    throw new Error("FAL_API_KEY is not set.");
  }
  const model = referenceImageUrl ? FAL_IMAGE_TO_IMAGE_MODEL : FAL_MODEL;
  const body = referenceImageUrl ? { prompt, image_url: referenceImageUrl } : { prompt, image_size: "landscape_16_9" };
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
