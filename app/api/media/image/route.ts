import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed } from "@/lib/media/service";
import { generateImage, isFalConfigured } from "@/lib/media/providers/fal";
import { generateImageOpenAI } from "@/lib/media/providers/openaiImage";
import { addCredits } from "@/lib/credits";

// POST { prompt: string, referenceImageUrl?: string } -> { id, url }.
// Synchronous either way. Fal.ai's fal.run endpoint blocks until the
// image is ready (see lib/media/providers/fal.ts); OpenAI's images API
// is a single request too. Fal is used whenever it's configured -- it's
// the strictly more capable provider (real image-to-image via
// referenceImageUrl, an attached image or a picked Asset Management
// Cast/Settings/Object -- see lib/mediaAssets.ts). When FAL_API_KEY
// isn't set but OPENAI_API_KEY is, plain text-to-image falls back to
// OpenAI's gpt-image-1 (see lib/media/providers/openaiImage.ts) rather
// than staying blocked on a second provider account.
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

  const useFal = isFalConfigured();
  if (referenceImageUrl && !useFal) {
    // The OpenAI fallback only does from-scratch generation -- don't
    // silently ignore the reference image and generate something
    // unrelated. requireUserAndCredit already deducted the credit
    // before we knew a reference image was involved, so refund it.
    await addCredits(user.id, cost);
    return Response.json(
      {
        error:
          "Image-to-image (using a reference image) needs FAL_API_KEY specifically -- the OpenAI fallback only covers plain text-to-image. Add FAL_API_KEY to generate from a reference.",
      },
      { status: 501 }
    );
  }
  const provider = useFal ? "fal" : "openai";

  const id = await insertGeneration({ userId: user.id, kind: "image", provider, cost, input: { prompt, referenceImageUrl } });

  try {
    const { url } = useFal ? await generateImage(prompt, referenceImageUrl) : await generateImageOpenAI(prompt);
    await markDone(id, url);
    return Response.json({ id, url });
  } catch (error: any) {
    console.error("[media/image] generation failed:", error.message);
    await markFailed(id, user, cost, "image", error.message);
    return Response.json({ error: "Image generation failed. Your credits were refunded." }, { status: 502 });
  }
}
