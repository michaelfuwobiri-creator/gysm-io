import { createHash } from "crypto";
import dns from "dns";
import http from "http";
import https from "https";
import { sql } from "@/lib/db";
import { getConnection, getValidAccessToken, type ConnectedBackend } from "@/lib/backendStore";
import { runSql } from "@/lib/supabaseBackend";
import { getUserSandbox, runInSandbox } from "@/lib/shell/sandbox";
import { AGENT_DEPLOYS_PER_DAY } from "@/lib/credits-constants";
import {
  MAX_DEPLOY_BYTES,
  MAX_DEPLOY_FILES,
  MAX_READ_BYTES,
  MAX_WRITE_BYTES,
  cleanProjectName,
  cleanRelPath,
  deployNameFor,
  shouldSkipDeployPath,
  truncate,
  validateDdl,
  WORKSPACE_SUBDIR,
} from "@/lib/agentCore";
import { applyEdit, htmlToText, isBlockedIp, parseFetchUrl, validEnvKey, validateReadSql, analyzeHtml, extractSameOriginLinks } from "@/lib/agentGuards";

// The six GYSM Agent tools. Every one acts only on the calling user's own
// sandbox, database connection and deployments. Each returns plain text for
// the model plus an ok flag; the loop in lib/agent.ts handles approvals,
// credits and logging.

export type ToolResult = { ok: boolean; output: string; creditsKind?: "command" | "deploy" | "db" | "light" };

const TOOL_OUTPUT_MAX = 12_000;

function userHash(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

function quote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

async function workspaceRoot(userId: string): Promise<string> {
  const r = await runInSandbox(userId, `mkdir -p "$HOME/${WORKSPACE_SUBDIR}" && printf '%s' "$HOME/${WORKSPACE_SUBDIR}"`);
  const root = r.output.trim().split("\n").pop() || "";
  if (r.exitCode !== 0 || !root.startsWith("/")) throw new Error("Couldn't prepare the workspace.");
  return root;
}

// -- write_file / read_file / run_command ----------------------------------

export async function toolWriteFile(userId: string, args: any): Promise<ToolResult> {
  const rel = cleanRelPath(args?.path);
  if (!rel) return { ok: false, output: "Invalid path. Use a relative path inside the workspace, like 'my-site/index.html'." };
  const content = typeof args?.content === "string" ? args.content : "";
  const bytes = Buffer.from(content, "utf8");
  if (bytes.length > MAX_WRITE_BYTES) {
    return { ok: false, output: `File is too large (${bytes.length} bytes, max ${MAX_WRITE_BYTES}). Split it into smaller files.` };
  }
  const root = await workspaceRoot(userId);
  const abs = `${root}/${rel}`;
  const dir = abs.slice(0, abs.lastIndexOf("/"));
  const mk = await runInSandbox(userId, `mkdir -p -- ${quote(dir)}`, root);
  if (mk.exitCode !== 0) return { ok: false, output: `Couldn't create the folder: ${mk.output}` };
  const sandbox = await getUserSandbox(userId);
  await sandbox.writeFiles([{ path: abs, content: bytes }]);
  return { ok: true, output: `Wrote ${rel} (${bytes.length} bytes).` };
}

export async function toolReadFile(userId: string, args: any): Promise<ToolResult> {
  const rel = cleanRelPath(args?.path);
  if (!rel) return { ok: false, output: "Invalid path. Use a relative path inside the workspace." };
  const root = await workspaceRoot(userId);
  const sandbox = await getUserSandbox(userId);
  const data = await sandbox.readFileToBuffer({ path: `${root}/${rel}` });
  if (!data) return { ok: false, output: `File not found: ${rel}` };
  const text = data.subarray(0, MAX_READ_BYTES).toString("utf8");
  const cut = data.length > MAX_READ_BYTES ? `\n... [file is ${data.length} bytes; showing the first ${MAX_READ_BYTES}]` : "";
  return { ok: true, output: text + cut };
}

export async function toolRunCommand(userId: string, args: any): Promise<ToolResult> {
  const cmd = typeof args?.cmd === "string" ? args.cmd.trim() : "";
  if (!cmd) return { ok: false, output: "No command given." };
  if (cmd.length > 8000) return { ok: false, output: "Command is too long." };
  const root = await workspaceRoot(userId);
  const r = await runInSandbox(userId, cmd, root);
  return {
    ok: r.exitCode === 0,
    creditsKind: "command",
    output: `exit code: ${r.exitCode}${r.truncated ? " (output truncated)" : ""}\n${r.output || "(no output)"}`,
  };
}

// -- deploy ----------------------------------------------------------------

function vercelConfig() {
  const token = process.env.AGENT_VERCEL_TOKEN;
  if (!token) return null;
  const team = process.env.AGENT_VERCEL_TEAM_ID;
  return { token, qs: team ? `teamId=${encodeURIComponent(team)}` : "" };
}

async function deploysToday(userId: string): Promise<number> {
  try {
    const rows = await sql`select count(*)::int as n from agent_deployments where user_id = ${userId} and created_at > now() - interval '1 day'`;
    return (rows[0] as any)?.n ?? 0;
  } catch {
    return 0;
  }
}

export async function toolDeploy(userId: string, args: any): Promise<ToolResult> {
  const project = cleanProjectName(args?.project);
  if (!project) return { ok: false, output: "Invalid project name. Use the folder name, e.g. 'my-site'." };
  const cfg = vercelConfig();
  if (!cfg) {
    return { ok: false, output: "Deploying isn't enabled on this GYSM instance yet (AGENT_VERCEL_TOKEN is not set). Tell the user their files are ready in the workspace." };
  }
  if ((await deploysToday(userId)) >= AGENT_DEPLOYS_PER_DAY) {
    return { ok: false, output: `Daily deploy limit reached (${AGENT_DEPLOYS_PER_DAY} per day). Try again tomorrow.` };
  }

  const root = await workspaceRoot(userId);
  const dir = `${root}/${project}`;
  const list = await runInSandbox(userId, `cd -- ${quote(dir)} 2>/dev/null && find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -printf '%P\\t%s\\n' | head -2000`, root);
  if (list.exitCode !== 0) return { ok: false, output: `Project folder not found: ${project}` };

  const entries = list.output
    .split("\n")
    .map((l) => l.split("\t"))
    .filter((p) => p.length === 2 && p[0] && !shouldSkipDeployPath(p[0]) && !p[0].includes("\0"))
    .map(([path, size]) => ({ path, size: Number(size) || 0 }));
  if (entries.length === 0) return { ok: false, output: "The project folder has no deployable files." };
  if (entries.length > MAX_DEPLOY_FILES) return { ok: false, output: `Too many files (${entries.length}, max ${MAX_DEPLOY_FILES}). Deploy a build output folder instead.` };
  const total = entries.reduce((n, e) => n + e.size, 0);
  if (total > MAX_DEPLOY_BYTES) return { ok: false, output: `Project is too large (${total} bytes, max ${MAX_DEPLOY_BYTES}).` };

  const sandbox = await getUserSandbox(userId);
  const files: { file: string; data: string; encoding: "base64" }[] = [];
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10);
    const bufs = await Promise.all(batch.map((e) => sandbox.readFileToBuffer({ path: `${dir}/${e.path}` })));
    batch.forEach((e, j) => {
      const b = bufs[j];
      if (b) files.push({ file: e.path, data: b.toString("base64"), encoding: "base64" });
    });
  }

  const name = deployNameFor(userHash(userId), project);
  const create = await fetch(`https://api.vercel.com/v13/deployments?${cfg.qs}${cfg.qs ? "&" : ""}skipAutoDetectionConfirmation=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, files, target: "production" }),
  });
  const created: any = await create.json().catch(() => ({}));
  if (!create.ok || !created?.id) {
    return { ok: false, output: `Deploy failed to start: ${created?.error?.message || create.status}` };
  }

  // Wait for the build (up to ~100s; the turn has a 300s budget).
  let state: string = created.readyState || "QUEUED";
  let aliases: string[] = Array.isArray(created.alias) ? created.alias : [];
  for (let i = 0; i < 25 && !["READY", "ERROR", "CANCELED"].includes(state); i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const poll = await fetch(`https://api.vercel.com/v13/deployments/${created.id}?${cfg.qs}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    const info: any = await poll.json().catch(() => ({}));
    state = info?.readyState || state;
    if (Array.isArray(info?.alias) && info.alias.length) aliases = info.alias;
  }
  // The per-deployment URL sits behind Vercel's deployment protection by
  // default; the project's production alias (<name>.vercel.app) is the
  // public one, so prefer it.
  const publicHost = aliases.find((a) => a === `${name}.vercel.app`) || aliases.find((a) => a.endsWith(".vercel.app") && !a.includes("-git-")) || created.url;
  const url = `https://${publicHost}`;
  try {
    await sql`insert into agent_deployments (user_id, project, vercel_deployment_id, url, state) values (${userId}, ${project}, ${created.id}, ${url}, ${state})`;
  } catch {
    /* table may not be migrated yet */
  }
  if (state === "READY") return { ok: true, creditsKind: "deploy", output: `Deployed. Live at ${url} (state READY, ${files.length} files).` };
  if (state === "ERROR" || state === "CANCELED") {
    return { ok: false, creditsKind: "deploy", output: `Deployment ${state}. Call get_logs with source 'deployment' to see the build log.` };
  }
  return { ok: true, creditsKind: "deploy", output: `Deployment started but is still building (state ${state}). It will be live at ${url}.` };
}

// -- create_db_table -------------------------------------------------------

async function resolveBackend(userId: string, projectId?: string): Promise<{ conn?: ConnectedBackend; error?: string }> {
  if (projectId) {
    const conn = await getConnection(projectId, userId);
    if (!conn || conn.status !== "active" || !conn.supabase_project_ref) return { error: "That project has no active database connection." };
    return { conn };
  }
  const rows = (await sql`
    select * from connected_backends where user_id = ${userId} and status = 'active' and supabase_project_ref is not null
    order by updated_at desc limit 6
  `) as unknown as ConnectedBackend[];
  if (rows.length === 0) {
    return { error: "No database is connected. Ask the user to connect one from a project in the GYSM builder (Backend panel), then retry." };
  }
  if (rows.length > 1) {
    return { error: `Several databases are connected. Call again with project_id set to one of: ${rows.map((r) => r.project_id).join(", ")}` };
  }
  return { conn: rows[0] };
}

export async function toolCreateDbTable(userId: string, args: any): Promise<ToolResult> {
  const check = validateDdl(args?.sql);
  if (check.ok === false) return { ok: false, output: check.error };
  const { conn, error } = await resolveBackend(userId, typeof args?.project_id === "string" ? args.project_id : undefined);
  if (!conn) return { ok: false, output: error || "No database available." };
  const token = await getValidAccessToken(conn);
  try {
    const result = await runSql(token, conn.supabase_project_ref!, check.statements.join(";\n") + ";");
    return { ok: true, creditsKind: "db", output: `Schema applied (${check.statements.length} statement(s)).${result ? "\n" + truncate(JSON.stringify(result), 1500) : ""}` };
  } catch (e: any) {
    return { ok: false, creditsKind: "db", output: `Database error: ${String(e?.message || e).slice(0, 800)}` };
  }
}

// -- get_logs --------------------------------------------------------------

export async function toolGetLogs(userId: string, args: any): Promise<ToolResult> {
  if (args?.source === "deployment") {
    const project = args?.project ? cleanProjectName(args.project) : null;
    let row: any;
    try {
      const rows = project
        ? await sql`select * from agent_deployments where user_id = ${userId} and project = ${project} order by created_at desc limit 1`
        : await sql`select * from agent_deployments where user_id = ${userId} order by created_at desc limit 1`;
      row = rows[0];
    } catch {
      row = null;
    }
    if (!row) return { ok: true, output: "No deployments yet." };
    const cfg = vercelConfig();
    if (!cfg) return { ok: true, output: `Latest deployment: ${row.url} (state ${row.state}). Build logs aren't available on this instance.` };
    const res = await fetch(`https://api.vercel.com/v3/deployments/${row.vercel_deployment_id}/events?limit=200&${cfg.qs}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    const events: any = await res.json().catch(() => []);
    const lines = (Array.isArray(events) ? events : [])
      .map((e: any) => e?.text ?? e?.payload?.text ?? "")
      .filter((t: string) => t)
      .join("\n");
    return { ok: true, output: `Deployment ${row.url} (state ${row.state})\n` + truncate(lines || "(no log lines)", TOOL_OUTPUT_MAX) };
  }

  try {
    const rows = await sql`select tool, ok, summary, at from agent_logs where user_id = ${userId} order by at desc limit 30`;
    if (rows.length === 0) return { ok: true, output: "No activity yet." };
    const text = rows
      .reverse()
      .map((r: any) => `${new Date(r.at).toISOString()} ${r.ok ? "ok " : "ERR"} ${r.tool}: ${r.summary}`)
      .join("\n");
    return { ok: true, output: truncate(text, TOOL_OUTPUT_MAX) };
  } catch {
    return { ok: true, output: "Activity log isn't available yet." };
  }
}

// -- phase 2: edit_file / list_dir / search ----------------------------------

const MAX_EDITABLE_BYTES = 400_000;

export async function toolEditFile(userId: string, args: any): Promise<ToolResult> {
  const rel = cleanRelPath(args?.path);
  if (!rel) return { ok: false, output: "Invalid path. Use a relative path inside the workspace." };
  const root = await workspaceRoot(userId);
  const sandbox = await getUserSandbox(userId);
  const abs = `${root}/${rel}`;
  const data = await sandbox.readFileToBuffer({ path: abs });
  if (!data) return { ok: false, output: `File not found: ${rel}` };
  if (data.length > MAX_EDITABLE_BYTES) return { ok: false, output: `File is too large to edit in place (${data.length} bytes).` };
  const edit = applyEdit(data.toString("utf8"), args?.find, args?.replace, args?.replace_all === true);
  if (edit.ok === false) return { ok: false, output: edit.error };
  const bytes = Buffer.from(edit.content, "utf8");
  if (bytes.length > MAX_WRITE_BYTES * 2) return { ok: false, output: "The edited file would be too large." };
  await sandbox.writeFiles([{ path: abs, content: bytes }]);
  return { ok: true, output: `Edited ${rel} (${edit.count} replacement${edit.count === 1 ? "" : "s"}).` };
}

export async function toolListDir(userId: string, args: any): Promise<ToolResult> {
  let rel = ".";
  if (args?.path !== undefined && args?.path !== null && String(args.path).trim() !== "" && String(args.path).trim() !== ".") {
    const c = cleanRelPath(args.path);
    if (!c) return { ok: false, output: "Invalid path. Use a relative folder inside the workspace." };
    rel = c;
  }
  const depth = Math.min(4, Math.max(1, Math.floor(Number(args?.depth)) || 2));
  const root = await workspaceRoot(userId);
  const r = await runInSandbox(
    userId,
    `cd -- ${quote(rel)} 2>/dev/null && find . -mindepth 1 -maxdepth ${depth} -not -path '*/node_modules*' -not -path '*/.git/*' -not -name .git -printf '%y %p\\n' | sort -k2 | head -300`,
    root
  );
  if (r.exitCode !== 0 && !r.output) return { ok: false, output: `Folder not found: ${rel}` };
  return { ok: true, output: r.output || "(empty)" };
}

export async function toolSearch(userId: string, args: any): Promise<ToolResult> {
  const pattern = typeof args?.pattern === "string" ? args.pattern : "";
  if (!pattern || pattern.length > 300) return { ok: false, output: "Give a pattern (max 300 characters)." };
  let rel = ".";
  if (args?.path && String(args.path).trim() !== ".") {
    const c = cleanRelPath(args.path);
    if (!c) return { ok: false, output: "Invalid path. Use a relative path inside the workspace." };
    rel = c;
  }
  const root = await workspaceRoot(userId);
  const flags = args?.ignore_case === true ? "-rnIEi" : "-rnIE";
  const r = await runInSandbox(
    userId,
    `grep ${flags} --exclude-dir=node_modules --exclude-dir=.git -m 20 -e ${quote(pattern)} -- ${quote(rel)} | head -100`,
    root
  );
  return { ok: true, output: r.output || "No matches." };
}

// -- phase 2: query_db / list_tables -----------------------------------------

export async function toolQueryDb(userId: string, args: any): Promise<ToolResult> {
  const check = validateReadSql(args?.sql);
  if (check.ok === false) return { ok: false, output: check.error };
  const { conn, error } = await resolveBackend(userId, typeof args?.project_id === "string" ? args.project_id : undefined);
  if (!conn) return { ok: false, output: error || "No database available." };
  const token = await getValidAccessToken(conn);
  try {
    const rows = await runSql(token, conn.supabase_project_ref!, check.sql);
    const text = JSON.stringify(rows);
    return { ok: true, creditsKind: "light", output: truncate(text, 8000) };
  } catch (e: any) {
    return { ok: false, creditsKind: "light", output: `Database error: ${String(e?.message || e).slice(0, 600)}` };
  }
}

const LIST_TABLES_SQL = `select c.table_name, c.column_name, c.data_type, c.is_nullable, coalesce(pt.rowsecurity, false) as rls
from information_schema.columns c
left join pg_tables pt on pt.schemaname = c.table_schema and pt.tablename = c.table_name
where c.table_schema = 'public'
order by c.table_name, c.ordinal_position`;

export async function toolListTables(userId: string, args: any): Promise<ToolResult> {
  const { conn, error } = await resolveBackend(userId, typeof args?.project_id === "string" ? args.project_id : undefined);
  if (!conn) return { ok: false, output: error || "No database available." };
  const token = await getValidAccessToken(conn);
  try {
    const rows: any = await runSql(token, conn.supabase_project_ref!, LIST_TABLES_SQL);
    if (!Array.isArray(rows)) return { ok: true, creditsKind: "light", output: truncate(JSON.stringify(rows), 4000) };
    if (rows.length === 0) return { ok: true, creditsKind: "light", output: "No tables in the public schema yet." };
    const tables = new Map<string, { rls: boolean; cols: string[] }>();
    for (const r of rows) {
      const t = tables.get(r.table_name) ?? { rls: !!r.rls, cols: [] };
      t.cols.push(`${r.column_name} ${r.data_type}${r.is_nullable === "NO" ? " not null" : ""}`);
      tables.set(r.table_name, t);
    }
    const text = Array.from(tables.entries()).map(([name, t]) => `${name} (RLS ${t.rls ? "on" : "OFF"})\n  ${t.cols.join("\n  ")}`).join("\n\n");
    return { ok: true, creditsKind: "light", output: truncate(text, 8000) };
  } catch (e: any) {
    return { ok: false, creditsKind: "light", output: `Database error: ${String(e?.message || e).slice(0, 600)}` };
  }
}

// -- phase 2: set_env --------------------------------------------------------

export async function toolSetEnv(userId: string, args: any, secret?: string): Promise<ToolResult> {
  const project = cleanProjectName(args?.project);
  if (!project) return { ok: false, output: "Invalid project name." };
  const key = validEnvKey(args?.key);
  if (!key) return { ok: false, output: "Invalid variable name. Use UPPER_SNAKE_CASE (not VERCEL_*, NODE_ENV or PATH)." };
  if (!secret || !secret.trim()) return { ok: false, output: "The user didn't provide a value." };
  const cfg = vercelConfig();
  if (!cfg) return { ok: false, output: "Environment variables aren't enabled on this GYSM instance yet (AGENT_VERCEL_TOKEN is not set)." };
  const name = deployNameFor(userHash(userId), project);
  const res = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(name)}/env?upsert=true${cfg.qs ? "&" + cfg.qs : ""}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key, value: secret, type: "encrypted", target: ["production", "preview"] }),
  });
  if (res.status === 404) return { ok: false, output: `"${project}" hasn't been deployed yet, so it has nowhere to store ${key}. Deploy it first, then call set_env.` };
  if (!res.ok) return { ok: false, output: `Couldn't save ${key} (status ${res.status}).` };
  return { ok: true, output: `${key} was saved (encrypted) for "${project}". Deploy again for it to take effect.` };
}

// -- phase 2: web_search / fetch_url -----------------------------------------

export async function toolWebSearch(_userId: string, args: any): Promise<ToolResult> {
  const query = typeof args?.query === "string" ? args.query.trim().slice(0, 300) : "";
  if (!query) return { ok: false, output: "No query given." };
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return { ok: false, output: "Web search isn't enabled on this GYSM instance yet (BRAVE_SEARCH_API_KEY is not set). Rely on what you know, or ask the user for the docs link and use fetch_url." };
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?count=8&q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { ok: false, output: `Search failed (status ${res.status}).` };
  const j: any = await res.json().catch(() => ({}));
  const results: any[] = j?.web?.results ?? [];
  if (results.length === 0) return { ok: true, creditsKind: "light", output: "No results." };
  const text = results
    .slice(0, 8)
    .map((r, i) => `${i + 1}. ${htmlToText(String(r.title ?? ""))}\n   ${r.url}\n   ${htmlToText(String(r.description ?? "")).slice(0, 300)}`)
    .join("\n");
  return { ok: true, creditsKind: "light", output: text };
}

const FETCH_MAX_BYTES = 500_000;
const FETCH_OUT_CHARS = 30_000;

// DNS lookup that refuses non-public addresses, so a hostname can't be
// pointed at an internal service (also covers DNS rebinding, since the
// socket connects to exactly the address validated here).
function safeLookup(hostname: string, options: any, callback: any) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses: any) => {
    if (err) return callback(err);
    const list: { address: string; family: number }[] = Array.isArray(addresses) ? addresses : [addresses];
    const ok = list.filter((a) => !isBlockedIp(a.address));
    if (ok.length === 0 || ok.length !== list.length) return callback(new Error("BLOCKED_ADDRESS"));
    if (options?.all) return callback(null, ok);
    callback(null, ok[0].address, ok[0].family);
  });
}

function getOnce(url: URL): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      { method: "GET", lookup: safeLookup as any, timeout: 10_000, headers: { "User-Agent": "GYSM-Agent/1.0", Accept: "text/html,text/plain,application/json,*/*;q=0.5" } },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > FETCH_MAX_BYTES) {
            chunks.push(c.subarray(0, c.length - (size - FETCH_MAX_BYTES)));
            res.destroy();
            return;
          }
          chunks.push(c);
        });
        const done = () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) });
        res.on("end", done);
        res.on("close", done);
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("TIMEOUT")));
    req.on("error", reject);
    req.end();
  });
}

export async function toolFetchUrl(_userId: string, args: any): Promise<ToolResult> {
  let check = parseFetchUrl(args?.url);
  if (check.ok === false) return { ok: false, output: check.error };
  let url = check.url;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const r = await getOnce(url);
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        const next = parseFetchUrl(new URL(String(r.headers.location), url).toString());
        if (next.ok === false) return { ok: false, output: `Redirected somewhere not allowed: ${next.error}` };
        url = next.url;
        continue;
      }
      if (r.status >= 400) return { ok: false, creditsKind: "light", output: `The server answered ${r.status}.` };
      const type = String(r.headers["content-type"] || "").toLowerCase();
      if (type && !/(text\/|json|xml|javascript|yaml|markdown)/.test(type)) {
        return { ok: false, creditsKind: "light", output: `Not a text page (${type.split(";")[0]}).` };
      }
      const raw = r.body.toString("utf8");
      const text = /html/.test(type) || /^\s*<(!doctype|html)/i.test(raw) ? htmlToText(raw) : raw;
      return { ok: true, creditsKind: "light", output: truncate(text, FETCH_OUT_CHARS) };
    }
    return { ok: false, output: "Too many redirects." };
  } catch (e: any) {
    const m = String(e?.message || e);
    if (m.includes("BLOCKED_ADDRESS")) return { ok: false, output: "That address isn't a public website." };
    return { ok: false, output: `Couldn't fetch that page (${m.slice(0, 120)}).` };
  }
}


// ---------------------------------------------------------------------------
// review_site: read-only audit of a public page. Uses the same SSRF-safe
// fetching as fetch_url, so it can only reach public addresses.

type Fetched = { status: number; headers: http.IncomingHttpHeaders; body: Buffer; finalUrl: URL; ms: number };

async function fetchFollow(start: URL, maxHops = 4): Promise<Fetched | { error: string }> {
  let url = start;
  const t0 = Date.now();
  try {
    for (let hop = 0; hop < maxHops; hop++) {
      const r = await getOnce(url);
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        const next = parseFetchUrl(new URL(String(r.headers.location), url).toString());
        if (next.ok === false) return { error: `redirects somewhere not allowed (${next.error})` };
        url = next.url;
        continue;
      }
      return { status: r.status, headers: r.headers, body: r.body, finalUrl: url, ms: Date.now() - t0 };
    }
    return { error: "too many redirects" };
  } catch (e: any) {
    const m = String(e?.message || e);
    return { error: m.includes("BLOCKED_ADDRESS") ? "not a public website" : m.slice(0, 100) };
  }
}

export async function toolReviewSite(_userId: string, args: any): Promise<ToolResult> {
  const check = parseFetchUrl(args?.url);
  if (check.ok === false) return { ok: false, output: check.error };
  const page = await fetchFollow(check.url);
  if ("error" in page) return { ok: false, creditsKind: "light", output: `Couldn't load the page: ${page.error}.` };
  if (page.status >= 400) return { ok: false, creditsKind: "light", output: `The page answered ${page.status}, so the site is not reachable for visitors.` };

  const type = String(page.headers["content-type"] || "").toLowerCase();
  if (type && !/html/.test(type)) return { ok: false, creditsKind: "light", output: `That URL is not an HTML page (${type.split(";")[0]}).` };

  const html = page.body.toString("utf8");
  const findings = analyzeHtml(html);
  const add = (severity: "high" | "medium" | "low", area: string, message: string) => findings.push({ severity, area, message });

  // Transport, speed and headers.
  const h = page.headers;
  if (page.finalUrl.protocol !== "https:") add("high", "Security", "The site is served over plain http. Use https.");
  else if (!h["strict-transport-security"]) add("low", "Security", "No Strict-Transport-Security header.");
  if (!h["x-content-type-options"]) add("low", "Security", "No X-Content-Type-Options: nosniff header.");
  if (!h["content-security-policy"] && !h["x-frame-options"]) add("low", "Security", "No clickjacking protection (X-Frame-Options or a CSP frame-ancestors rule).");
  if (page.ms > 3000) add("high", "Performance", `The page took ${(page.ms / 1000).toFixed(1)}s to answer.`);
  else if (page.ms > 1200) add("medium", "Performance", `The page took ${(page.ms / 1000).toFixed(1)}s to answer.`);

  // Broken same-site links (up to 8) plus robots.txt and sitemap.xml.
  const base = page.finalUrl.toString();
  const links = extractSameOriginLinks(html, base, 8);
  const probe = async (u: string) => {
    const parsed = parseFetchUrl(u);
    if (parsed.ok === false) return { u, status: 0 };
    const r = await fetchFollow(parsed.url, 3);
    return { u, status: "error" in r ? 0 : r.status };
  };
  const results = await Promise.all(links.map(probe));
  const broken = results.filter((r) => r.status === 0 || r.status >= 400);
  for (const b of broken) add("high", "Links", `Broken link: ${b.u} (${b.status || "no response"}).`);
  const [robots, sitemap] = await Promise.all([probe(new URL("/robots.txt", base).toString()), probe(new URL("/sitemap.xml", base).toString())]);
  if (robots.status !== 200) add("low", "SEO", "No robots.txt.");
  if (sitemap.status !== 200) add("low", "SEO", "No sitemap.xml, which helps search engines find your pages.");

  const order = { high: 0, medium: 1, low: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const kb = Math.round(page.body.length / 1024);
  const head = `Reviewed ${base}: status ${page.status}, ${(page.ms / 1000).toFixed(1)}s, ${kb} KB HTML, ${links.length} links checked.`;
  if (findings.length === 0) return { ok: true, creditsKind: "light", output: `${head}\nNo issues found by these checks.` };
  const lines = findings.map((f) => `[${f.severity.toUpperCase()}] ${f.area}: ${f.message}`);
  return { ok: true, creditsKind: "light", output: `${head}\n${findings.length} finding(s):\n${lines.join("\n")}` };
}

export async function logActivity(userId: string, tool: string, ok: boolean, summary: string): Promise<void> {
  try {
    await sql`insert into agent_logs (user_id, tool, ok, summary) values (${userId}, ${tool}, ${ok}, ${summary.slice(0, 500)})`;
  } catch {
    /* best effort: table may not be migrated */
  }
}

export async function executeTool(userId: string, name: string, args: any, secret?: string): Promise<ToolResult> {
  let result: ToolResult;
  try {
    switch (name) {
      case "write_file":
        result = await toolWriteFile(userId, args);
        break;
      case "read_file":
        result = await toolReadFile(userId, args);
        break;
      case "run_command":
        result = await toolRunCommand(userId, args);
        break;
      case "deploy":
        result = await toolDeploy(userId, args);
        break;
      case "create_db_table":
        result = await toolCreateDbTable(userId, args);
        break;
      case "get_logs":
        result = await toolGetLogs(userId, args);
        break;
      case "edit_file":
        result = await toolEditFile(userId, args);
        break;
      case "list_dir":
        result = await toolListDir(userId, args);
        break;
      case "search":
        result = await toolSearch(userId, args);
        break;
      case "query_db":
        result = await toolQueryDb(userId, args);
        break;
      case "list_tables":
        result = await toolListTables(userId, args);
        break;
      case "set_env":
        result = await toolSetEnv(userId, args, secret);
        break;
      case "web_search":
        result = await toolWebSearch(userId, args);
        break;
      case "fetch_url":
        result = await toolFetchUrl(userId, args);
        break;
      case "review_site":
        result = await toolReviewSite(userId, args);
        break;
      default:
        result = { ok: false, output: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    console.error(`[agent] tool ${name} failed:`, e?.message || e);
    result = { ok: false, output: "The tool failed unexpectedly. Try a different approach or try again." };
  }
  result.output = truncate(result.output, TOOL_OUTPUT_MAX);
  if (name !== "get_logs") await logActivity(userId, name, result.ok, result.output.split("\n")[0]);
  return result;
}
