import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markProcessing, markFailed } from "@/lib/media/service";
import { createPrediction, REPLICATE_MODELS } from "@/lib/media/providers/replicate";

// POST { prompt: string, durationSeconds?: number } -> { id, status: "processing" }.
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("music");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let prompt = "";
  let durationSeconds = 30;
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? "").toString().trim().slice(0, 500);
    durationSeconds = Math.min(120, Math.max(5, Number(body?.durationSeconds) || 30));
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!prompt) {
    return Response.json({ error: "A prompt describing the music is required." }, { status: 400 });
  }

  const id = await insertGeneration({ userId: user.id, kind: "music", provider: "replicate", cost, input: { prompt, durationSeconds } });

  try {
    const created = await createPrediction(REPLICATE_MODELS.music, { prompt, duration: durationSeconds });
    await markProcessing(id, created.id);
    return Response.json({ id, status: "processing" }, { status: 202 });
  } catch (error: any) {
    console.error("[media/music] generation failed:", error.message);
    await markFailed(id, user, cost, "music", error.message);
    return Response.json({ error: "Music generation failed to start. Your credits were refunded." }, { status: 502 });
  }
}
