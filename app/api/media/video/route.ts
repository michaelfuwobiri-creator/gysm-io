import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markProcessing, markFailed } from "@/lib/media/service";
import { createPrediction, REPLICATE_MODELS } from "@/lib/media/providers/replicate";

// POST { prompt: string, imageUrl?: string } -> { id, status: "processing" }.
// Async -- returns immediately, client polls GET /api/media/[id]/status
// until it flips to "done" (see lib/media/service.ts + that route).
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("video");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let prompt = "";
  let imageUrl: string | undefined;
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? "").toString().trim().slice(0, 2000);
    imageUrl = body?.imageUrl ? body.imageUrl.toString() : undefined;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!prompt && !imageUrl) {
    return Response.json({ error: "A prompt or a source image is required." }, { status: 400 });
  }

  const id = await insertGeneration({
    userId: user.id,
    kind: "video",
    provider: "replicate",
    cost,
    input: { prompt, imageUrl },
  });

  try {
    const input: Record<string, unknown> = { prompt };
    if (imageUrl) input.first_frame_image = imageUrl;
    const created = await createPrediction(REPLICATE_MODELS.video, input);
    await markProcessing(id, created.id);
    return Response.json({ id, status: "processing" }, { status: 202 });
  } catch (error: any) {
    console.error("[media/video] generation failed:", error.message);
    await markFailed(id, user.id, cost, error.message);
    return Response.json({ error: "Video generation failed to start. Your credits were refunded." }, { status: 502 });
  }
}
