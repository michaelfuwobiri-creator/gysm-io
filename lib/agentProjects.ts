import { sql } from "@/lib/db";
import { cleanSlug, slugProblem } from "@/lib/previewSlug";
import { bundlePreview, type PreviewFile } from "@/lib/previewBundle";
import { ENTRY_PATH, HOSTED_MAX_FILES, HOSTED_MAX_FILE_BYTES, HOSTED_MAX_TOTAL_BYTES, isBinaryHostedPath, normalizeHostedPath, replaceProjectFiles, type ProjectFile } from "@/lib/projectFiles";

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

/** The GYSM project row for an agent folder, or null when there is none yet. */
export async function findAgentProjectId(userId: string, project: string): Promise<string | null> {
  try {
    const rows = (await sql`select id from projects where user_id = ${userId} and prompt = ${agentProjectMarker(project)} and root_project_id is null limit 1`) as any[];
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Same, creating a small placeholder row first when the folder was never saved as a project (a database needs a project to belong to). */
export async function ensureAgentProjectId(userId: string, project: string): Promise<string | null> {
  const found = await findAgentProjectId(userId, project);
  if (found) return found;
  try {
    const html = buildProjectHtml(null, project, "https://www.gysm.io");
    const rows = (await sql`
      insert into projects (user_id, prompt, html, name, is_template)
      values (${userId}, ${agentProjectMarker(project)}, ${html}, ${project}, false) returning id
    `) as any[];
    return rows[0]?.id ?? null;
  } catch (e: any) {
    console.error("[agent] couldn't create a project for the database:", e?.message || e);
    return null;
  }
}

/** The html stored on the project row: the site's own index.html, or a small link page. */
export function buildProjectHtml(indexHtml: string | null, project: string, url: string): string {
  if (indexHtml && indexHtml.trim() && Buffer.byteLength(indexHtml, "utf8") <= MAX_PROJECT_HTML_BYTES) return indexHtml;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project)}</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;background:#0A0A0A;color:#fff;text-align:center">
<div><h1 style="margin:0 0 12px">${esc(project)}</h1><p style="opacity:.6;margin:0 0 20px">Built and deployed by GYSM Agent.</p>
<a href="${esc(url)}" style="background:#FF0080;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700">Open the live site</a></div></body></html>`;
}

const NAV_SCRIPT_RE = /<script>document\.addEventListener\('click'[^]*?gysmPreviewNav[^]*?<\/script>/;

/**
 * The html saved on the project row for a multi-file site: index.html with its
 * stylesheets, scripts and images baked in, so the dashboard card (which shows
 * it in an iframe with no server behind it) looks like the real site. Falls
 * back to smaller versions, then to the bare index.html, when it is too big.
 */
export function thumbnailBundle(files: ProjectFile[]): string {
  const entry = files.find((f) => f.path === ENTRY_PATH)?.content ?? "";
  const toPreview = (withBinary: boolean): PreviewFile[] =>
    files.flatMap((f): PreviewFile[] => (isBinaryHostedPath(f.path) ? (withBinary ? [{ path: f.path, base64: f.content }] : []) : [{ path: f.path, text: f.content }]));
  for (const withBinary of [true, false]) {
    try {
      const b = bundlePreview(toPreview(withBinary), ENTRY_PATH);
      if (b.ok) {
        const html = b.html.replace(NAV_SCRIPT_RE, "");
        if (Buffer.byteLength(html, "utf8") <= MAX_PROJECT_HTML_BYTES) return html;
      }
    } catch {
      /* fall through to a smaller version */
    }
  }
  return entry;
}

const REL_STYLESHEET_RE = /<link\b[^>]*\brel\s*=\s*["']?stylesheet[^>]*\bhref\s*=\s*["'](?!https?:|\/\/|data:)[^"']+/i;
const REL_SCRIPT_RE = /<script\b[^>]*\ssrc\s*=\s*["'](?!https?:|\/\/|data:)[^"']+/i;

/** True when a saved page still points at its own css/js files (so a card would show it unstyled). */
export function looksUnbundled(html: unknown): boolean {
  return typeof html === "string" && (REL_STYLESHEET_RE.test(html) || REL_SCRIPT_RE.test(html));
}

const BINARY_PATH_SQL = "\\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp3|mp4|webm)$";

/**
 * Dashboard cards for multi-file agent sites: projects.html is the site's real
 * index.html (it is what gets hosted, downloaded and pushed), so it still
 * points at style.css and friends. For the card only, this builds a copy with
 * the stylesheets and scripts baked in. Nothing is written back. Text files
 * only (images are skipped to keep it light). Returns id -> html for the card.
 */
export async function bundleAgentThumbnails(rows: { id: string; prompt?: string | null; html?: string | null }[], max = 24): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const todo = rows.filter((r) => typeof r.prompt === "string" && r.prompt.startsWith("[Agent] ") && looksUnbundled(r.html)).slice(0, max);
  if (todo.length === 0) return out;
  try {
    const extra = (await sql`
      select project_id, path, content from project_files
      where project_id = any(${todo.map((r) => r.id)}::uuid[]) and path <> ${ENTRY_PATH} and path !~* ${BINARY_PATH_SQL}
    `) as { project_id: string; path: string; content: string }[];
    const byProject = new Map<string, ProjectFile[]>();
    for (const e of extra) byProject.set(e.project_id, [...(byProject.get(e.project_id) ?? []), { path: e.path, content: e.content }]);
    for (const r of todo) {
      const files = byProject.get(r.id);
      if (!files?.length) continue;
      out[r.id] = thumbnailBundle([{ path: ENTRY_PATH, content: String(r.html) }, ...files]);
    }
  } catch (e: any) {
    console.error("[dashboard] couldn't build card previews:", e?.message || e);
  }
  return out;
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

/**
 * Picks the files gysm.io can host (web text files plus images, fonts and
 * media, within the size caps) and makes sure there is an index.html.
 * Binary files keep their base64 text as content.
 */
export function selectHostableFiles(input: { path: string; text?: string; base64?: string }[]): PreviewSelection {
  const skipped: string[] = [];
  const kept: ProjectFile[] = [];
  let total = 0;
  for (const f of input) {
    const path = normalizeHostedPath(f.path);
    const binary = path ? isBinaryHostedPath(path) : false;
    const content = binary ? f.base64 : f.text;
    if (!path || typeof content !== "string") {
      skipped.push(f.path);
      continue;
    }
    const bytes = binary ? Math.floor((content.length * 3) / 4) : Buffer.byteLength(content, "utf8");
    if (bytes > HOSTED_MAX_FILE_BYTES || total + bytes > HOSTED_MAX_TOTAL_BYTES || kept.length >= HOSTED_MAX_FILES) {
      skipped.push(f.path);
      continue;
    }
    total += bytes;
    kept.push({ path, content });
  }
  if (!kept.some((f) => f.path === ENTRY_PATH)) {
    const firstPage = kept.filter((f) => /\.html?$/i.test(f.path)).sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path))[0];
    if (!firstPage) return { files: [], skipped, error: "There is no web page (index.html) to publish. Build the site first, or pick the folder that has index.html in it." };
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

// ---- Friendly names (src.gysm.io) ------------------------------------------

/** The project a hosted-preview name points at, or null. Null too when migration 0035 is not applied. */
export async function projectIdForSlug(slug: string): Promise<string | null> {
  try {
    const rows = (await sql`select id from projects where preview_slug = ${slug} limit 1`) as any[];
    return rows[0]?.id ?? null;
  } catch (e: any) {
    if (e?.code === "42703") return null; // column missing: migration not run yet
    throw e;
  }
}

export type SlugResult = { slug: string | null; error?: string; taken?: boolean; previous?: string | null; created?: boolean };

function pgCode(e: any): string | undefined {
  return e?.code || e?.sourceError?.code;
}

/**
 * Gives a project's hosted preview its friendly name. With a name asked for,
 * that exact name is used or an error says why not. Without one, the project
 * keeps the name it has, or gets one made from the project name (-2, -3 … when
 * taken). slug is null when migration 0035 has not been applied: the caller
 * then falls back to the plain /a/<id> link.
 */
export async function setPreviewSlug(opts: { id: string; userId: string; wanted?: string; fallbackFrom: string }): Promise<SlugResult> {
  const { id, userId } = opts;
  try {
    const cur = (await sql`select preview_slug from projects where id = ${id} and user_id = ${userId} limit 1`) as any[];
    const current: string | null = cur[0]?.preview_slug ?? null;
    const asked = opts.wanted !== undefined && opts.wanted !== null && String(opts.wanted).trim() !== "";

    if (asked) {
      const want = cleanSlug(opts.wanted);
      const problem = slugProblem(want);
      if (problem) return { slug: current, error: problem };
      if (want === current) return { slug: current };
      try {
        await sql`update projects set preview_slug = ${want} where id = ${id} and user_id = ${userId}`;
        return { slug: want, previous: current, created: true };
      } catch (e: any) {
        if (pgCode(e) === "23505") return { slug: current, error: `${want}.gysm.io is already taken. Try another name.`, taken: true };
        throw e;
      }
    }

    if (current) return { slug: current };
    let base = cleanSlug(opts.fallbackFrom);
    if (slugProblem(base)) base = `site-${id.slice(0, 6)}`;
    for (let i = 1; i <= 8; i++) {
      const candidate = i === 1 ? base : `${base.slice(0, 28)}-${i}`;
      if (slugProblem(candidate)) continue;
      try {
        await sql`update projects set preview_slug = ${candidate} where id = ${id} and user_id = ${userId}`;
        return { slug: candidate, created: true };
      } catch (e: any) {
        if (pgCode(e) !== "23505") throw e;
      }
    }
    return { slug: null, error: "Couldn't find a free name. Type one and try again." };
  } catch (e: any) {
    if (pgCode(e) === "42703") return { slug: null }; // migration 0035 not applied
    throw e;
  }
}
