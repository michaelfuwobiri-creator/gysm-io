import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { pushFiles } from "@/lib/githubPush";

// Pushes the project's current build to the connected GitHub repo -- the
// same index.html / vercel.json / README.md shape Voiie's one-time zip
// export uses (see app/api/projects/[id]/vercel-export/route.ts), just
// committed via the GitHub API instead of downloaded, so re-running this
// after further edits is an ongoing sync rather than a one-time export.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let projectId = "";
  try {
    const body = await req.json();
    projectId = (body?.projectId ?? "").toString();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!projectId) return Response.json({ error: "projectId required." }, { status: 400 });

  const projectRows = await sql`
    select html, name, prompt from projects
    where id = ${projectId} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
    limit 1
  `;
  const project = projectRows[0] as any;
  if (!project) return Response.json({ error: "Build not found." }, { status: 404 });

  const connRows = await sql`
    select owner, repo, branch, token_encrypted from github_connections
    where project_id = ${projectId} and user_id = ${user.id}
    limit 1
  `;
  const conn = connRows[0] as any;
  if (!conn) return Response.json({ error: "No GitHub connection for this build yet." }, { status: 400 });

  let token: string;
  try {
    token = decryptSecret(conn.token_encrypted);
  } catch (error: any) {
    console.error("[github push] failed to decrypt token:", error.message);
    return Response.json({ error: "Stored token could not be read. Reconnect GitHub for this build." }, { status: 500 });
  }

  const displayName = (project.name || project.prompt || "GYSM app").toString().slice(0, 80);
  const readme = [
    `# ${displayName}`,
    "",
    "Synced from GYSM.IO.",
    "",
    "## Deploy",
    "",
    "Drag this folder onto https://vercel.com/new, or connect this repo directly from your Vercel dashboard.",
    "",
    `Originally built at: ${process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io"}/builder`,
  ].join("\n");

  const result = await pushFiles(
    token,
    conn.owner,
    conn.repo,
    conn.branch,
    [
      { path: "index.html", content: project.html },
      { path: "vercel.json", content: JSON.stringify({ cleanUrls: true }, null, 2) + "\n" },
      { path: "README.md", content: readme },
    ],
    `Sync from GYSM.IO -- ${new Date().toISOString()}`
  );

  if (!result.ok) {
    const failure = result as Extract<typeof result, { ok: false }>;
    await sql`
      update github_connections set status = 'error', error_message = ${failure.error}, updated_at = now()
      where project_id = ${projectId}
    `;
    return Response.json({ error: failure.error }, { status: 502 });
  }

  const lastCommitUrl = result.commitUrls[result.commitUrls.length - 1] || null;
  await sql`
    update github_connections
    set status = 'connected', error_message = null, last_pushed_at = now(), last_commit_url = ${lastCommitUrl}, updated_at = now()
    where project_id = ${projectId}
  `;

  return Response.json({ ok: true, commitUrl: lastCommitUrl });
}
