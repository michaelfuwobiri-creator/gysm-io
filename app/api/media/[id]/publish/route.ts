import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { publishGeneration, unpublishGeneration } from "@/lib/flowTv";

// POST -- publish a finished generation to Flow TV (see app/flow-tv).
// DELETE -- unpublish. Both scoped to `user_id = ${user.id}` in the
// WHERE clause (see lib/flowTv.ts), same ownership pattern
// app/api/projects/[id]/publish/route.ts already uses for BuildGuild.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const ok = await publishGeneration(user.id, params.id, user.name);
  if (!ok) {
    return Response.json({ error: "Generation not found, not yours, or not finished yet." }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  await unpublishGeneration(user.id, params.id);
  return Response.json({ ok: true });
}
