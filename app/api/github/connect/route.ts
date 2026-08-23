import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { verifyGithubAccess } from "@/lib/githubPush";

// Saves a "Push to GitHub" connection for one project: owner/repo/branch
// plus an encrypted PAT. Verifies the token can actually write to the
// target repo before saving anything, so a typo'd repo name or an
// under-scoped token fails loudly here instead of silently at push time.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let projectId = "", token = "", owner = "", repo = "", branch = "main";
  try {
    const body = await req.json();
    projectId = (body?.projectId ?? "").toString();
    token = (body?.token ?? "").toString().trim();
    owner = (body?.owner ?? "").toString().trim();
    repo = (body?.repo ?? "").toString().trim().replace(/\.git$/, "");
    branch = (body?.branch ?? "main").toString().trim() || "main";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!projectId || !token || !owner || !repo) {
    return Response.json({ error: "Token, repo owner, and repo name are all required." }, { status: 400 });
  }

  const ownerRows = await sql`
    select id from projects where id = ${projectId} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId})) limit 1
  `;
  if (!ownerRows[0]) return Response.json({ error: "Build not found." }, { status: 404 });

  const verified = await verifyGithubAccess(token, owner, repo);
  if (!verified.ok) {
    const failure = verified as Extract<typeof verified, { ok: false }>;
    return Response.json({ error: failure.error }, { status: 400 });
  }

  const tokenEncrypted = encryptSecret(token);
  await sql`
    insert into github_connections (project_id, user_id, owner, repo, branch, token_encrypted, status)
    values (${projectId}, ${user.id}, ${owner}, ${repo}, ${branch}, ${tokenEncrypted}, 'connected')
    on conflict (project_id) do update set
      owner = excluded.owner, repo = excluded.repo, branch = excluded.branch,
      token_encrypted = excluded.token_encrypted, status = 'connected', error_message = null, updated_at = now()
  `;

  return Response.json({ ok: true, owner, repo, branch });
}
