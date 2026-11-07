import { sql } from "@/lib/db";
import { addDomainToProject, getDomainDnsConfig, getDomainStatus, removeDomainFromProject, type VercelVerification } from "@/lib/vercelDomains";
import { cleanDomainInput, describeDnsRecords, dnsRecordsFor, domainProblem } from "@/lib/customDomainCore";

// Connecting a person's own domain to one of their published builds. Used by
// the Agent's connect_domain / domain_status tools; the builder's
// /api/projects/[id]/domain route does the same steps for the dashboard.

export type DomainState = {
  domain: string;
  verified: boolean;
  dnsOk: boolean | null; // null when Vercel could not say
  verification: VercelVerification[];
};

export function domainSummary(s: DomainState): string {
  const records = describeDnsRecords(dnsRecordsFor(s.domain, s.verification));
  if (s.verified && s.dnsOk) return `${s.domain} is connected and live: https://${s.domain}`;
  const head = s.verified
    ? `${s.domain} is added and verified, but its DNS doesn't point at GYSM yet.`
    : `${s.domain} is added, but ownership isn't verified yet.`;
  return `${head} At the place where the domain is registered (the DNS settings), add:\n${records}\nDNS changes can take from a few minutes up to a few hours. Then check again with domain_status.`;
}

async function saveState(projectId: string, s: DomainState) {
  await sql`
    update projects
    set custom_domain = ${s.domain},
        custom_domain_status = ${s.verified && s.dnsOk !== false ? "verified" : "pending"},
        custom_domain_verification = ${JSON.stringify(s.verification)}
    where id = ${projectId}
  `;
}

async function dnsOk(domain: string): Promise<boolean | null> {
  try {
    return !(await getDomainDnsConfig(domain)).misconfigured;
  } catch {
    return null;
  }
}

/** Attaches `input` to the project (which the caller has already checked belongs to the user). */
export async function attachDomain(projectId: string, input: unknown): Promise<{ ok: true; state: DomainState } | { ok: false; error: string }> {
  const domain = cleanDomainInput(input);
  const problem = domainProblem(domain);
  if (problem) return { ok: false, error: problem };

  const taken = (await sql`select id from projects where custom_domain = ${domain} limit 1`) as any[];
  if (taken[0] && taken[0].id !== projectId) return { ok: false, error: "That domain is already connected to a different site." };

  // One domain per site: a previously connected one is released first.
  const cur = (await sql`select custom_domain from projects where id = ${projectId} limit 1`) as any[];
  const old: string | null = cur[0]?.custom_domain ?? null;
  try {
    const added = await addDomainToProject(domain);
    if (old && old !== domain) await removeDomainFromProject(old).catch(() => {});
    const state: DomainState = { domain, verified: added.verified, dnsOk: added.verified ? await dnsOk(domain) : false, verification: added.verification };
    await saveState(projectId, state);
    return { ok: true, state };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || "Couldn't add the domain.").slice(0, 300) };
  }
}

/** Re-checks the project's connected domain with Vercel and stores the result. */
export async function refreshDomain(projectId: string): Promise<{ ok: true; state: DomainState | null } | { ok: false; error: string }> {
  const rows = (await sql`select custom_domain from projects where id = ${projectId} limit 1`) as any[];
  const domain: string | null = rows[0]?.custom_domain ?? null;
  if (!domain) return { ok: true, state: null };
  try {
    const st = await getDomainStatus(domain);
    const state: DomainState = { domain, verified: st.verified, dnsOk: st.verified ? await dnsOk(domain) : false, verification: st.verification };
    await saveState(projectId, state);
    return { ok: true, state };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || "Couldn't check the domain.").slice(0, 300) };
  }
}
