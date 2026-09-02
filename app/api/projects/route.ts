import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Lists the signed-in user's own projects -- powers the "Submit Build"
// modal on /buildguild (see SubmitBuildModal.tsx), which needs to show
// someone a picker of builds they already own rather than a freeform
// "create a new build" form with no backing table. Deliberately narrow:
// no id param, no other user's rows are ever reachable, same
// user_id/org_id scoping every other /api/projects/[id]/* route uses.
export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select id, prompt, name, title, tagline, is_public, tags, created_at
      from projects
      where (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
        and is_template = false
      order by created_at desc
      limit 30
    `;
    return Response.json({ projects: rows });
  } catch (error: any) {
    console.error("[projects] failed to list projects:", error.message);
    return Response.json({ error: "Failed to load your builds." }, { status: 500 });
  }
}
