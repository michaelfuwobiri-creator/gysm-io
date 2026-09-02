import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed, markProcessing } from "@/lib/media/service";
import { createPrediction, getPrediction, REPLICATE_MODELS } from "@/lib/media/providers/replicate";

// POST { imageUrl: string, op: "upscale" | "bg-remove" } -> { id, url }.
// Replicate predictions are async by API shape even for fast ops, so
// this route submits the prediction and polls briefly inline (these
// models typically finish in a few seconds) rather than making the
// client do a separate status round-trip for something this quick.
// Falls back to returning a "processing" id if it doesn't finish within
// the inline poll budget, same shape the true-async kinds use.
const INLINE_POLL_BUDGET_MS = 15_000;

export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("edit");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let imageUrl = "";
  let op: "upscale" | "bg-remove" = "upscale";
  try {
    const body = await req.json();
    imageUrl = (body?.imageUrl ?? "").toString().trim();
    op = body?.op === "bg-remove" ? "bg-remove" : "upscale";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!imageUrl) {
    return Response.json({ error: "imageUrl is required." }, { status: 400 });
  }

  const id = await insertGeneration({ userId: user.id, kind: "edit", provider: "replicate", cost, input: { imageUrl, op } });

  try {
    const model = REPLICATE_MODELS[op];
    const inputKey = op === "upscale" ? "image" : "image";
    const created = await createPrediction(model, { [inputKey]: imageUrl });
    await markProcessing(id, created.id);

    const start = Date.now();
    let status = created.status;
    let output: unknown = null;
    let predId = created.id;
    while (Date.now() - start < INLINE_POLL_BUDGET_MS && status !== "succeeded" && status !== "failed") {
      await new Promise((r) => setTimeout(r, 1000));
      const check = await getPrediction(predId);
      status = check.status;
      output = check.output;
      if (status === "failed") throw new Error(check.error || "Replicate prediction failed.");
    }

    if (status === "succeeded") {
      const url = Array.isArray(output) ? output[0] : output;
      await markDone(id, url as string);
      return Response.json({ id, url });
    }

    // Still running after our inline budget -- hand back a "processing"
    // state the client can poll via GET /api/media/[id]/status, same as
    // video/avatar/music.
    return Response.json({ id, status: "processing" }, { status: 202 });
  } catch (error: any) {
    console.error("[media/edit] generation failed:", error.message);
    await markFailed(id, user.id, cost, error.message);
    return Response.json({ error: "Edit failed. Your credits were refunded." }, { status: 502 });
  }
}
