// Pure helpers for build comments and presence (Gap 7 slice). No database
// access here so everything can be unit tested.

export const MAX_COMMENT_CHARS = 2000;
/** A viewer counts as "here" if they pinged within this window. */
export const PRESENCE_TTL_MS = 45_000;
/** How often the builder pings while the tab is visible. */
export const HEARTBEAT_MS = 20_000;
/** Max comments one person can post per minute on builds (abuse guard). */
export const COMMENTS_PER_MINUTE = 20;
export const MAX_COMMENTS_RETURNED = 300;

/** Trim and cap a comment body; null when there is nothing to post. */
export function cleanCommentBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Strip control characters except newline/tab, then trim and cap.
  const text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, MAX_COMMENT_CHARS);
  return text.length > 0 ? text : null;
}

export function cleanDisplayName(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 60) : "";
  return s || "Teammate";
}

export type PresenceRow = { user_id: string; display_name: string; last_seen: string | Date };
export type Viewer = { name: string; you: boolean };

/**
 * Who is currently viewing: rows seen within the TTL, newest first, with the
 * caller listed first and marked `you`. User ids are not exposed to the page.
 */
export function activeViewers(rows: PresenceRow[], selfId: string, now: number = Date.now()): Viewer[] {
  const fresh = rows
    .map((r) => ({ ...r, t: new Date(r.last_seen).getTime() }))
    .filter((r) => Number.isFinite(r.t) && now - r.t <= PRESENCE_TTL_MS && r.t <= now + 60_000)
    .sort((a, b) => b.t - a.t);
  const out: Viewer[] = [];
  const seen = new Set<string>();
  for (const r of fresh) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    out.push({ name: cleanDisplayName(r.display_name), you: r.user_id === selfId });
  }
  return out.sort((a, b) => Number(b.you) - Number(a.you));
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}
