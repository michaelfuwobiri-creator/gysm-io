import { isIP } from "net";
import { splitStatements } from "@/lib/agentCore";

// Pure safety helpers for the phase 2 agent tools (read-only SQL, env keys,
// outbound fetch, edits). No I/O here so they can be unit tested.

// -- read-only SQL -----------------------------------------------------------

const MAX_READ_SQL_CHARS = 4000;

const READ_FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|execute|vacuum|analyze|refresh|lock|listen|notify|unlisten|set|reset|into|merge|comment|security|prepare|deallocate|discard|load|import|cluster|reindex|begin|commit|rollback|savepoint|pg_sleep|set_config|dblink|lo_import|lo_export|lo_unlink|nextval|setval)\b|\bfor\s+(update|share|no\s+key)\b|\bpg_[a-z_]+/i;

const READ_RESERVED_SCHEMA =
  /(^|[^\w])"?(auth|storage|extensions|realtime|vault|graphql|graphql_public|supabase_[a-z_]+|pgbouncer|net|cron|information_schema)"?\s*\./i;

export type ReadSqlCheck = { ok: true; sql: string } | { ok: false; error: string };

/** Accepts exactly one SELECT / WITH...SELECT. Returns it wrapped so at most 100 rows come back. */
export function validateReadSql(input: unknown): ReadSqlCheck {
  if (typeof input !== "string" || !input.trim()) return { ok: false, error: "No SQL given." };
  if (input.length > MAX_READ_SQL_CHARS) return { ok: false, error: `Query is too long (max ${MAX_READ_SQL_CHARS} characters).` };
  const cleaned = input.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  if (cleaned.includes("$$") || cleaned.includes("\0")) return { ok: false, error: "Dollar-quoted blocks aren't allowed." };
  const statements = splitStatements(cleaned);
  if (statements.length !== 1) return { ok: false, error: "Send exactly one SELECT statement." };
  const stmt = statements[0].trim();
  if (!/^(select|with)\b/i.test(stmt)) return { ok: false, error: "Only SELECT queries are allowed here." };
  // Blank out string literals before scanning so data values can't trip the guards,
  // while keywords outside quotes still do.
  const noStrings = stmt.replace(/'(?:[^']|'')*'/g, "''");
  if (READ_FORBIDDEN.test(noStrings)) return { ok: false, error: "That query isn't read-only (or touches a restricted function). Use a plain SELECT." };
  if (READ_RESERVED_SCHEMA.test(noStrings)) return { ok: false, error: "System schemas (auth, storage, ...) can't be queried. Use list_tables for the schema." };
  return { ok: true, sql: `select * from (${stmt}) as gysm_q limit 100` };
}

// -- env var names -----------------------------------------------------------

export function validEnvKey(key: unknown): string | null {
  if (typeof key !== "string") return null;
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(key)) return null;
  if (/^(VERCEL|NEXT_RUNTIME|AWS_|__|PATH$|HOME$|NODE_OPTIONS$|NODE_ENV$|LD_)/.test(key)) return null;
  return key;
}

// -- outbound fetch ----------------------------------------------------------

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isBlockedIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((first & 0xff00) === 0xff00) return true; // multicast
    return false;
  }
  return true; // not an IP at all
}

export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return true;
  if (isIP(h)) return isBlockedIp(h);
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) return true;
  if (!h.includes(".")) return true; // single-label names resolve on internal networks
  return false;
}

export type FetchUrlCheck = { ok: true; url: URL } | { ok: false; error: string };

export function parseFetchUrl(raw: unknown): FetchUrlCheck {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "No URL given." };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That isn't a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "Only http and https URLs are allowed." };
  if (url.username || url.password) return { ok: false, error: "URLs with credentials aren't allowed." };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, error: "Only the standard web ports (80, 443) are allowed." };
  if (isBlockedHostname(url.hostname)) return { ok: false, error: "That address isn't a public website." };
  return { ok: true, url };
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|pre|blockquote|ul|ol|table)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// -- edit_file ---------------------------------------------------------------

export type EditResult = { ok: true; content: string; count: number } | { ok: false; error: string };

export function applyEdit(content: string, find: unknown, replace: unknown, all: boolean): EditResult {
  if (typeof find !== "string" || find.length === 0) return { ok: false, error: "`find` must be a non-empty string." };
  if (typeof replace !== "string") return { ok: false, error: "`replace` must be a string." };
  let count = 0;
  let idx = content.indexOf(find);
  while (idx !== -1) {
    count++;
    idx = content.indexOf(find, idx + find.length);
  }
  if (count === 0) return { ok: false, error: "`find` text was not found. Read the file again and copy the exact text, including whitespace." };
  if (count > 1 && !all) return { ok: false, error: `\`find\` matches ${count} places. Add more surrounding context to make it unique, or set replace_all.` };
  const out = all ? content.split(find).join(replace) : content.replace(find, () => replace);
  return { ok: true, content: out, count };
}


// ---------------------------------------------------------------------------
// Site review helpers (pure, so they can be unit tested).

export type Finding = { severity: "high" | "medium" | "low"; area: string; message: string };

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

/** Static checks on a page's HTML: SEO, accessibility, mobile and weight. */
export function analyzeHtml(html: string): Finding[] {
  const out: Finding[] = [];
  const add = (severity: Finding["severity"], area: string, message: string) => out.push({ severity, area, message });
  const head = html.slice(0, 200_000);

  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  if (!title) add("high", "SEO", "The page has no <title>. Add a short, specific title (about 30-60 characters).");
  else if (title.length > 65) add("low", "SEO", `The title is ${title.length} characters; search results cut it off around 60.`);
  else if (title.length < 10) add("low", "SEO", "The title is very short; make it describe the page.");

  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const metaNamed = (n: string) => metas.find((m) => (attr(m, "name") || attr(m, "property") || "").toLowerCase() === n);
  const desc = metaNamed("description");
  const descText = desc ? attr(desc, "content") ?? "" : "";
  if (!descText.trim()) add("medium", "SEO", "No meta description. Add one (about 120-160 characters) so search results show a good summary.");
  else if (descText.length > 170) add("low", "SEO", "The meta description is over 170 characters and will be cut off.");

  if (!metaNamed("viewport")) add("high", "Mobile", "No viewport meta tag, so the page won't scale properly on phones. Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.");
  if (!/<html\b[^>]*\blang\s*=/i.test(head)) add("medium", "Accessibility", "The <html> tag has no lang attribute. Add lang=\"en\" (or the right language).");
  if (!metaNamed("og:title") || !metaNamed("og:image")) add("low", "SEO", "Missing Open Graph tags (og:title / og:image), so shared links look plain on social apps.");
  if (!/<link\b[^>]*rel\s*=\s*["']?canonical/i.test(head)) add("low", "SEO", "No canonical link tag.");

  const h1s = (html.match(/<h1\b/gi) ?? []).length;
  if (h1s === 0) add("medium", "SEO", "No <h1> heading. Each page should have exactly one main heading.");
  else if (h1s > 1) add("low", "SEO", `${h1s} <h1> headings found; use one per page.`);

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = imgs.filter((t) => attr(t, "alt") === null).length;
  if (noAlt > 0) add("medium", "Accessibility", `${noAlt} of ${imgs.length} images have no alt attribute. Add descriptive alt text (alt="" for decorative images).`);
  const noSize = imgs.filter((t) => attr(t, "width") === null && attr(t, "height") === null && !/aspect-ratio|style=/i.test(t)).length;
  if (noSize > 2) add("low", "Performance", `${noSize} images have no width/height, which causes layout jumps while loading.`);

  const inputs = (html.match(/<(input|textarea|select)\b[^>]*>/gi) ?? []).filter((t) => !/type\s*=\s*["']?(hidden|submit|button)/i.test(t));
  const unlabeled = inputs.filter((t) => !attr(t, "aria-label") && !attr(t, "aria-labelledby") && !attr(t, "placeholder") && !attr(t, "id")).length;
  if (unlabeled > 0) add("medium", "Accessibility", `${unlabeled} form field(s) have no label, id or aria-label.`);

  if (Buffer.byteLength(html, "utf8") > 300_000) add("medium", "Performance", "The HTML itself is over 300 KB. Move large inline scripts, styles or data into separate files.");
  const blocking = (head.match(/<script\b(?![^>]*\b(async|defer|type\s*=\s*["']module)\b)[^>]*\bsrc=/gi) ?? []).length;
  if (blocking > 2) add("low", "Performance", `${blocking} scripts block rendering; add defer or async.`);
  return out;
}

/** Same-origin links on a page, absolute, de-duplicated, capped. */
export function extractSameOriginLinks(html: string, base: string, max: number): string[] {
  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return [];
  }
  const seen = new Set<string>();
  for (const m of Array.from(html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi))) {
    const href = (m[1] ?? m[2] ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|sms):/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      if (u.origin !== origin) continue;
      u.hash = "";
      seen.add(u.toString());
      if (seen.size >= max) break;
    } catch {
      /* ignore bad href */
    }
  }
  return Array.from(seen);
}

export type Suggestion = { title: string; prompt: string };

/** Validates model-supplied suggestions: 1-4 items, short title, usable prompt. */
export function cleanSuggestions(raw: unknown): Suggestion[] {
  if (!Array.isArray(raw)) return [];
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const title = typeof r?.title === "string" ? r.title.replace(/\s+/g, " ").trim().slice(0, 70) : "";
    const prompt = typeof r?.prompt === "string" ? r.prompt.replace(/\s+/g, " ").trim().slice(0, 400) : "";
    if (!title || prompt.length < 8) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, prompt });
    if (out.length === 4) break;
  }
  return out;
}
