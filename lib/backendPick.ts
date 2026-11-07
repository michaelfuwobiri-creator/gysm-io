// Pure helpers for choosing which Supabase project a build uses.

export type PickProject = { ref: string; name: string; region: string; status: string };

const REF_RE = /^[a-z]{20}$/;

export function isSupabaseRef(v: unknown): v is string {
  return typeof v === "string" && REF_RE.test(v);
}

/** What the browser may see about the user's Supabase projects: no hosts, keys or org ids. */
export function publicProjectList(rows: unknown): PickProject[] {
  if (!Array.isArray(rows)) return [];
  const out: PickProject[] = [];
  for (const r of rows as any[]) {
    if (!isSupabaseRef(r?.ref)) continue;
    out.push({
      ref: r.ref,
      name: String(r.name ?? r.ref).slice(0, 80),
      region: String(r.region ?? "").slice(0, 40),
      status: String(r.status ?? "").slice(0, 40),
    });
    if (out.length >= 50) break;
  }
  return out;
}
