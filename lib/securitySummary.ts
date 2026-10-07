// Pure helpers for the Security centre (app/settings/security): turn stored
// preflight results into per-build and overall summaries. No database or
// network code, so it can be unit tested.

export type StoredIssue = { type: string; message: string; detail?: string };

export type SecurityRow = {
  id: string;
  label: string;
  isPublic: boolean;
  checkStatus: string | null;
  issues: StoredIssue[];
  checkedAt: string | null;
};

export type BuildSecurity = SecurityRow & {
  /** Issues about leaked credentials (always shown first). */
  secrets: StoredIssue[];
  /** Everything else the preflight check found (broken links, cut-off pages ...). */
  quality: StoredIssue[];
  level: "secret" | "quality" | "clean" | "unchecked";
};

export type SecurityOverview = {
  builds: BuildSecurity[];
  total: number;
  withSecrets: number;
  withQualityIssues: number;
  clean: number;
  unchecked: number;
};

/** Stored check_results can be null, a JSON string, or already-parsed JSON. */
export function parseIssues(raw: unknown): StoredIssue[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((i) => i && typeof i.type === "string" && typeof i.message === "string")
    .map((i) => ({ type: i.type, message: i.message, ...(typeof i.detail === "string" ? { detail: i.detail } : {}) }));
}

export function classifyBuild(row: SecurityRow): BuildSecurity {
  const secrets = row.issues.filter((i) => i.type === "exposed_secret");
  const quality = row.issues.filter((i) => i.type !== "exposed_secret");
  let level: BuildSecurity["level"];
  if (row.checkStatus === null) level = "unchecked";
  else if (secrets.length > 0) level = "secret";
  else if (quality.length > 0) level = "quality";
  else level = "clean";
  return { ...row, secrets, quality, level };
}

const ORDER: Record<BuildSecurity["level"], number> = { secret: 0, quality: 1, unchecked: 2, clean: 3 };

export function summarize(rows: SecurityRow[]): SecurityOverview {
  const builds = rows.map(classifyBuild);
  // Leaked credentials first, and a published build outranks a private one.
  builds.sort((a, b) => ORDER[a.level] - ORDER[b.level] || Number(b.isPublic) - Number(a.isPublic));
  return {
    builds,
    total: builds.length,
    withSecrets: builds.filter((b) => b.level === "secret").length,
    withQualityIssues: builds.filter((b) => b.level === "quality").length,
    clean: builds.filter((b) => b.level === "clean").length,
    unchecked: builds.filter((b) => b.level === "unchecked").length,
  };
}
