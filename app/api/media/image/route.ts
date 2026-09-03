import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed } from "@/lib/media/service";
import { generateImage } from "@/lib/media/providers/fal";

// POST { prompt: string, referenceImageUrl?: string } -> { id, url }.
// Synchronous -- Fal.ai's fal.run endpoint blocks until the image is
// ready (see lib/media/providers/fal.ts), so there's no job-polling
// step here unlike video/avatar/music. referenceImageUrl (an attached
// image, or a picked Asset Management Cast/Settings/Object -- see
// lib/mediaAssets.ts) switches generateImage() to real image-to-image
// instead of a from-scratch render.
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("image");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let prompt = "";
  let referenceImageUrl: string | undefined;
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? "").toString().trim().slice(0, 2000);
    referenceImageUrl = body?.referenceImageUrl ? body.referenceImageUrl.toString() : undefined;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!prompt) {
    return Response.json({ error: "A prompt is required." }, { status: 400 });
  }

  const id = await insertGeneration({ userId: user.id, kind: "image", provider: "fal", cost, input: { prompt, referenceImageUrl } });

  try {
    const { url } = await generateImage(prompt, referenceImageUrl);
    await markDone(id, url);
    return Response.json({ id, url });
  } catch (error: any) {
    console.error("[media/image] generation failed:", error.message);
    await markFailed(id, user.id, cost, error.message);
    return Response.json({ error: "Image generation failed. Your credits were refunded." }, { status: 502 });
  }
}
