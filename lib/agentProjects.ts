import { sql } from "@/lib/db";
import { ENTRY_PATH, MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, normalizePath, replaceProjectFiles, type ProjectFile } from "@/lib/projectFiles";

// Saves a site the Agent deployed as a normal project, so it shows up on the
// dashboard (and can be published to BuildGuild) like any other build.
// Best-effort by design: a failure here must never fail the deploy itself.

export const MAX_PROJECT_HTML_BYTES = 900_000;

export function agentProjectMarker(project: string): string {
  return `[Agent] ${project}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** The html stored on the project row: the site's own index.html, or a small link page. */
export function buildProjectHtml(indexHtml: string | null, project: string, url: string): string {
  if (indexHtml && indexHtml.trim() && Buffer.byteLength(indexHtml, "utf8") <= MAX_PROJECT_HTML_BYTES) return indexHtml;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project)}</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;background:#0A0A0A;color:#fff;text-align:center">
<div><h1 style="margin:0 0 12px">${esc(project)}</h1><p style="opacity:.6;margin:0 0 20px">Built and deployed by GYSM Agent.</p>
<a href="${esc(url)}" style="background:#FF0080;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700">Open the live site</a></div></body></html>`;
}

export async function saveAgentProject(opts: {
  userId: string;
  project: string;
  url: string;
  indexHtml: string | null;
}): Promise<string | null> {
  const { userId, project, url } = opts;
  const marker = agentProjectMarker(project);
  const html = buildProjectHtml(opts.indexHtml, project, url);
  try {
    const existing = (await sql`
      select id from projects where user_id = ${userId} and prompt = ${marker} and root_project_id is null limit 1
    `) as any[];
    const id: string | undefined = existing[0]?.id;
    if (id) {
      try {
        await sql`update projects set html = ${html}, live_url = ${url} where id = ${id}`;
      } catch {
        await sql`update projects set html = ${html} where id = ${id}`; // live_url column not migrated yet
      }
      return id;
    }
    try {
      const rows = (await sql`
        insert into projects (user_id, prompt, html, name, is_template, live_url)
        values (${userId}, ${marker}, ${html}, ${project}, false, ${url}) returning id
      `) as any[];
      return rows[0]?.id ?? null;
    } catch {
      const rows = (await sql`
        insert into projects (user_id, prompt, html, name, is_template)
        values (${userId}, ${marker}, ${html}, ${project}, false) returning id
      `) as any[];
      return rows[0]?.id ?? null;
    }
  } catch (e: any) {
    console.error("[agent] couldn't save deployed site as a project:", e?.message || e);
    return null;
  }
}


// ---- Preview on gysm.io ----------------------------------------------------
// Copies the project's workspace files into a project row so the existing
// /a/<id>/ route can serve them at a gysm.io address before anything is
// deployed to Vercel. Only the file types /a/ can serve are kept.

export type PreviewSelection = { files: ProjectFile[]; skipped: string[]; error?: string };

/** Picks the files gysm.io can host (text web files, size caps), and makes sure there is an index.html. */
export function selectHostableFiles(input: { path: string; text?: string }[]): PreviewSelection {
  const skipped: string[] = [];
  const kept: ProjectFile[] = [];
  let total = 0;
  for (const f of input) {
    const path = normalizePath(f.path);
    if (!path || typeof f.text !== "string") {
      skipped.push(f.path);
      continue;
    }
    const bytes = Buffer.byteLength(f.text, "utf8");
    if (bytes > MAX_FILE_BYTES || total + bytes > MAX_TOTAL_BYTES || kept.length >= MAX_FILES) {
      skipped.push(f.path);
      continue;
    }
    total += bytes;
    kept.push({ path, content: f.text });
  }
  if (!kept.some((f) => f.path === ENTRY_PATH)) {
    const firstPage = kept.filter((f) => /\.html$/i.test(f.path)).sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path))[0];
    if (!firstPage) return { files: [], skipped, error: "There is no web page (.html file) to host yet." };
    kept.unshift({ path: ENTRY_PATH, content: firstPage.content });
  }
  return { files: kept, skipped };
}

/** Saves (or refreshes) the hosted preview copy of a project and returns its project id. */
export async function saveAgentPreview(opts: { userId: string; project: string; files: ProjectFile[] }): Promise<string> {
  const { userId, project, files } = opts;
  const marker = agentProjectMarker(project);
  const entry = files.find((f) => f.path === ENTRY_PATH) as ProjectFile;
  const existing = (await sql`
    select id from projects where user_id = ${userId} and prompt = ${marker} and root_project_id is null limit 1
  `) as any[];
  let id: string | undefined = existing[0]?.id;
  if (!id) {
    const rows = (await sql`
      insert into projects (user_id, prompt, html, name, is_template)
      values (${userId}, ${marker}, ${entry.content}, ${project}, false) returning id
    `) as any[];
    id = rows[0]?.id;
  }
  if (!id) throw new Error("Couldn't create the preview.");
  await replaceProjectFiles(id, files);
  return id;
}
