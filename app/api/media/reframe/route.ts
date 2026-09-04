import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markProcessing, markFailed } from "@/lib/media/service";
import { createPrediction, REPLICATE_MODELS } from "@/lib/media/providers/replicate";

const VALID_ASPECT_RATIOS = ["9:16", "1:1", "16:9"];

// POST { videoUrl: string, aspectRatio: "9:16" | "1:1" | "16:9" } -> { id, status: "processing" }.
// Async, same pattern as /api/media/video -- Luma's reframe-video model
// (see lib/media/providers/replicate.ts) runs as a real Replicate
// prediction, not an inline op, so this returns immediately and the
// client polls GET /api/media/[id]/status until it settles.
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("reframe");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let videoUrl = "";
  let aspectRatio = "";
  try {
    const body = await req.json();
    videoUrl = (body?.videoUrl ?? "").toString().trim();
    aspectRatio = (body?.aspectRatio ?? "").toString().trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!videoUrl) {
    return Response.json({ error: "videoUrl is required." }, { status: 400 });
  }
  if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    return Response.json({ error: `aspectRatio must be one of: ${VALID_ASPECT_RATIOS.join(", ")}` }, { status: 400 });
  }

  const id = await insertGeneration({
    userId: user.id,
    kind: "reframe",
    provider: "replicate",
    cost,
    input: { videoUrl, aspectRatio },
  });

  try {
    const created = await createPrediction(REPLICATE_MODELS.reframe, {
      video_url: videoUrl,
      aspect_ratio: aspectRatio,
    });
    await markProcessing(id, created.id);
    return Response.json({ id, status: "processing" }, { status: 202 });
  } catch (error: any) {
    console.error("[media/reframe] generation failed:", error.message);
    await markFailed(id, user, cost, "reframe", error.message);
    return Response.json({ error: "Reframe failed to start. Your credits were refunded." }, { status: 502 });
  }
}
