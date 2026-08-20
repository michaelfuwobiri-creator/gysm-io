import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Owner-only read of a single build -- used by the builder's History
// panel to load an earlier version's prompt/html back into view, and by
// anything else that needs one project's full record. Scoped to
// `user_id = ${user.id}`, same as every other route below.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select id, prompt, html, name, root_project_id, created_at
      from projects
      where id = ${params.id} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
      limit 1
    `;
    const project = rows[0] as any;
    if (!project) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }
    return Response.json(project);
  } catch (error: any) {
    console.error("[projects] failed to load project:", error.message);
    return Response.json({ error: "Failed to load build." }, { status: 500 });
  }
}

// Owner-only rename. Body: { name: string }. Only touches the `name`
// column -- never prompt/html -- so this can't be used to smuggle in a
// content change.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  let name = "";
  try {
    const body = await req.json();
    name = (body?.name ?? "").toString().trim().slice(0, 120);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!name) {
    return Response.json({ error: "Name can't be empty." }, { status: 400 });
  }

  try {
    const rows = await sql`
      update projects set name = ${name}
      where id = ${params.id} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
      returning id
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }
    return Response.json({ ok: true, id: params.id, name });
  } catch (error: any) {
    console.error("[projects] failed to rename project:", error.message);
    return Response.json({ error: "Failed to rename. Please try again." }, { status: 500 });
  }
}

// Owner-only delete for a build. Scoped to `user_id = ${user.id}` in the
// WHERE clause (not just checked in application logic), so there's no
// window where one user's request could delete another user's row even
// if an id were guessed or reused. Comments and any connected_backends
// row cascade-delete via FK (see db/migrations/0002 and 0003); any
// edit-descendants (root_project_id pointing at this row) have that
// column set null via FK ON DELETE SET NULL rather than being deleted
// themselves, so deleting a root build doesn't silently wipe its history.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    // For a team build, only its original creator or an org admin can
    // delete it -- any member can rename/edit/duplicate it (see the
    // PATCH handler above and generate/route.ts), but deletion is
    // destructive for the whole team, not just the person clicking the
    // button, so it gets a narrower check than the rest of this file.
    const rows = await sql`
      delete from projects
      where id = ${params.id}
        and (
          user_id = ${user.id}
          or (org_id is not null and org_id = ${user.orgId} and ${user.orgRole === "org:admin"})
        )
      returning id
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Build not found, or you need to be an org admin to delete a teammate's build." }, { status: 404 });
    }
    return Response.json({ ok: true, id: params.id });
  } catch (error: any) {
    console.error("[projects] failed to delete project:", error.message);
    return Response.json({ error: "Failed to delete. Please try again." }, { status: 500 });
  }
}
