// "Reachable lead" mode: for a local business that HAS a website, read the
// public contact email the business itself published on that site and judge
// whether the site is weak enough that a free redesign demo is a relevant
// offer. Google Places never returns an email, and a business with no
// website has no email to read -- this is the legitimate way to find
// businesses that can actually be emailed.
//
// Politeness / safety: one homepage + at most one contact page per business,
// short timeouts, a size cap, robots.txt respected (a blanket "Disallow: /"
// for all agents skips the site), no login pages, no form posting.

const UA = "Mozilla/5.0 (compatible; GYSM-VOIIE/1.0; +https://www.gysm.io)";
const MAX_BYTES = 400_000;

async function fetchText(url: string, timeoutMs = 6000): Promise<{ text: string; finalUrl: string } | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html" } });
    clearTimeout(t);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("text/plain")) return null;
    const buf = await res.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, MAX_BYTES));
    return { text, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

/** True unless robots.txt blanket-disallows everything for all agents. */
async function robotsAllows(origin: string): Promise<boolean> {
  const r = await fetchText(`${origin}/robots.txt`, 3000);
  if (!r) return true;
  let applies = false;
  for (const raw of r.text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") applies = val === "*";
    else if (applies && key === "disallow" && val === "/") return false;
  }
  return true;
}

const ROLE_LOCALPARTS = ["info", "contact", "hello", "office", "sales", "booking", "bookings", "reservations", "enquiries", "inquiries", "mail", "admin", "support", "contatti"];
const BAD_EMAIL = /(\.(png|jpe?g|gif|svg|webp|css|js)$|sentry|wixpress|example\.|your-?email|domain\.com|@2x)/i;
// Template placeholders left in site themes (john@company.com, name@email.com, ...).
const PLACEHOLDER_EMAIL = /(^(john|jane|name|yourname|your|user|username|email|test|someone|you)(\.|@|\+)|@(company|email|mail|yourcompany|yourdomain|website|mysite|site|test|sample|business|address)\.(com|net|org)$)/i;

function decodeEntities(s: string): string {
  return s.replace(/&#64;|&commat;/gi, "@").replace(/&amp;/g, "&").replace(/&#46;/g, ".").replace(/%40/g, "@");
}

export function extractEmails(html: string): string[] {
  const body = decodeEntities(html);
  const found = new Set<string>();
  for (const m of Array.from(body.matchAll(/mailto:([^"'?\s>]+)/gi))) found.add(m[1].trim().toLowerCase());
  for (const m of Array.from(body.matchAll(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi))) found.add(m[0].toLowerCase());
  return Array.from(found).filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) && !BAD_EMAIL.test(e) && !PLACEHOLDER_EMAIL.test(e));
}

function pickBestEmail(emails: string[], siteHost: string): string | null {
  if (!emails.length) return null;
  const host = siteHost.replace(/^www\./, "");
  const onDomain = emails.filter((e) => e.split("@")[1] === host || e.split("@")[1].endsWith("." + host));
  const pool = onDomain.length ? onDomain : emails;
  const role = pool.find((e) => ROLE_LOCALPARTS.includes(e.split("@")[0]));
  return role ?? pool[0];
}

export interface SiteAudit {
  url: string;
  email: string | null;
  weak: boolean;
  reasons: string[];
}

/** Fetches a business site and reports a public contact email + weakness signals. */
export async function auditSite(websiteUri: string): Promise<SiteAudit | null> {
  let origin: string;
  let host: string;
  try {
    const u = new URL(websiteUri);
    origin = u.origin;
    host = u.hostname;
  } catch {
    return null;
  }
  if (!(await robotsAllows(origin))) return null;

  const home = await fetchText(websiteUri);
  if (!home) return null;

  const reasons: string[] = [];
  let score = 0;
  const html = home.text;

  if (home.finalUrl.startsWith("http://")) { score += 1; reasons.push("no HTTPS"); }
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) { score += 2; reasons.push("not mobile-friendly"); }

  const years = Array.from(html.matchAll(/(?:©|&copy;|copyright)[^0-9<]{0,30}((?:19|20)\d{2})/gi)).map((m) => parseInt(m[1], 10));
  const latest = years.length ? Math.max(...years) : 0;
  if (latest && latest <= new Date().getFullYear() - 4) { score += 1; reasons.push(`last updated around ${latest}`); }

  const visibleText = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (visibleText.length < 500) { score += 1; reasons.push("very little content"); }

  let emails = extractEmails(html);
  if (!emails.length) {
    const link = html.match(/href=["']([^"']*(?:contact|contatt|about|chi-siamo)[^"']*)["']/i);
    if (link) {
      try {
        const contactUrl = new URL(link[1], home.finalUrl).toString();
        if (new URL(contactUrl).origin === origin) {
          const c = await fetchText(contactUrl);
          if (c) emails = extractEmails(c.text);
        }
      } catch {
        /* ignore bad href */
      }
    }
  }

  return { url: home.finalUrl, email: pickBestEmail(emails, host), weak: score >= 2, reasons };
}
