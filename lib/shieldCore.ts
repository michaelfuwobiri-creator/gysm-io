// Pure rules for Shield, the agent monitor: decides whether an action reported
// by an automated agent (Zapier / Make / n8n / custom) is allowed, and what
// alerts it raises. No database or network code, so it is fully unit tested.

export type Severity = "low" | "medium" | "high" | "critical";
export type AgentStatus = "active" | "paused" | "quarantined";
export const PLATFORMS = ["zapier", "make", "n8n", "custom"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const DEFAULT_RATE_LIMIT = 60; // actions per minute
export const DEFAULT_BULK_LIMIT = 1000; // records per action
export const DEFAULT_PAYMENT_LIMIT_CENTS = 0; // payments blocked unless raised
export const MAX_PERMISSIONS = 30;
export const RATE_WINDOW_MS = 60_000;
export const SERIOUS_WINDOW_MS = 10 * 60_000;
export const SERIOUS_ALERTS_TO_QUARANTINE = 3;

export type AgentPolicy = {
  status: AgentStatus;
  permissions: string[];
  rate_limit_per_min: number;
  bulk_limit: number;
  payment_limit_cents: number;
};

export type AgentAction = {
  scope: string; // what the agent is trying to touch, e.g. "crm:read"
  action?: string; // free text, e.g. "export contacts"
  records?: number; // how many records it touched
  amount_cents?: number; // money it is trying to move
};

export type RaisedAlert = { severity: Severity; kind: string; message: string };
export type Decision = {
  allowed: boolean;
  reasons: string[];
  alerts: RaisedAlert[];
};

/** Scope syntax: "crm:read", "crm:*", "*". Lowercase letters, digits, _ - . * and ":" separators. */
export function normalizeScope(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s.length === 0 || s.length > 80) return null;
  return /^(\*|[a-z0-9_.-]+(:[a-z0-9_.*-]+)*)$/.test(s) ? s : null;
}

export function normalizePermissions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    const s = normalizeScope(item);
    if (!s) return null;
    if (!out.includes(s)) out.push(s);
  }
  return out.length <= MAX_PERMISSIONS ? out : null;
}

/** Does a granted permission cover the requested scope? "*" covers all; "crm:*" covers "crm:read". */
export function permits(granted: string, scope: string): boolean {
  if (granted === "*" || granted === scope) return true;
  if (granted.endsWith(":*")) {
    const prefix = granted.slice(0, -1); // keep the colon: "crm:"
    return scope.startsWith(prefix);
  }
  return false;
}

export function isPermitted(permissions: string[], scope: string): boolean {
  return permissions.some((p) => permits(p, scope));
}

export function nonNegInt(raw: unknown, fallback: number, max = 1_000_000_000): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/**
 * Evaluate one reported action. `recentCount` is how many actions this agent
 * already reported in the last minute (not counting this one).
 */
export function evaluate(policy: AgentPolicy, action: AgentAction, recentCount: number): Decision {
  const alerts: RaisedAlert[] = [];
  const reasons: string[] = [];

  if (policy.status === "quarantined") {
    return {
      allowed: false,
      reasons: ["agent_quarantined"],
      alerts: [{ severity: "medium", kind: "quarantined_attempt", message: `Quarantined agent tried to act on ${action.scope}.` }],
    };
  }
  if (policy.status === "paused") {
    return { allowed: false, reasons: ["agent_paused"], alerts: [] };
  }

  if (!isPermitted(policy.permissions, action.scope)) {
    reasons.push("scope_not_granted");
    alerts.push({
      severity: "high",
      kind: "scope_violation",
      message: `Tried to use "${action.scope}" but is only granted: ${policy.permissions.join(", ") || "nothing"}.`,
    });
  }

  const records = action.records ?? 0;
  if (records > policy.bulk_limit) {
    reasons.push("bulk_limit_exceeded");
    alerts.push({
      severity: "critical",
      kind: "bulk_access",
      message: `Touched ${records.toLocaleString("en-US")} records in one action (limit ${policy.bulk_limit.toLocaleString("en-US")}) on ${action.scope}.`,
    });
  }

  const amount = action.amount_cents ?? 0;
  if (amount > 0 && amount > policy.payment_limit_cents) {
    reasons.push("payment_blocked");
    alerts.push({
      severity: "high",
      kind: "blocked_payment",
      message: `Tried to move ${(amount / 100).toFixed(2)} (limit ${(policy.payment_limit_cents / 100).toFixed(2)}).`,
    });
  }

  if (recentCount >= policy.rate_limit_per_min) {
    reasons.push("rate_limit_exceeded");
    alerts.push({
      severity: "medium",
      kind: "rate_anomaly",
      message: `More than ${policy.rate_limit_per_min} actions in a minute.`,
    });
  }

  return { allowed: reasons.length === 0, reasons, alerts };
}

const RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function worst(severities: Severity[]): Severity {
  return severities.reduce<Severity>((a, b) => (RANK[b] > RANK[a] ? b : a), "low");
}

/** An agent's risk level is the worst severity among its unacknowledged alerts. */
export function riskLevel(openAlerts: { severity: Severity }[]): Severity {
  return worst(openAlerts.map((a) => a.severity));
}

/**
 * Auto-quarantine: immediately on a critical alert, or after several high/critical
 * alerts inside the serious window. `seriousRecent` counts high/critical alerts in
 * that window INCLUDING the ones just raised.
 */
export function shouldQuarantine(raised: RaisedAlert[], seriousRecent: number): boolean {
  if (raised.some((a) => a.severity === "critical")) return true;
  return seriousRecent >= SERIOUS_ALERTS_TO_QUARANTINE;
}

export function isSerious(s: Severity): boolean {
  return RANK[s] >= RANK.high;
}

/** Parse the JSON body an agent sends to the ingest endpoint. */
export function parseAction(body: unknown): AgentAction | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const scope = normalizeScope(b.scope);
  if (!scope) return null;
  const action = typeof b.action === "string" ? b.action.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 200) : undefined;
  const out: AgentAction = { scope, action };
  if (b.records !== undefined) {
    const n = Number(b.records);
    if (!Number.isFinite(n) || n < 0) return null;
    out.records = Math.floor(Math.min(n, 1e12));
  }
  if (b.amount_cents !== undefined) {
    const n = Number(b.amount_cents);
    if (!Number.isFinite(n) || n < 0) return null;
    out.amount_cents = Math.floor(Math.min(n, 1e12));
  }
  return out;
}
