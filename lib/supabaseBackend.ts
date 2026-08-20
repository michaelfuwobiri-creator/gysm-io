import crypto from "crypto";

// "Connect database" -- lets a user link their own Supabase project (via
// OAuth) to a build, so the generated app gets a real Postgres database
// and real auth instead of the mocked/in-memory state every build gets by
// default. GYSM.IO never hosts or pays for this data; the user's own
// Supabase org owns the project. See db/migrations/0003_connected_backends.sql
// and app/api/backend/* for how this is wired end to end.
//
// Requires a Supabase OAuth App (Organization Settings -> OAuth Apps on
// supabase.com) with these env vars set:
//   SUPABASE_OAUTH_CLIENT_ID
//   SUPABASE_OAUTH_CLIENT_SECRET
//   SUPABASE_OAUTH_REDIRECT_URI   (e.g. https://www.gysm.io/api/backend/callback)

const AUTHORIZE_URL = "https://api.supabase.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.supabase.com/v1/oauth/token";
const MGMT_BASE = "https://api.supabase.com/v1";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Set it in Vercel -> Project -> Settings -> Environment Variables.`);
  return v;
}

export function isBackendConnectConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_OAUTH_CLIENT_ID &&
      process.env.SUPABASE_OAUTH_CLIENT_SECRET &&
      process.env.SUPABASE_OAUTH_REDIRECT_URI
  );
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

export function generatePkce() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function buildAuthorizeUrl(params: { state: string; codeChallenge: string; organizationSlug?: string }) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", requireEnv("SUPABASE_OAUTH_CLIENT_ID"));
  url.searchParams.set("redirect_uri", requireEnv("SUPABASE_OAUTH_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.organizationSlug) url.searchParams.set("organization_slug", params.organizationSlug);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

export type SupabaseTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<SupabaseTokenResponse> {
  const clientId = requireEnv("SUPABASE_OAUTH_CLIENT_ID");
  const clientSecret = requireEnv("SUPABASE_OAUTH_CLIENT_SECRET");
  const redirectUri = requireEnv("SUPABASE_OAUTH_REDIRECT_URI");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    throw new Error(`Supabase token exchange failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<SupabaseTokenResponse> {
  const clientId = requireEnv("SUPABASE_OAUTH_CLIENT_ID");
  const clientSecret = requireEnv("SUPABASE_OAUTH_CLIENT_SECRET");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) {
    throw new Error(`Supabase token refresh failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Management API
// ---------------------------------------------------------------------------

async function mgmt(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${MGMT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase Management API ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function listOrganizations(accessToken: string): Promise<Array<{ id: string; name: string }>> {
  return mgmt(accessToken, "/organizations");
}

export function generateDbPassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export async function createProject(
  accessToken: string,
  opts: { name: string; organizationId: string; dbPass: string; region?: string }
): Promise<{ id: string; ref: string; name: string; status: string }> {
  return mgmt(accessToken, "/projects", {
    method: "POST",
    body: JSON.stringify({
      name: opts.name,
      organization_id: opts.organizationId,
      db_pass: opts.dbPass,
      region: opts.region || "us-east-1",
    }),
  });
}

export async function getProject(accessToken: string, ref: string) {
  return mgmt(accessToken, `/projects/${ref}`);
}

export async function getProjectApiKeys(
  accessToken: string,
  ref: string
): Promise<Array<{ name: string; api_key: string }>> {
  return mgmt(accessToken, `/projects/${ref}/api-keys`);
}

/** Runs raw SQL against the project's database via the Management API (no
 *  db password needed -- auth is the OAuth access token). Used to push the
 *  AI-generated schema for a build. */
export async function runSql(accessToken: string, ref: string, query: string) {
  return mgmt(accessToken, `/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}
