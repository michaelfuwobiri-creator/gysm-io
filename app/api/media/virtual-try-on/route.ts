import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed } from "@/lib/media/service";
import { virtualTryOn } from "@/lib/media/providers/fal";

// POST { modelImageUrl: string, garmentImageUrl: string } -> { id, url }.
// Synchronous -- Fal's fashn/tryon/v1.6 is fast enough to run inline
// (same bucket as image generation). Requires two distinct images: a
// photo of the person/model and a photo of the garment to place on
// them -- see the builder's two-attachment validation for this skill.
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("virtual-try-on");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let modelImageUrl = "";
  let garmentImageUrl = "";
  try {
    const body = await req.json();
    modelImageUrl = (body?.modelImageUrl ?? "").toString().trim();
    garmentImageUrl = (body?.garmentImageUrl ?? "").toString().trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!modelImageUrl || !garmentImageUrl) {
    return Response.json({ error: "Attach two images: a model/person photo, then a garment photo." }, { status: 400 });
  }

  const id = await insertGeneration({ userId: user.id, kind: "virtual-try-on", provider: "fal", cost, input: { modelImageUrl, garmentImageUrl } });

  try {
    const { url } = await virtualTryOn(modelImageUrl, garmentImageUrl);
    await markDone(id, url);
    return Response.json({ id, url });
  } catch (error: any) {
    console.error("[media/virtual-try-on] generation failed:", error.message);
    await markFailed(id, user, cost, "virtual-try-on", error.message);
    return Response.json({ error: "Virtual try-on failed. Your credits were refunded." }, { status: 502 });
  }
}
