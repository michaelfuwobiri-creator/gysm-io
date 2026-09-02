import { getUser } from "@/lib/auth";
import { deleteAsset } from "@/lib/mediaAssets";

// DELETE /api/media-assets/[id] -- scoped to the requesting user's own
// rows (deleteAsset's WHERE clause), same ownership pattern every other
// /api/projects/[id]/* route already uses.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  await deleteAsset(user.id, params.id);
  return Response.json({ ok: true });
}
