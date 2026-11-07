// Thin wrapper around Vercel's REST API for attaching a user's own domain
// to a published GYSM build. All builds are served from the single
// gysm-frontend Vercel project via /publish/[id]; adding a domain here
// registers it on that project, and middleware.ts rewrites requests that
// arrive on a verified custom domain to the right /publish/[id] page.
//
// Requires VERCEL_API_TOKEN (personal access token) in the environment.
// VERCEL_TEAM_ID / VERCEL_PROJECT_ID default to the values confirmed via
// the Vercel API for this account -- overridable by env if that ever
// changes.

const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "team_NIHpfInKBWwxPGItpVWmuNAl";
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_ZEgQaOQQkgjeHWnCVGyzpkkX26Jz";

function assertConfigured() {
  if (!VERCEL_API_TOKEN) {
    throw new Error(
      "Missing VERCEL_API_TOKEN. Set it in Vercel -> Project -> Settings -> Environment Variables to enable custom domains."
    );
  }
}

async function vercelFetch(path: string, init?: RequestInit) {
  assertConfigured();
  const url = `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${VERCEL_TEAM_ID}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${VERCEL_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Vercel API error (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export type VercelVerification = { type: string; domain: string; value: string; reason?: string };

export async function addDomainToProject(domain: string): Promise<{
  verified: boolean;
  verification: VercelVerification[];
}> {
  const data = await vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
  return { verified: !!data.verified, verification: data.verification || [] };
}

export async function getDomainStatus(domain: string): Promise<{
  verified: boolean;
  verification: VercelVerification[];
}> {
  const data = await vercelFetch(`/v9/projects/${VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`);
  return { verified: !!data.verified, verification: data.verification || [] };
}

export async function removeDomainFromProject(domain: string): Promise<void> {
  await vercelFetch(`/v9/projects/${VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`, {
    method: "DELETE",
  });
}

/**
 * Registers a gysm.io preview host on the project. Safe to call again: a host
 * that is already on the project counts as success. Optional redirect sends
 * the host to another one (used for <name>.gysm.io -> www.<name>.gysm.io).
 */
export async function ensureProjectDomain(domain: string, redirect?: string): Promise<void> {
  try {
    await vercelFetch(`/v10/projects/${VERCEL_PROJECT_ID}/domains`, {
      method: "POST",
      body: JSON.stringify(redirect ? { name: domain, redirect, redirectStatusCode: 308 } : { name: domain }),
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (/already (in use|exists|assigned|added)|domain_already/i.test(msg)) return;
    throw e;
  }
}

/**
 * Whether the domain's DNS actually points at Vercel. "verified" on the project
 * only proves ownership; a domain can be verified and still show someone else's
 * parking page until its A/CNAME record is changed.
 */
export async function getDomainDnsConfig(domain: string): Promise<{ misconfigured: boolean }> {
  const data = await vercelFetch(`/v6/domains/${encodeURIComponent(domain)}/config`);
  return { misconfigured: data?.misconfigured !== false };
}
