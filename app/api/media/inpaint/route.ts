import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed } from "@/lib/media/service";
import { inpaintImage } from "@/lib/media/providers/fal";

// POST { imageUrl: string, maskUrl: string, prompt: string } -> { id, url }.
// Synchronous -- Fal's flux-pro/v1/fill runs fast enough to treat as
// inline (same bucket as image generation). Backs two builder skills
// that share this one route: Object Removal (item 31, a hand-drawn
// brush mask) and Image Outpainting (item 26, a programmatically padded
// canvas + mask) -- both just FLUX Fill inpainting with different
// image/mask preparation done client-side before this call.
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("inpaint");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let imageUrl = "";
  let maskUrl = "";
  let prompt = "";
  try {
    const body = await req.json();
    imageUrl = (body?.imageUrl ?? "").toString().trim();
    maskUrl = (body?.maskUrl ?? "").toString().trim();
    prompt = (body?.prompt ?? "").toString().trim().slice(0, 2000);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!imageUrl || !maskUrl) {
    return Response.json({ error: "An image and a mask are required." }, { status: 400 });
  }
  if (!prompt) {
    prompt = "Fill naturally, seamlessly matching the surrounding image, photorealistic.";
  }

  const id = await insertGeneration({ userId: user.id, kind: "inpaint", provider: "fal", cost, input: { imageUrl, maskUrl, prompt } });

  try {
    const { url } = await inpaintImage(imageUrl, maskUrl, prompt);
    await markDone(id, url);
    return Response.json({ id, url });
  } catch (error: any) {
    console.error("[media/inpaint] generation failed:", error.message);
    await markFailed(id, user, cost, "inpaint", error.message);
    return Response.json({ error: "Inpainting failed. Your credits were refunded." }, { status: 502 });
  }
}
