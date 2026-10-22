import { createHash } from "crypto";
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

// The six GYSM Agent tools. Every one acts only on the calling user's own
// sandbox, database connection and deployments. Each returns plain text for
// the model plus an ok flag; the loop in lib/agent.ts handles approvals,
// credits and logging.

export type ToolResult = { ok: boolean; output: string; creditsKind?: "command" | "deploy" | "db" };

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
  for (let i = 0; i < 25 && !["READY", "ERROR", "CANCELED"].includes(state); i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const poll = await fetch(`https://api.vercel.com/v13/deployments/${created.id}?${cfg.qs}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    const info: any = await poll.json().catch(() => ({}));
    state = info?.readyState || state;
  }
  const url = `https://${created.url}`;
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

export async function logActivity(userId: string, tool: string, ok: boolean, summary: string): Promise<void> {
  try {
    await sql`insert into agent_logs (user_id, tool, ok, summary) values (${userId}, ${tool}, ${ok}, ${summary.slice(0, 500)})`;
  } catch {
    /* best effort: table may not be migrated */
  }
}

export async function executeTool(userId: string, name: string, args: any): Promise<ToolResult> {
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
