import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Owner-only fork of a build into a brand-new project row (own id, own
// version chain -- root_project_id left null so future edits off the
// copy don't get mixed into the original's History panel). Scoped to
// `user_id = ${user.id}` on the read, so this can only ever copy one of
// the signed-in user's own builds.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select prompt, html, name, org_id from projects
      where id = ${params.id} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
      limit 1
    `;
    const src = rows[0] as any;
    if (!src) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }

    // A duplicate stays with the same team the source belongs to (or
    // becomes personal if the source was personal) -- copying a shared
    // build shouldn't quietly strip it out of the team.
    const baseName = (src.name || src.prompt || "Untitled build").toString().slice(0, 110);
    const inserted = await sql`
      insert into projects (user_id, prompt, html, name, org_id)
      values (${user.id}, ${src.prompt}, ${src.html}, ${`${baseName} (copy)`}, ${src.org_id ?? null})
      returning id
    `;
    const newId = (inserted[0] as any)?.id;
    return Response.json({ ok: true, id: newId });
  } catch (error: any) {
    console.error("[projects] failed to duplicate project:", error.message);
    return Response.json({ error: "Failed to duplicate. Please try again." }, { status: 500 });
  }
}
