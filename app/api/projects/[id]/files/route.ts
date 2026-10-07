import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getProjectFiles, multiFileReady, MULTI_FILE_NOT_READY, replaceProjectFiles } from "@/lib/projectFiles";
import { validateFileSet, type ProjectFile } from "@/lib/projectFilesCore";
import { runProjectPreflight } from "@/lib/projectPreflight";
import { appFrameUrl } from "@/lib/userContent";

// Read and save a build's files from the builder's code editor. Saving is
// free (no credits): it is a hand edit, not an AI request. It overwrites the
// CURRENT project row in place, like quick-edit, and re-runs the automated
// check over every file.

async function ownsProject(id: string, user: { id: string; orgId: string | null }) {
  const rows = await sql`
    select id from projects
    where id = ${id} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
    limit 1
  `;
  return rows.length > 0;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    if (!(await ownsProject(params.id, user))) return Response.json({ error: "Build not found." }, { status: 404 });
    const files = await getProjectFiles(params.id);
    return Response.json({ files, previewUrl: files.length > 1 ? appFrameUrl(params.id) ?? `/a/${params.id}/` : null });
  } catch (error: any) {
    console.error("[files] failed to load:", error.message);
    return Response.json({ error: "Failed to load files." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let incoming: ProjectFile[] = [];
  try {
    const body = await req.json();
    incoming = Array.isArray(body?.files) ? body.files : [];
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const checked = validateFileSet(incoming);
  if (checked.ok === false) return Response.json({ error: checked.error }, { status: 400 });

  try {
    if (!(await ownsProject(params.id, user))) return Response.json({ error: "Build not found." }, { status: 404 });

    if (checked.files.length > 1 && !(await multiFileReady())) {
      return Response.json({ error: MULTI_FILE_NOT_READY }, { status: 409 });
    }
    const preflight = runProjectPreflight(checked.files);
    await replaceProjectFiles(params.id, checked.files);
    await sql`
      update projects
      set check_status = ${preflight.status}, check_results = ${JSON.stringify(preflight.issues)}, check_run_at = ${preflight.checkedAt}
      where id = ${params.id}
    `;
    return Response.json({
      ok: true,
      files: checked.files,
      checkStatus: preflight.status,
      issues: preflight.issues,
      previewUrl: checked.files.length > 1 ? appFrameUrl(params.id) ?? `/a/${params.id}/` : null,
    });
  } catch (error: any) {
    console.error("[files] failed to save:", error.message);
    return Response.json({ error: "Failed to save. Please try again." }, { status: 500 });
  }
}
