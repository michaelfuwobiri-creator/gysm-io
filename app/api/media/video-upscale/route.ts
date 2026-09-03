import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markProcessing, markFailed } from "@/lib/media/service";
import { createPrediction, REPLICATE_MODELS } from "@/lib/media/providers/replicate";

const VALID_RESOLUTIONS = ["FHD", "2k", "4k"];

// POST { videoUrl: string, resolution: "FHD" | "2k" | "4k" } -> { id, status: "processing" }.
// Async, same pattern as /api/media/reframe -- lucataco/real-esrgan-video
// (see lib/media/providers/replicate.ts) is a real Replicate prediction
// that can take up to several minutes for longer clips, so this returns
// immediately and the client polls GET /api/media/[id]/status.
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("video-upscale");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let videoUrl = "";
  let resolution = "";
  try {
    const body = await req.json();
    videoUrl = (body?.videoUrl ?? "").toString().trim();
    resolution = (body?.resolution ?? "").toString().trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!videoUrl) {
    return Response.json({ error: "videoUrl is required." }, { status: 400 });
  }
  if (!VALID_RESOLUTIONS.includes(resolution)) {
    return Response.json({ error: `resolution must be one of: ${VALID_RESOLUTIONS.join(", ")}` }, { status: 400 });
  }

  const id = await insertGeneration({
    userId: user.id,
    kind: "video-upscale",
    provider: "replicate",
    cost,
    input: { videoUrl, resolution },
  });

  try {
    const created = await createPrediction(REPLICATE_MODELS["video-upscale"], {
      video_path: videoUrl,
      resolution,
    });
    await markProcessing(id, created.id);
    return Response.json({ id, status: "processing" }, { status: 202 });
  } catch (error: any) {
    console.error("[media/video-upscale] generation failed:", error.message);
    await markFailed(id, user.id, cost, error.message);
    return Response.json({ error: "Upscale failed to start. Your credits were refunded." }, { status: 502 });
  }
}
