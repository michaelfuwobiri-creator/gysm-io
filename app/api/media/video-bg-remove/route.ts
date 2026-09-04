import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markProcessing, markFailed } from "@/lib/media/service";
import { createPrediction, REPLICATE_MODELS } from "@/lib/media/providers/replicate";

// POST { videoUrl: string } -> { id, status: "processing" }. Async, same
// pattern as /api/media/reframe -- arielreplicate/robust_video_matting
// (see lib/media/providers/replicate.ts) is a real Replicate prediction.
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("video-bg-remove");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let videoUrl = "";
  try {
    const body = await req.json();
    videoUrl = (body?.videoUrl ?? "").toString().trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!videoUrl) {
    return Response.json({ error: "videoUrl is required." }, { status: 400 });
  }

  const id = await insertGeneration({ userId: user.id, kind: "video-bg-remove", provider: "replicate", cost, input: { videoUrl } });

  try {
    const created = await createPrediction(REPLICATE_MODELS["video-bg-remove"], { input_video: videoUrl });
    await markProcessing(id, created.id);
    return Response.json({ id, status: "processing" }, { status: 202 });
  } catch (error: any) {
    console.error("[media/video-bg-remove] generation failed:", error.message);
    await markFailed(id, user, cost, "video-bg-remove", error.message);
    return Response.json({ error: "Background removal failed to start. Your credits were refunded." }, { status: 502 });
  }
}
