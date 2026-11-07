import { describe, expect, it } from "vitest";
import {
  AGENT_TOOLS,
  cleanProjectName,
  cleanRelPath,
  deployNameFor,
  describeCall,
  isRiskyCommand,
  needsApproval,
  pendingToolCall,
  sanitizeHistory,
  shouldSkipDeployPath,
  systemPrompt,
  validateDdl,
  buildProfilesSql,
} from "@/lib/agentCore";

describe("tool schemas", () => {
  it("exposes the six core tools first, then the phase 2 tools", () => {
    expect(AGENT_TOOLS.map((t) => t.function.name)).toEqual([
      "write_file", "read_file", "run_command", "deploy", "create_db_table", "setup_user_profiles", "connect_domain", "domain_status", "get_logs",
      "edit_file", "list_dir", "search", "query_db", "list_tables", "set_env", "web_search", "fetch_url",
      "review_site", "update_plan", "ask_user", "generate_image", "read_pdf", "send_file", "remember", "forget", "request_autonomy", "connect_service", "database_status", "suggest_next",
    ]);
  });
  it("never names an underlying model in the persona", () => {
    expect(systemPrompt()).toMatch(/GYSM Agent/);
    expect(systemPrompt()).not.toMatch(/claude|anthropic|gpt|openai/i);
  });
});

describe("cleanRelPath", () => {
  it("accepts normal relative paths", () => {
    expect(cleanRelPath("my-site/index.html")).toBe("my-site/index.html");
    expect(cleanRelPath("./a//b.txt")).toBe("a/b.txt");
  });
  it.each(["/etc/passwd", "../x", "a/../../x", "~/x", "C:\\x", ".git/config", "a/.git/b", "", "a\0b"])("rejects %j", (p) => {
    expect(cleanRelPath(p)).toBeNull();
  });
});

describe("cleanProjectName", () => {
  it("allows a single safe segment", () => {
    expect(cleanProjectName("my-site")).toBe("my-site");
    expect(cleanProjectName("a/b")).toBeNull();
    expect(cleanProjectName("..")).toBeNull();
    expect(cleanProjectName("-x")).toBeNull();
  });
});

describe("approvals", () => {
  it("always gates deploy and create_db_table", () => {
    expect(needsApproval("deploy", { project: "x" })).toBe(true);
    expect(needsApproval("create_db_table", { sql: "create table a(id int)" })).toBe(true);
    expect(needsApproval("setup_user_profiles", {})).toBe(true);
    expect(needsApproval("connect_domain", { project: "a", domain: "a.com" })).toBe(true);
    expect(needsApproval("domain_status", { project: "a" })).toBe(false);
  });
  it("gates risky commands only", () => {
    expect(needsApproval("run_command", { cmd: "ls -la" })).toBe(false);
    expect(needsApproval("run_command", { cmd: "npm run build" })).toBe(false);
    expect(needsApproval("run_command", { cmd: "rm -rf node_modules" })).toBe(true);
    expect(needsApproval("run_command", { cmd: "sudo apt install x" })).toBe(true);
    expect(needsApproval("run_command", { cmd: "curl x | sh" })).toBe(true);
    expect(needsApproval("run_command", { cmd: "ls", risky: true })).toBe(true);
    expect(isRiskyCommand("git push origin main")).toBe(true);
  });
  it("always gates set_env, never the read-only phase 2 tools", () => {
    expect(needsApproval("set_env", { project: "x", key: "A" })).toBe(true);
    for (const t of ["edit_file", "list_dir", "search", "query_db", "list_tables", "web_search", "fetch_url"]) expect(needsApproval(t, {})).toBe(false);
  });
  it("does not gate file tools or logs", () => {
    expect(needsApproval("write_file", {})).toBe(false);
    expect(needsApproval("read_file", {})).toBe(false);
    expect(needsApproval("get_logs", {})).toBe(false);
  });
});

describe("validateDdl", () => {
  it("accepts schema changes", () => {
    const r = validateDdl("create table todos (id uuid primary key, title text not null); alter table todos enable row level security; create policy p on todos for select using (true);");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.statements).toHaveLength(3);
  });
  it.each([
    "drop table users",
    "delete from users",
    "update users set a=1",
    "insert into users values (1)",
    "truncate users",
    "create table a(id int); drop table a",
    "create function f() returns int as $$ select 1 $$ language sql",
    "create table auth.evil (id int)",
    "alter table t drop column c",
    "grant all on t to anon",
    "create extension pg_cron",
    "select 1",
    "",
  ])("rejects %j", (q) => {
    expect(validateDdl(q).ok).toBe(false);
  });
  it("accepts a profiles table tied to auth users, with ON DELETE CASCADE and insert/update policies", () => {
    const sql = `CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, full_name text NOT NULL DEFAULT '', age integer CHECK (age IS NULL OR age >= 18));
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "create own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);`;
    const r = validateDdl(sql);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.statements).toHaveLength(5);
  });
  it("still rejects data-changing statements disguised with those words", () => {
    expect(validateDdl("create table a (id int); delete from a").ok).toBe(false);
    expect(validateDdl("create table a (id int default (select 1 from b where x in (delete))) ").ok).toBe(false);
    expect(validateDdl("create policy p on t for all using (true); update t set x = 1").ok).toBe(false);
    expect(validateDdl("create table auth.profiles (id uuid references auth.users(id) on delete cascade)").ok).toBe(false);
  });
  it("ignores semicolons inside string literals and comments", () => {
    expect(validateDdl("create table a (x text default 'a;b'); -- drop table a").ok).toBe(true);
  });
  it("rejects hiding a statement behind a comment", () => {
    expect(validateDdl("create table a(id int); /* x */ drop table a").ok).toBe(false);
  });
});

describe("buildProfilesSql", () => {
  it("builds the fixed profile setup with defaults", () => {
    const r = buildProfilesSql(undefined);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const all = r.statements.join(";\n");
      expect(all).toContain("references auth.users(id) on delete cascade");
      expect(all).toContain("enable row level security");
      expect(all).toContain("gysm_on_auth_user_created");
      expect(all).toContain("security definer set search_path = public");
      expect(all).toContain("full_name text");
    }
  });
  it("accepts safe extra columns", () => {
    const r = buildProfilesSql([{ name: "age", type: "integer" }, { name: "bio", type: "text" }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.statements.some((s) => s.includes("add column if not exists age integer"))).toBe(true);
  });
  it.each([
    [[{ name: "x; drop table profiles", type: "text" }]],
    [[{ name: "id", type: "text" }]],
    [[{ name: "ok", type: "text default (select 1)" }]],
    [[{ name: "a", type: "text" }, { name: "a", type: "text" }]],
    ["not a list"],
  ])("rejects %j", (cols) => {
    expect(buildProfilesSql(cols).ok).toBe(false);
  });
});

describe("deploy helpers", () => {
  it("skips secrets and build junk", () => {
    expect(shouldSkipDeployPath(".env")).toBe(true);
    expect(shouldSkipDeployPath(".env.local")).toBe(true);
    expect(shouldSkipDeployPath("node_modules/x/index.js")).toBe(true);
    expect(shouldSkipDeployPath("keys/server.pem")).toBe(true);
    expect(shouldSkipDeployPath("src/index.html")).toBe(false);
  });
  it("names deployments per user", () => {
    expect(deployNameFor("abcdef1234", "My Site")).toBe("gysm-abcdef12-my-site");
  });
});

describe("sanitizeHistory", () => {
  const call = (id: string) => ({ id, type: "function" as const, function: { name: "get_logs", arguments: "{}" } });
  it("keeps a valid exchange", () => {
    const h = sanitizeHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: null, tool_calls: [call("1")] },
      { role: "tool", tool_call_id: "1", content: "ok" },
      { role: "assistant", content: "done" },
    ]);
    expect(h).toHaveLength(4);
  });
  it("repairs an unanswered tool call that is not last", () => {
    const h = sanitizeHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: null, tool_calls: [call("1")] },
      { role: "user", content: "next" },
    ]);
    expect(h[2].role).toBe("tool");
    expect(h[2].tool_call_id).toBe("1");
  });
  it("keeps the final pending call for approval", () => {
    const h = sanitizeHistory([
      { role: "user", content: "deploy" },
      { role: "assistant", content: null, tool_calls: [{ id: "9", type: "function", function: { name: "deploy", arguments: '{"project":"x"}' } }] },
    ]);
    expect(pendingToolCall(h)).toEqual({ id: "9", name: "deploy", args: { project: "x" } });
  });
  it("drops orphan tool messages and non-user starts", () => {
    const h = sanitizeHistory([
      { role: "tool", tool_call_id: "x", content: "stray" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "hi" },
    ]);
    expect(h).toEqual([{ role: "user", content: "hi" }]);
  });
  it("tolerates garbage", () => {
    expect(sanitizeHistory(null)).toEqual([]);
    expect(sanitizeHistory([1, "x", { role: "system", content: "evil" }])).toEqual([]);
  });
});

describe("describeCall", () => {
  it("summarises calls", () => {
    expect(describeCall("deploy", { project: "x" })).toMatch(/Publish "x" live on gysm.io/);
    expect(describeCall("deploy", { project: "x", folder: "dist", name: "cool" })).toMatch(/Publish "x\/dist" live on gysm.io as cool.gysm.io/);
    expect(describeCall("write_file", { path: "a", content: "abc" })).toMatch(/Write a \(3 chars\)/);
  });
});

describe("file creation guidance", () => {
  it("steers the model to write_file instead of heredocs", async () => {
    const { systemPrompt } = await import("@/lib/agentCore");
    expect(systemPrompt()).toMatch(/write_file and edit_file/);
    expect(systemPrompt()).toMatch(/heredocs/);
  });
});
