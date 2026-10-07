import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { fetchFileText, listRepoFiles } from "@/lib/githubPush";
import { getProjectFiles, hasExtraFiles, replaceProjectFiles } from "@/lib/projectFiles";
import { selectPullPaths, sameFileSet, validateFileSet, ENTRY_PATH, type ProjectFile } from "@/lib/projectFilesCore";
import { runProjectPreflight } from "@/lib/projectPreflight";
import { appFrameUrl } from "@/lib/userContent";
import { validatePulledHtml } from "@/lib/githubPull";
import { runPreflightCheck } from "@/lib/preflightCheck";
import { relinkProjectId } from "@/lib/backendStore";
import { relinkGithubConnection } from "@/lib/githubStore";

// "Pull from GitHub" -- the other half of the sync. Reads index.html from the
// connected repo and branch and saves it as a NEW version of the build, never
// by overwriting the current row, so the builder's History keeps whatever was
// there before and a bad pull can always be undone. Costs no credits (no AI
// call). Runs the same automated check a generation gets, including the
// exposed-secret scan.
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
    select html, name, org_id, coalesce(root_project_id, id) as root_id
    from projects
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
    console.error("[github pull] failed to decrypt token:", error.message);
    return Response.json({ error: "Stored token could not be read. Reconnect GitHub for this build." }, { status: 500 });
  }

  const fetched = await fetchFileText(token, conn.owner, conn.repo, conn.branch, "index.html");
  if (!fetched.ok) {
    const failure = fetched as Extract<typeof fetched, { ok: false }>;
    return Response.json({ error: failure.error }, { status: failure.notFound ? 404 : 502 });
  }

  const html = fetched.content.trim();
  const valid = validatePulledHtml(html);
  if (!valid.ok) {
    const failure = valid as Extract<typeof valid, { ok: false }>;
    return Response.json({ error: failure.error }, { status: 422 });
  }

  // A project that already has several files pulls all of them: every
  // allowed file in the repo, not just index.html. A single-file project
  // keeps pulling index.html only, so unrelated files in the repo are never
  // imported by accident.
  let pulledFiles: ProjectFile[] | null = null;
  if (await hasExtraFiles(projectId)) {
    const current = await getProjectFiles(projectId);
    const listed = await listRepoFiles(token, conn.owner, conn.repo, conn.branch);
    if (!listed.ok) {
      return Response.json({ error: (listed as Extract<typeof listed, { ok: false }>).error }, { status: 502 });
    }
    const paths = selectPullPaths(listed.paths, current.map((f) => f.path));
    const files: ProjectFile[] = [{ path: ENTRY_PATH, content: html }];
    for (const path of paths) {
      if (path === ENTRY_PATH) continue;
      const got = await fetchFileText(token, conn.owner, conn.repo, conn.branch, path);
      if (!got.ok) {
        return Response.json({ error: (got as Extract<typeof got, { ok: false }>).error }, { status: 502 });
      }
      files.push({ path, content: got.content });
    }
    const checked = validateFileSet(files);
    if (checked.ok === false) return Response.json({ error: checked.error }, { status: 422 });
    if (sameFileSet(current, checked.files)) return Response.json({ ok: true, changed: false });
    pulledFiles = checked.files;
  } else if (html === String(project.html ?? "").trim()) {
    return Response.json({ ok: true, changed: false });
  }

  const preflight = pulledFiles ? runProjectPreflight(pulledFiles) : runPreflightCheck(html);
  const prompt = `Pulled from GitHub (${conn.owner}/${conn.repo}@${conn.branch})`;

  let newProjectId: string | null = null;
  try {
    const rows = await sql`
      insert into projects (user_id, prompt, html, name, root_project_id, org_id, check_status, check_results, check_run_at)
      values (${user.id}, ${prompt}, ${html}, ${project.name ?? null}, ${project.root_id}, ${project.org_id ?? null}, ${preflight.status}, ${JSON.stringify(preflight.issues)}, ${preflight.checkedAt})
      returning id
    `;
    newProjectId = (rows[0] as any)?.id ?? null;
  } catch (error: any) {
    console.error("[github pull] failed to save project:", error.message);
  }
  if (!newProjectId) return Response.json({ error: "Could not save the pulled version. Please try again." }, { status: 500 });

  if (pulledFiles) {
    try {
      await replaceProjectFiles(newProjectId, pulledFiles);
    } catch (error: any) {
      console.error("[github pull] failed to save files:", error.message);
      return Response.json({ error: "Could not save the pulled files. Please try again." }, { status: 500 });
    }
  }

  // Carry the database and GitHub links onto the new row, as edits do.
  try {
    await relinkProjectId(projectId, newProjectId);
  } catch (error: any) {
    console.error("[github pull] failed to relink backend connection:", error.message);
  }
  try {
    await relinkGithubConnection(projectId, newProjectId);
  } catch (error: any) {
    console.error("[github pull] failed to relink github connection:", error.message);
  }

  return Response.json({ ok: true, changed: true, projectId: newProjectId, html, files: pulledFiles, previewUrl: pulledFiles && pulledFiles.length > 1 ? appFrameUrl(newProjectId) ?? `/a/${newProjectId}/` : null, issues: preflight.issues });
}
