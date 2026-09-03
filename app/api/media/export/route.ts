import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markDone, markFailed } from "@/lib/media/service";
import { scaleVideoToPreset, type ExportPreset } from "@/lib/media/providers/fal";

const VALID_PRESETS: ExportPreset[] = ["16:9", "9:16", "1:1"];

// POST { videoUrl: string, preset: "16:9" | "9:16" | "1:1" } -> { id, url }.
// Synchronous -- Fal's workflow-utilities are plain ffmpeg operations,
// fast enough to run inline (same bucket as sound-effect/voice-enhance).
// Deterministic crop/resize to a platform's exact dimensions, distinct
// from @reframe's AI subject-aware reframing (see lib/media/providers/
// fal.ts's comment on scaleVideoToPreset for the split).
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("export");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let videoUrl = "";
  let preset = "";
  try {
    const body = await req.json();
    videoUrl = (body?.videoUrl ?? "").toString().trim();
    preset = (body?.preset ?? "").toString().trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!videoUrl) {
    return Response.json({ error: "A video is required." }, { status: 400 });
  }
  if (!VALID_PRESETS.includes(preset as ExportPreset)) {
    return Response.json({ error: `Type one of: ${VALID_PRESETS.join(", ")}` }, { status: 400 });
  }

  const id = await insertGeneration({ userId: user.id, kind: "export", provider: "fal", cost, input: { videoUrl, preset } });

  try {
    const { url } = await scaleVideoToPreset(videoUrl, preset as ExportPreset);
    await markDone(id, url);
    return Response.json({ id, url });
  } catch (error: any) {
    console.error("[media/export] generation failed:", error.message);
    await markFailed(id, user.id, cost, error.message);
    return Response.json({ error: "Export failed. Your credits were refunded." }, { status: 502 });
  }
}
