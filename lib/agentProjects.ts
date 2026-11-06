import { sql } from "@/lib/db";

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
