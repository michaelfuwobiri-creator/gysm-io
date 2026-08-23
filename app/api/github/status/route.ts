import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId required." }, { status: 400 });

  const rows = await sql`
    select owner, repo, branch, status, error_message, last_pushed_at, last_commit_url
    from github_connections
    where project_id = ${projectId} and user_id = ${user.id}
    limit 1
  `;
  const row = rows[0] as any;
  if (!row) return Response.json({ connected: false });
  return Response.json({ connected: true, ...row });
}
