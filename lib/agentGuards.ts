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
