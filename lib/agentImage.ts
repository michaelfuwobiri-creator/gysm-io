import { cleanRelPath } from "@/lib/agentCore";

// generate_image helpers. Pure parts are exported for tests; the network call
// is in generateAgentImage.

export const IMAGE_SIZES = {
  landscape: "1536x1024",
  square: "1024x1024",
  portrait: "1024x1536",
} as const;
export type ImageShape = keyof typeof IMAGE_SIZES;

export const MAX_IMAGE_PROMPT_CHARS = 1500;
export const MAX_GENERATED_BYTES = 1_800_000; // sites allow 2 MB per file

/** Checks generate_image arguments. Returns the clean values or an error for the model. */
export function checkImageArgs(args: any): { ok: true; prompt: string; path: string; shape: ImageShape } | { ok: false; error: string } {
  const prompt = typeof args?.prompt === "string" ? args.prompt.replace(/\s+/g, " ").trim() : "";
  if (!prompt) return { ok: false, error: "Describe the image in prompt." };
  if (prompt.length > MAX_IMAGE_PROMPT_CHARS) return { ok: false, error: `Prompt is too long (max ${MAX_IMAGE_PROMPT_CHARS} characters).` };
  const path = cleanRelPath(args?.path);
  if (!path) return { ok: false, error: "Invalid path. Use a relative path like 'my-site/images/hero.webp'." };
  if (!/\.webp$/i.test(path)) return { ok: false, error: "The path must end in .webp." };
  const shape: ImageShape = args?.shape === "square" || args?.shape === "portrait" ? args.shape : "landscape";
  return { ok: true, prompt, path, shape };
}

/** Text-to-image through the OpenAI key the app already uses. Returns WebP bytes. */
export async function generateAgentImage(prompt: string, shape: ImageShape): Promise<Buffer> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Image generation isn't configured.");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: IMAGE_SIZES[shape], quality: "medium", output_format: "webp", output_compression: 80, n: 1 }),
    signal: AbortSignal.timeout(110_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Content-policy refusals come back as 400s: tell the model so it can rephrase.
    if (res.status === 400) throw new Error(`The image request was refused (${text.slice(0, 200)}). Rephrase the prompt.`);
    throw new Error(`Image service error (${res.status}).`);
  }
  const data = (await res.json()) as any;
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("The image service returned no image.");
  return Buffer.from(b64, "base64");
}
