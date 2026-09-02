// Replicate -- video, background music, and image-edit models (upscale,
// background removal, reframe). REST docs: https://replicate.com/docs/reference/http
//
// Async by nature: createPrediction() returns immediately with a
// "starting" prediction; the caller polls getPrediction() (wired up via
// GET /api/media/[id]/status) until status is "succeeded" or "failed".
//
// Model versions below are placeholders for "a reasonable current model
// in this category" -- Replicate model versions change over time, so
// confirm the exact version hash on the model's page before relying on
// this in production; wrong/stale version hashes are the most likely
// first bug once real testing starts.
export const REPLICATE_MODELS: Record<"video" | "music" | "upscale" | "bg-remove" | "reframe", string> = {
  video: "minimax/video-01",
  music: "meta/musicgen",
  upscale: "nightmareai/real-esrgan",
  "bg-remove": "cjwbw/rembg",
  // Real, verified model (confirmed 2026-09-02 against replicate.com/luma/reframe-video/api/schema):
  // input { video_url, aspect_ratio, prompt? }, output a single video uri.
  // Official Luma model, $0.06/sec of output video, 10s max input duration.
  reframe: "luma/reframe-video",
};

export function isReplicateConfigured(): boolean {
  return !!process.env.REPLICATE_API_TOKEN;
}

export async function createPrediction(model: string, input: Record<string, unknown>): Promise<{ id: string; status: string }> {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN is not set.");
  }
  const res = await fetch("https://api.replicate.com/v1/models/" + model + "/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait=0",
    },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Replicate request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as any;
  return { id: data.id, status: data.status };
}

export async function getPrediction(id: string): Promise<{ status: string; output: unknown; error: string | null }> {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN is not set.");
  }
  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Replicate status check failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as any;
  return { status: data.status, output: data.output, error: data.error ?? null };
}
