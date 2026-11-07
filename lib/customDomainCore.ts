// Pure helpers for custom domains (no network, no DB): validation and the DNS
// records a person must add at their registrar. Shared by the API route, the
// Agent tools and the middleware.

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

// Second-level labels that are part of a country suffix (example.co.uk is an apex).
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "or", "ne", "go"]);

/** Lowercases and strips a pasted URL down to a bare host. */
export function cleanDomainInput(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

/** A readable reason the domain can't be connected, or null when it is fine. Expects cleanDomainInput output. */
export function domainProblem(domain: string): string | null {
  if (!domain || domain.length > 253 || !DOMAIN_RE.test(domain)) return "Enter a valid domain, e.g. myapp.com or app.mydomain.com.";
  if (/(^|\.)gysm\.io$/.test(domain)) return "That is a GYSM address. Enter a domain you own, e.g. myapp.com.";
  if (/(^|\.)(vercel\.app|vercel\.com|vercel-dns\.com|localhost)$/.test(domain)) return "Enter a domain you own, e.g. myapp.com.";
  if (/^\d+(\.\d+){3}$/.test(domain)) return "Enter a domain name, not an IP address.";
  return null;
}

/** True for example.com / example.co.uk, false for www.example.com / app.example.co.uk. */
export function isApexDomain(domain: string): boolean {
  const labels = domain.split(".");
  if (labels.length <= 2) return true;
  if (labels.length === 3 && SECOND_LEVEL.has(labels[1]) && labels[2].length === 2) return true;
  return false;
}

export type DnsRecord = { type: "A" | "CNAME" | "TXT"; host: string; value: string; note?: string };

export function dnsRecordsFor(domain: string, verification: { type: string; domain: string; value: string }[] = []): DnsRecord[] {
  const apex = isApexDomain(domain);
  const records: DnsRecord[] = [
    apex
      ? { type: "A", host: "@", value: "76.76.21.21", note: "points the root of your domain at GYSM" }
      : { type: "CNAME", host: domain.split(".")[0], value: "cname.vercel-dns.com", note: "points this subdomain at GYSM" },
  ];
  for (const v of verification) {
    if (String(v.type).toUpperCase() === "TXT") records.push({ type: "TXT", host: v.domain, value: v.value, note: "proves you own the domain" });
  }
  return records;
}

export function describeDnsRecords(records: DnsRecord[]): string {
  return records.map((r) => `${r.type}  host: ${r.host}  value: ${r.value}${r.note ? `  (${r.note})` : ""}`).join("\n");
}
