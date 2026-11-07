// Autonomous mode for GYSM Agent (pure helpers, no I/O).
//
// The agent normally stops for approval before it publishes a site or changes
// the user's database. "Autonomous mode" lets the user hand those approvals to
// the agent for a limited job: the user grants it explicitly (a card in the
// chat, never the model), picks what it may do and how many steps it gets, and
// it ends when the budget is used up, the chat is reset or the page reloads.
//
// Some things are never autonomous, whatever was granted: secrets, risky or
// destructive commands, anything on the user's computer, and connecting an
// account (that needs the user's own click). The "browser" scope is enforced by
// the Chrome extension itself (which sites, which kinds of click); the server
// only carries it so the agent knows it may keep going.

export const AUTONOMY_SCOPES = ["database", "publish", "browser"] as const;
export type AutonomyScope = (typeof AUTONOMY_SCOPES)[number];

export const SCOPE_LABEL: Record<AutonomyScope, string> = {
  database: "Add tables and security rules to your connected database (it can never delete data)",
  publish: "Publish sites to gysm.io",
  browser: "Click, type and open pages in your browser tabs (Chrome extension), on the sites you pick",
};

export const MIN_AUTONOMY_STEPS = 5;
export const DEFAULT_AUTONOMY_STEPS = 40;
export const MAX_AUTONOMY_STEPS = 120;

export type Autonomy = { scopes: AutonomyScope[]; maxSteps: number; used: number };

/** Validates what the browser sends. Null means "not autonomous". */
export function cleanAutonomy(raw: unknown): Autonomy | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  const scopes = Array.from(new Set((Array.isArray(r.scopes) ? r.scopes : []).filter((s: unknown): s is AutonomyScope => (AUTONOMY_SCOPES as readonly string[]).includes(String(s)))));
  const maxRaw = Math.floor(Number(r.maxSteps));
  const maxSteps = Number.isFinite(maxRaw) ? Math.min(MAX_AUTONOMY_STEPS, Math.max(MIN_AUTONOMY_STEPS, maxRaw)) : DEFAULT_AUTONOMY_STEPS;
  const usedRaw = Math.floor(Number(r.used));
  const used = Number.isFinite(usedRaw) ? Math.min(maxSteps, Math.max(0, usedRaw)) : 0;
  // With no scopes there is nothing to hand over, so it is not autonomous.
  if (scopes.length === 0) return null;
  return { scopes: scopes as AutonomyScope[], maxSteps, used };
}

/** Scopes the model may ask for in request_autonomy (unknown ones are dropped; default: all). */
export function cleanRequestedScopes(raw: unknown): AutonomyScope[] {
  const wanted = Array.isArray(raw) ? raw.filter((s): s is AutonomyScope => (AUTONOMY_SCOPES as readonly string[]).includes(String(s))) : [];
  return wanted.length ? Array.from(new Set(wanted)) : (["database", "publish"] as AutonomyScope[]);
}

export function cleanRequestedSteps(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_AUTONOMY_STEPS;
  return Math.min(MAX_AUTONOMY_STEPS, Math.max(MIN_AUTONOMY_STEPS, n));
}

export function remainingSteps(a: Autonomy | null | undefined): number {
  return a ? Math.max(0, a.maxSteps - a.used) : 0;
}

/**
 * Whether a call that would normally wait for the user may run now because of
 * the grant. Only the two scopes above are ever covered.
 */
export function autoApproves(tool: string, a: Autonomy | null | undefined): boolean {
  if (!a || remainingSteps(a) <= 0) return false;
  if (tool === "create_db_table") return a.scopes.includes("database"); // DDL is already limited to non-destructive statements
  if (tool === "deploy") return a.scopes.includes("publish");
  return false; // set_env (secrets), risky commands and everything else keep asking
}
