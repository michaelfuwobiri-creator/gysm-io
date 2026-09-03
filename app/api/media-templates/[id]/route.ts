import { getUser } from "@/lib/auth";
import { deleteTemplate } from "@/lib/mediaTemplates";

// DELETE /api/media-templates/[id] -- scoped to the requesting user's
// own rows (deleteTemplate's WHERE clause).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  await deleteTemplate(user.id, params.id);
  return Response.json({ ok: true });
}
