// Friendly names for hosted previews: src.gysm.io, or www.gysm.io/s/src until
// the *.gysm.io wildcard is set up (PREVIEW_SUBDOMAINS=1 turns subdomains on).
// Pure helpers, safe for the middleware, the API and the browser.

export const MIN_SLUG = 3;
export const MAX_SLUG = 32;

// Names that would collide with real pages, mailboxes or DNS records.
export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "mail", "email", "smtp", "imap", "pop", "mx", "ns1", "ns2", "ftp", "cdn", "static", "assets",
  "info", "support", "help", "billing", "status", "docs", "blog", "dev", "staging", "test", "demo", "localhost",
  "dashboard", "builder", "agent", "auth", "login", "signin", "sign-in", "sign-up", "signup", "pricing", "templates",
  "voiie", "gang", "shield", "shell", "gysmlink", "publish", "buildguild", "root", "autodiscover", "clerk", "accounts",
]);

/** Turns anything typed into a candidate name: lowercase letters, digits and single hyphens. */
export function cleanSlug(input: unknown): string {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
}

/** A readable reason the name can't be used, or null when it is fine. Expects an already cleaned name. */
export function slugProblem(slug: string): string | null {
  if (slug.length < MIN_SLUG) return `Use at least ${MIN_SLUG} letters or numbers.`;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) return "Use only letters, numbers and hyphens.";
  if (RESERVED_SLUGS.has(slug)) return "That name is reserved. Try another.";
  return null;
}

export function previewBaseDomain(): string {
  return (process.env.PREVIEW_BASE_DOMAIN || "gysm.io").trim().toLowerCase();
}

export function subdomainsEnabled(): boolean {
  return process.env.PREVIEW_SUBDOMAINS === "1";
}

/** The two hosts a name is served on: <name>.gysm.io (main) and www.<name>.gysm.io (redirects to it). */
export function previewHostsFor(slug: string): { main: string; alias: string } {
  const base = previewBaseDomain();
  return { main: `${slug}.${base}`, alias: `www.${slug}.${base}` };
}

/** The address to show for a hosted preview. */
export function previewLinkFor(slug: string, origin: string): string {
  if (subdomainsEnabled()) return `https://${previewHostsFor(slug).main}`;
  return `${origin.replace(/\/$/, "")}/s/${slug}`;
}

/** The name in a request host such as www.src.gysm.io or src.gysm.io, or null for any other host. */
export function slugFromHost(host: string | null | undefined): string | null {
  if (!subdomainsEnabled() || !host) return null;
  const bare = host.split(":")[0].toLowerCase().replace(/\.$/, "");
  const suffix = `.${previewBaseDomain()}`;
  if (!bare.endsWith(suffix)) return null;
  let label = bare.slice(0, -suffix.length);
  if (label.startsWith("www.")) label = label.slice(4);
  if (!label || label.includes(".")) return null;
  return slugProblem(label) ? null : label;
}
