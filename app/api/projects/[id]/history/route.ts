import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Version history for a build. Edits always save as a new project row
// (see app/api/generate/route.ts) carrying root_project_id back to the
// first row in the chain -- this walks that chain and returns every
// version in order, oldest first, so the builder's History panel can
// list "what changed when" and let the user jump back to an earlier one.
// Owner-scoped throughout; a stranger's id (even a valid one) 404s.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rootRows = await sql`
      select coalesce(root_project_id, id) as root_id
      from projects
      where id = ${params.id} and user_id = ${user.id}
      limit 1
    `;
    const rootId = (rootRows[0] as any)?.root_id;
    if (!rootId) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }

    const versions = await sql`
      select id, prompt, created_at
      from projects
      where user_id = ${user.id} and (id = ${rootId} or root_project_id = ${rootId})
      order by created_at asc
    `;
    return Response.json({ versions });
  } catch (error: any) {
    console.error("[projects] failed to load history:", error.message);
    return Response.json({ error: "Failed to load history." }, { status: 500 });
  }
}
