// Pure helpers for gysmlink (link-in-bio pages). No database or network code,
// so everything here can be unit tested.

export const MAX_LINKS = 50;
export const MAX_TITLE = 80;
export const MAX_URL = 2000;
export const MAX_BIO = 280;
export const MAX_NAME = 60;

export const THEMES = [
  "midnight",
  "neon",
  "sunset",
  "minimal",
  "forest",
  "ocean",
  "rose",
  "mono",
] as const;
export type ThemeKey = (typeof THEMES)[number];

export type ThemeStyle = { bg: string; card: string; text: string; sub: string; button: string; buttonText: string };

export const THEME_STYLES: Record<ThemeKey, ThemeStyle> = {
  midnight: { bg: "linear-gradient(160deg,#0b1020,#1b1f3b)", card: "rgba(255,255,255,0.08)", text: "#ffffff", sub: "rgba(255,255,255,0.65)", button: "rgba(255,255,255,0.12)", buttonText: "#ffffff" },
  neon: { bg: "linear-gradient(160deg,#0a0a0f,#1a0033)", card: "rgba(255,0,128,0.08)", text: "#ffffff", sub: "rgba(255,255,255,0.65)", button: "#ff0080", buttonText: "#ffffff" },
  sunset: { bg: "linear-gradient(160deg,#ff9966,#ff5e62)", card: "rgba(255,255,255,0.2)", text: "#ffffff", sub: "rgba(255,255,255,0.85)", button: "rgba(255,255,255,0.25)", buttonText: "#ffffff" },
  minimal: { bg: "#fafafa", card: "#ffffff", text: "#111111", sub: "#666666", button: "#111111", buttonText: "#ffffff" },
  forest: { bg: "linear-gradient(160deg,#0f2d1f,#1f5130)", card: "rgba(255,255,255,0.08)", text: "#f2fff6", sub: "rgba(242,255,246,0.7)", button: "#2ecc71", buttonText: "#06220f" },
  ocean: { bg: "linear-gradient(160deg,#0b3d5c,#1478a6)", card: "rgba(255,255,255,0.12)", text: "#ffffff", sub: "rgba(255,255,255,0.8)", button: "#ffffff", buttonText: "#0b3d5c" },
  rose: { bg: "linear-gradient(160deg,#ffe4ec,#ffc2d4)", card: "rgba(255,255,255,0.6)", text: "#4a1022", sub: "#8a3a52", button: "#e11d63", buttonText: "#ffffff" },
  mono: { bg: "#000000", card: "#111111", text: "#ffffff", sub: "#9a9a9a", button: "#ffffff", buttonText: "#000000" },
};

export function isTheme(v: unknown): v is ThemeKey {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

/** Handles that would collide with routes or look official. */
const RESERVED_HANDLES = new Set([
  "go", "api", "admin", "app", "www", "gysm", "gysmlink", "support", "help", "login", "logout", "sign-in", "sign-up",
  "settings", "billing", "dashboard", "static", "assets", "new", "edit", "qr", "root", "null", "undefined",
]);

export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const h = raw.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9][a-z0-9_-]{1,29}$/.test(h)) return null; // 2-30 chars
  if (RESERVED_HANDLES.has(h)) return null;
  return h;
}

function stripControl(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

export function cleanText(raw: unknown, max: number): string {
  return typeof raw === "string" ? stripControl(raw).slice(0, max) : "";
}

/**
 * A destination URL is only accepted if it is plain http(s), mailto: or tel:,
 * has no embedded credentials and no control characters. Anything else
 * (javascript:, data:, file: ...) is rejected. Returns the normalized URL.
 */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s || s.length > MAX_URL || /[\u0000-\u001F\u007F\s]/.test(s)) return null;
  if (/^(mailto|tel):/i.test(s)) {
    const scheme = s.slice(0, s.indexOf(":")).toLowerCase();
    const rest = s.slice(s.indexOf(":") + 1);
    return rest.length > 0 && rest.length < 200 ? `${scheme}:${rest}` : null;
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`; // "example.com/x" -> https
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
  return u.toString();
}

// ---- analytics --------------------------------------------------------------

const BOT_RE = /bot|crawler|spider|preview|facebookexternalhit|slurp|headless|curl|wget|python-requests|node-fetch/i;
export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_RE.test(userAgent);
}

export type Device = "mobile" | "tablet" | "desktop";
export function deviceOf(userAgent: string | null | undefined): Device {
  const ua = userAgent || "";
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

/** Referrer host only (no path or query), or "direct". */
export function referrerHost(referer: string | null | undefined): string {
  if (!referer) return "direct";
  try {
    const h = new URL(referer).hostname.replace(/^www\./, "").toLowerCase();
    return h.slice(0, 80) || "direct";
  } catch {
    return "direct";
  }
}

export type EventRow = { kind: "view" | "click"; link_id: string | null; referrer: string; device: string };
export type LinkStat = { id: string; clicks: number; ctr: number };
export type PageStats = {
  views: number;
  clicks: number;
  ctr: number;
  perLink: LinkStat[];
  referrers: { name: string; count: number }[];
  devices: { name: string; count: number }[];
};

function top(counts: Map<string, number>, n: number) {
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([name, count]) => ({ name, count }));
}

/** Click-through rate = clicks / views, as a 0-1 fraction rounded to 3 places. */
export function summarize(events: EventRow[], linkIds: string[]): PageStats {
  let views = 0;
  let clicks = 0;
  const per = new Map<string, number>(linkIds.map((id) => [id, 0]));
  const refs = new Map<string, number>();
  const devs = new Map<string, number>();
  for (const e of events) {
    if (e.kind === "view") {
      views++;
      refs.set(e.referrer || "direct", (refs.get(e.referrer || "direct") ?? 0) + 1);
      devs.set(e.device || "desktop", (devs.get(e.device || "desktop") ?? 0) + 1);
    } else if (e.kind === "click") {
      clicks++;
      if (e.link_id && per.has(e.link_id)) per.set(e.link_id, (per.get(e.link_id) ?? 0) + 1);
    }
  }
  const ratio = (c: number) => (views > 0 ? Math.round((c / views) * 1000) / 1000 : 0);
  return {
    views,
    clicks,
    ctr: ratio(clicks),
    perLink: Array.from(per.entries()).map(([id, c]) => ({ id, clicks: c, ctr: ratio(c) })),
    referrers: top(refs, 5),
    devices: top(devs, 3),
  };
}

/** Public URL of a page. */
export function pageUrl(origin: string, handle: string): string {
  return `${origin.replace(/\/$/, "")}/l/${handle}`;
}
