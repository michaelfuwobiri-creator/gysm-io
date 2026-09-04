import { NextRequest } from "next/server";
import { requireUserAndCredit, insertGeneration, markProcessing, markFailed } from "@/lib/media/service";
import { createAvatarVideo } from "@/lib/media/providers/heygen";

// POST { avatarId: string, script: string } -> { id, status: "processing" }.
// avatarId must be a real HeyGen avatar id (see the note in
// lib/media/providers/heygen.ts) -- the concept prototype's cosmetic
// avatar picker will need its options replaced with real HeyGen avatar
// ids once HEYGEN_API_KEY is live.
export async function POST(req: NextRequest) {
  const gate = await requireUserAndCredit("avatar");
  if (gate.ok === false) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const { user, cost } = gate;

  let avatarId = "";
  let script = "";
  try {
    const body = await req.json();
    avatarId = (body?.avatarId ?? "").toString().trim();
    script = (body?.script ?? "").toString().trim().slice(0, 2000);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!avatarId || !script) {
    return Response.json({ error: "avatarId and script are required." }, { status: 400 });
  }

  const id = await insertGeneration({ userId: user.id, kind: "avatar", provider: "heygen", cost, input: { avatarId, script } });

  try {
    const { videoId } = await createAvatarVideo(avatarId, script);
    await markProcessing(id, videoId);
    return Response.json({ id, status: "processing" }, { status: 202 });
  } catch (error: any) {
    console.error("[media/avatar] generation failed:", error.message);
    await markFailed(id, user, cost, "avatar", error.message);
    return Response.json({ error: "Avatar video failed to start. Your credits were refunded." }, { status: 502 });
  }
}
