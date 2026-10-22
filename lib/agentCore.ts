// Pure helpers for GYSM Agent (no I/O, so they can be unit tested).

export const WORKSPACE_SUBDIR = "workspace/agent";
export const MAX_WRITE_BYTES = 200_000;
export const MAX_READ_BYTES = 100_000;
export const MAX_DEPLOY_FILES = 300;
export const MAX_DEPLOY_BYTES = 4 * 1024 * 1024;
export const MAX_STEPS_PER_TURN = 12;

export type ToolName =
  | "write_file"
  | "read_file"
  | "run_command"
  | "deploy"
  | "create_db_table"
  | "get_logs"
  | "edit_file"
  | "list_dir"
  | "search"
  | "query_db"
  | "list_tables"
  | "set_env"
  | "web_search"
  | "fetch_url";

// OpenAI-format tool definitions. Names and parameters match the spec the
// product was designed around.
export const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or overwrite a text file in the user's project workspace. Paths are relative to the workspace root, e.g. 'my-site/index.html'. Parent folders are created automatically.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path like 'my-site/index.html'. No '..' and no absolute paths." },
          content: { type: "string", description: "Full file contents." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file from the workspace (first 100 KB).",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative path inside the workspace." } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run one bash command in the user's private sandbox (an isolated Linux microVM with Node, Python, git and internet). It starts in the workspace root; `cd` does not persist between calls, so chain with && (e.g. `cd my-site && npm install && npm run build`). Never run interactive programs.",
      parameters: {
        type: "object",
        properties: {
          cmd: { type: "string", description: "A single bash command." },
          risky: {
            type: "boolean",
            description: "true if it deletes or overwrites files, uses sudo, or is otherwise hard to undo. The user is asked first.",
          },
        },
        required: ["cmd"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deploy",
      description:
        "Publish a project folder from the workspace to a public URL on Vercel. The user must approve every deploy. Use after the project builds locally.",
      parameters: {
        type: "object",
        properties: { project: { type: "string", description: "Project folder name inside the workspace, e.g. 'my-site'." } },
        required: ["project"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_db_table",
      description:
        "Run schema DDL (CREATE TABLE, CREATE INDEX, ALTER TABLE ... ADD, enable row level security, CREATE POLICY) on the user's own connected Supabase database. The user must approve it. Data-changing or destructive SQL is rejected.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "One or more DDL statements separated by semicolons." },
          project_id: { type: "string", description: "GYSM project id whose database to use. Optional when the user has exactly one connected database." },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_logs",
      description:
        "Get logs. source 'activity' (default) returns the agent's recent actions and their results; source 'deployment' returns the build log of the latest deployment.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string", enum: ["activity", "deployment"] },
          project: { type: "string", description: "Optional: only deployments of this project." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Make a surgical edit to an existing file: replace the exact text `find` with `replace`. Fails if `find` is not found, or matches more than once (unless replace_all is true). Prefer this over rewriting a whole file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path inside the workspace." },
          find: { type: "string", description: "Exact text to find, including whitespace. Include enough context to be unique." },
          replace: { type: "string", description: "Replacement text (may be empty to delete)." },
          replace_all: { type: "boolean", description: "Replace every occurrence instead of requiring exactly one." },
        },
        required: ["path", "find", "replace"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and folders in the workspace (skips node_modules and .git). Defaults to the workspace root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative folder, e.g. 'my-site'. Omit for the workspace root." },
          depth: { type: "integer", description: "How many levels deep (1-4, default 2)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Search file contents in the workspace with a regular expression (like grep). Returns up to 100 matching lines as path:line:text.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Extended regular expression." },
          path: { type: "string", description: "Relative folder or file to search. Omit for the whole workspace." },
          ignore_case: { type: "boolean" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_db",
      description:
        "Run one read-only SELECT (or WITH ... SELECT) against the user's connected Supabase database. Returns at most 100 rows. Cannot read system schemas; use list_tables for the schema.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "A single SELECT statement." },
          project_id: { type: "string", description: "GYSM project id. Optional when exactly one database is connected." },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tables",
      description: "Show the tables in the user's connected database (public schema): columns, types, and whether row level security is on.",
      parameters: {
        type: "object",
        properties: { project_id: { type: "string", description: "GYSM project id. Optional when exactly one database is connected." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_env",
      description:
        "Ask the user to provide a secret or setting (like an API key) for a deployed project. The USER types the value in a private box; you never see it. The variable is stored encrypted on the project's host and applies to the next deploy, so deploy again afterwards. Only the name and why it is needed go here.",
      parameters: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project folder name that was deployed." },
          key: { type: "string", description: "Variable name, UPPER_SNAKE_CASE, e.g. STRIPE_SECRET_KEY." },
          purpose: { type: "string", description: "One short sentence telling the user what this value is and where to find it." },
        },
        required: ["project", "key", "purpose"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current documentation, APIs or facts. Returns up to 8 results (title, URL, snippet). Follow up with fetch_url to read a page.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch a public web page or text/JSON file and return it as plain text (first ~30 KB). Public http(s) URLs only.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
] as const;

export const APPROVAL_TOOLS: ToolName[] = ["deploy", "create_db_table", "set_env"];

export function systemPrompt(): string {
  return `You are GYSM Agent, the autonomous builder built into gysm.io. You turn a goal into a working project by writing files, running commands, creating database tables and deploying, all inside the user's own private workspace. If asked who or what you are, say you are GYSM Agent; do not name or guess any underlying AI model or vendor.

How you work:
- Plan briefly, then act with your tools. Check each result before the next step; fix errors yourself instead of handing them back.
- Put each project in its own folder in the workspace (e.g. my-site/). Prefer simple, dependency-light stacks; static HTML/CSS/JS is fine for most sites.
- Verify before you deploy: build or open the files and confirm they are correct.
- deploy, create_db_table and set_env need the user's approval; the user sees exactly what will happen. Never try to get around that.
- Prefer edit_file for small changes, list_dir and search to find your way around, list_tables before changing a schema, and query_db to check data. Use web_search and fetch_url for current docs instead of guessing. For API keys call set_env: the user types the value privately and you never see it; never ask for a secret in chat.
- run_command is sandboxed to the user's own VM. Mark deletes, overwrites, sudo and hard-to-undo commands risky. Never run interactive programs, never attack other systems, never mine crypto, never exfiltrate secrets.
- Never write real secrets into files. Use placeholders and tell the user where to set them.
- When done, give a short summary: what you built, where it is, and the next step. Keep messages short; the user may be on a phone.`;
}

/** Resolves a user/model-supplied relative path. Returns null if it escapes the workspace. */
export function cleanRelPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim().replace(/\\/g, "/");
  if (!raw || raw.length > 300 || raw.includes("\0")) return null;
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw) || raw.startsWith("~")) return null;
  const parts: string[] = [];
  for (const seg of raw.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return null;
    parts.push(seg);
  }
  if (parts.length === 0) return null;
  if (parts.includes(".git")) return null;
  return parts.join("/");
}

/** Project folder names: a single safe path segment. */
export function cleanProjectName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,58}$/.test(name)) return null;
  return name;
}

const RISKY_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s|--recursive|--force)/,
  /\bsudo\b/,
  /\bchmod\s+-R\b/,
  /\bchown\b/,
  /\bmkfs\b|\bdd\s+if=/,
  /\|\s*(sudo\s+)?(ba)?sh\b/,
  /\bgit\s+(push|reset\s+--hard|clean\s+-[a-z]*f)/,
  /\bnpm\s+publish\b/,
  /\b(shutdown|reboot|kill\s+-9|pkill)\b/,
  />\s*\/(etc|usr|bin|var)\//,
];

export function isRiskyCommand(cmd: string, modelSaysRisky?: boolean): boolean {
  return modelSaysRisky === true || RISKY_PATTERNS.some((r) => r.test(cmd));
}

/** Whether a tool call must wait for the user's approval. */
export function needsApproval(tool: string, args: any): boolean {
  if (APPROVAL_TOOLS.includes(tool as ToolName)) return true;
  if (tool === "run_command") return isRiskyCommand(String(args?.cmd ?? ""), args?.risky === true);
  return false;
}

// ---------------------------------------------------------------------------
// DDL guard for create_db_table. Whitelist of schema-only statements.

const MAX_DDL_CHARS = 20_000;
const MAX_DDL_STATEMENTS = 20;

function stripSqlNoise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** Splits on semicolons that are outside single quotes and $$ blocks. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") inQuote = !inQuote;
    if (c === ";" && !inQuote) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const ALLOWED_START = [
  /^create\s+table\s+(if\s+not\s+exists\s+)?/i,
  /^create\s+(unique\s+)?index\s+(concurrently\s+)?(if\s+not\s+exists\s+)?/i,
  /^alter\s+table\s+(if\s+exists\s+)?(only\s+)?/i,
  /^create\s+policy\s+/i,
  /^comment\s+on\s+(table|column)\s+/i,
];

const FORBIDDEN_WORDS =
  /\b(drop|truncate|delete|update|insert|grant|revoke|copy|vacuum|call|do|execute|create\s+(or\s+replace\s+)?(function|trigger|extension|role|user|schema|database|view|materialized)|alter\s+(role|user|database|system|schema|extension)|set\s+role|security\s+definer)\b/i;

const RESERVED_SCHEMAS = /^(auth|storage|extensions|realtime|vault|graphql|graphql_public|supabase_[a-z_]+|pg_[a-z_]+|information_schema|pgbouncer|net|cron)\./i;

function targetOf(stmt: string): string {
  const m =
    stmt.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?(?:\."?[\w]+"?)?)/i) ||
    stmt.match(/^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?("?[\w.]+"?(?:\."?[\w]+"?)?)/i) ||
    stmt.match(/\bon\s+(?:table\s+)?("?[\w.]+"?(?:\."?[\w]+"?)?)/i);
  return (m?.[1] ?? "").replace(/"/g, "").toLowerCase();
}

export type DdlCheck = { ok: true; statements: string[] } | { ok: false; error: string };

export function validateDdl(input: unknown): DdlCheck {
  if (typeof input !== "string" || !input.trim()) return { ok: false, error: "No SQL given." };
  if (input.length > MAX_DDL_CHARS) return { ok: false, error: `SQL is too long (max ${MAX_DDL_CHARS} characters).` };
  const cleaned = stripSqlNoise(input);
  if (cleaned.includes("$$") || cleaned.includes("\0")) return { ok: false, error: "Dollar-quoted blocks aren't allowed." };
  const statements = splitStatements(cleaned);
  if (statements.length === 0) return { ok: false, error: "No SQL statements found." };
  if (statements.length > MAX_DDL_STATEMENTS) return { ok: false, error: `Too many statements (max ${MAX_DDL_STATEMENTS}).` };
  for (const s of statements) {
    if (!ALLOWED_START.some((r) => r.test(s))) {
      return { ok: false, error: `Only CREATE TABLE, CREATE INDEX, ALTER TABLE, CREATE POLICY and COMMENT are allowed. Rejected: ${s.slice(0, 60)}` };
    }
    if (FORBIDDEN_WORDS.test(s)) {
      return { ok: false, error: `Destructive or data-changing SQL isn't allowed. Rejected: ${s.slice(0, 60)}` };
    }
    const target = targetOf(s);
    if (target && RESERVED_SCHEMAS.test(target)) {
      return { ok: false, error: `Changes to system schemas aren't allowed (${target}).` };
    }
    if (/^alter\s+table/i.test(s) && !/\b(add\s+(column|constraint)|enable\s+row\s+level\s+security|force\s+row\s+level\s+security|rename\s+to|add\s+primary|add\s+foreign)\b/i.test(s)) {
      return { ok: false, error: `ALTER TABLE may only ADD columns/constraints or enable row level security. Rejected: ${s.slice(0, 60)}` };
    }
  }
  return { ok: true, statements };
}

// ---------------------------------------------------------------------------
// Deploy file collection

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".vercel", ".cache", "__pycache__", ".venv", "venv"]);

export function shouldSkipDeployPath(rel: string): boolean {
  const segs = rel.split("/");
  if (segs.some((s) => SKIP_DIRS.has(s))) return true;
  const base = segs[segs.length - 1];
  if (/^\.env(\..*)?$/i.test(base)) return true; // never publish secrets
  if (/\.(pem|key|p12|p8)$/i.test(base)) return true;
  return false;
}

export function deployNameFor(userHashPrefix: string, project: string): string {
  const slug = project.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "app";
  return `gysm-${userHashPrefix.slice(0, 8)}-${slug}`.slice(0, 100);
}

// ---------------------------------------------------------------------------
// History handling (OpenAI chat format, held in the browser between turns)

export type ChatMessage = {
  role: "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

const MAX_HISTORY_MESSAGES = 80;
const MAX_HISTORY_BYTES = 400_000;

export function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  let messages: ChatMessage[] = raw
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant" || m.role === "tool"))
    .map((m: any) => {
      const out: ChatMessage = { role: m.role, content: typeof m.content === "string" ? m.content : m.content == null ? null : String(m.content) };
      if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
        out.tool_calls = m.tool_calls
          .filter((t: any) => t && typeof t.id === "string" && t.function && typeof t.function.name === "string")
          .map((t: any) => ({ id: t.id, type: "function" as const, function: { name: t.function.name, arguments: typeof t.function.arguments === "string" ? t.function.arguments : "{}" } }));
        if (out.tool_calls!.length === 0) delete out.tool_calls;
      }
      if (m.role === "tool") out.tool_call_id = typeof m.tool_call_id === "string" ? m.tool_call_id : "";
      return out;
    });

  while (messages.length > 0 && (messages.length > MAX_HISTORY_MESSAGES || JSON.stringify(messages).length > MAX_HISTORY_BYTES)) {
    let cut = 1;
    while (cut < messages.length && messages[cut].role !== "user") cut++;
    messages = messages.slice(cut);
  }
  while (messages.length > 0 && messages[0].role !== "user") messages = messages.slice(1);

  // Every assistant tool_call must be answered by tool messages right after
  // it, except the final message, which may hold the call awaiting approval.
  const repaired: ChatMessage[] = [];
  messages.forEach((m, i) => {
    if (m.role === "tool") {
      const prev = repaired[repaired.length - 1];
      const ids = new Set<string>();
      for (let j = repaired.length - 1; j >= 0; j--) {
        const r = repaired[j];
        if (r.role === "assistant") {
          (r.tool_calls ?? []).forEach((t) => ids.add(t.id));
          break;
        }
      }
      if (!prev || !m.tool_call_id || !ids.has(m.tool_call_id)) return; // orphan tool message
    }
    repaired.push(m);
    if (m.role !== "assistant" || !m.tool_calls || i === messages.length - 1) return;
    const answered = new Set<string>();
    for (let j = i + 1; j < messages.length && messages[j].role === "tool"; j++) answered.add(messages[j].tool_call_id || "");
    for (const t of m.tool_calls) {
      if (!answered.has(t.id)) repaired.push({ role: "tool", tool_call_id: t.id, content: "The user did not run this." });
    }
  });
  return repaired;
}

export function pendingToolCall(messages: ChatMessage[]): { id: string; name: string; args: any } | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || !last.tool_calls?.length) return null;
  const t = last.tool_calls[0];
  let args: any = {};
  try {
    args = JSON.parse(t.function.arguments || "{}");
  } catch {
    args = {};
  }
  return { id: t.id, name: t.function.name, args };
}

/** One-line human summary of a tool call for the UI / approval card. */
export function describeCall(tool: string, args: any): string {
  switch (tool) {
    case "write_file":
      return `Write ${String(args?.path ?? "?")} (${String(args?.content ?? "").length} chars)`;
    case "read_file":
      return `Read ${String(args?.path ?? "?")}`;
    case "run_command":
      return `Run: ${String(args?.cmd ?? "").slice(0, 300)}`;
    case "deploy":
      return `Deploy project "${String(args?.project ?? "?")}" to a public URL`;
    case "create_db_table":
      return `Run schema SQL on your database`;
    case "get_logs":
      return `Get ${args?.source === "deployment" ? "deployment" : "activity"} logs`;
    case "edit_file":
      return `Edit ${String(args?.path ?? "?")}`;
    case "list_dir":
      return `List ${String(args?.path || "workspace")}`;
    case "search":
      return `Search for ${String(args?.pattern ?? "").slice(0, 80)}`;
    case "query_db":
      return `Query: ${String(args?.sql ?? "").replace(/\s+/g, " ").slice(0, 120)}`;
    case "list_tables":
      return `List database tables`;
    case "set_env":
      return `Set ${String(args?.key ?? "?")} on "${String(args?.project ?? "?")}" (you type the value)`;
    case "web_search":
      return `Search the web: ${String(args?.query ?? "").slice(0, 100)}`;
    case "fetch_url":
      return `Fetch ${String(args?.url ?? "").slice(0, 150)}`;
    default:
      return tool;
  }
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.floor(max * 0.6)) + `\n... [${s.length - max} chars cut] ...\n` + s.slice(-Math.floor(max * 0.4));
}
