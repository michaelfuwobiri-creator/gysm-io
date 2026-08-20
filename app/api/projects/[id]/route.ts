import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Owner-only delete for a build. Scoped to `user_id = ${user.id}` in the
// WHERE clause (not just checked in application logic), so there's no
// window where one user's request could delete another user's row even
// if an id were guessed or reused. Comments and any connected_backends
// row cascade-delete via FK (see db/migrations/0002 and 0003).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      delete from projects
      where id = ${params.id} and user_id = ${user.id}
      returning id
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }
    return Response.json({ ok: true, id: params.id });
  } catch (error: any) {
    console.error("[projects] failed to delete project:", error.message);
    return Response.json({ error: "Failed to delete. Please try again." }, { status: 500 });
  }
}
