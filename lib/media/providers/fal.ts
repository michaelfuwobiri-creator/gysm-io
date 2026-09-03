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
// Export Controls (42-tool spec, layer 7, item 39) -- real FFMPEG-backed
// utility endpoints (verified 2026-09-03 against fal.ai/models/fal-ai/
// workflow-utilities/scale-video and .../trim-video's live API docs),
// not a generative model: deterministic crop/resize/trim, priced at
// Fal's $0.001/compute-second, effectively free next to every other
// kind in this file. Complements @reframe (Replicate's Luma model,
// subject-aware AI reframing, 800 credits, 10s input cap) rather than
// duplicating it -- this is the "just fit it to the platform's exact
// dimensions" utility path, no AI framing decisions, no duration cap.
const FAL_SCALE_VIDEO_MODEL = "fal-ai/workflow-utilities/scale-video";
const FAL_TRIM_VIDEO_MODEL = "fal-ai/workflow-utilities/trim-video";

export type ExportPreset = "16:9" | "9:16" | "1:1";

const EXPORT_PRESET_DIMENSIONS: Record<ExportPreset, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

async function callFalWorkflowUtility(model: string, body: Record<string, unknown>): Promise<{ url: string }> {
  if (!process.env.FAL_API_KEY) {
    throw new Error("FAL_API_KEY is not set.");
  }
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
  const url = data?.video?.url;
  if (!url) {
    throw new Error("Fal.ai response did not include a video URL.");
  }
  return { url };
}

// Scales/center-crops a video to a named platform preset's exact
// dimensions (e.g. "9:16" -> 1080x1920), mode "crop" so the result
// always fills the target frame instead of letterboxing.
export async function scaleVideoToPreset(videoUrl: string, preset: ExportPreset): Promise<{ url: string }> {
  const { width, height } = EXPORT_PRESET_DIMENSIONS[preset];
  return callFalWorkflowUtility(FAL_SCALE_VIDEO_MODEL, { video_url: videoUrl, width, height, mode: "crop" });
}

// Trims a video to [startTime, endTime] seconds -- exposed for future
// export-flow steps (e.g. a trim-then-resize chain); not yet wired into
// a builder skill on its own.
export async function trimVideo(videoUrl: string, startTime: number, endTime: number): Promise<{ url: string }> {
  return callFalWorkflowUtility(FAL_TRIM_VIDEO_MODEL, { video_url: videoUrl, start_time: startTime, end_time: endTime });
}
// Virtual Try-On (42-tool spec, layer 3, item 17) -- real, commercial-use
// endpoint verified 2026-09-03 against fal.ai/models/fal-ai/fashn/tryon/
// v1.6's live API docs: model_image (person photo) + garment_image
// (clothing photo) -> images:[{url}]. $0.075/generation. Category left
// at "auto" (FASHN detects tops/bottoms/one-pieces itself) -- not
// exposing the picker in v1 UI, real API supports more if ever needed.
const FAL_VIRTUAL_TRY_ON_MODEL = "fal-ai/fashn/tryon/v1.6";

export async function virtualTryOn(modelImageUrl: string, garmentImageUrl: string): Promise<{ url: string }> {
  if (!process.env.FAL_API_KEY) {
    throw new Error("FAL_API_KEY is not set.");
  }
  const res = await fetch(`https://fal.run/${FAL_VIRTUAL_TRY_ON_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model_image: modelImageUrl, garment_image: garmentImageUrl, category: "auto" }),
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
// Image Outpainting / Object Removal (42-tool spec, layer 4/5, items 26
// and 31) -- both are the same real operation, FLUX.1 [pro] Fill
// inpainting (verified 2026-09-03 against fal.ai/models/fal-ai/
// flux-pro/v1/fill's live API docs: commercial-use, Partner tier,
// $0.05/megapixel, image_url + mask_url + prompt -> images:[{url}]).
// mask convention is standard FLUX Fill: white = area to repaint, black
// = area to keep unchanged. Building the image/mask pair (drawn brush
// strokes for object removal, padded canvas for outpainting) happens
// client-side in the builder -- this function just calls the model.
const FAL_FILL_MODEL = "fal-ai/flux-pro/v1/fill";

export async function inpaintImage(imageUrl: string, maskUrl: string, prompt: string): Promise<{ url: string }> {
  if (!process.env.FAL_API_KEY) {
    throw new Error("FAL_API_KEY is not set.");
  }
  const res = await fetch(`https://fal.run/${FAL_FILL_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image_url: imageUrl, mask_url: maskUrl, prompt }),
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
