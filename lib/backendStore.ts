import { sql } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/supabaseBackend";

export type ConnectedBackend = {
  id: string;
  project_id: string;
  user_id: string;
  provider: string;
  supabase_org_slug: string | null;
  supabase_project_ref: string | null;
  api_url: string | null;
  anon_key: string | null;
  status: "connecting" | "provisioning" | "active" | "error" | "disconnected";
  error_message: string | null;
  schema_sql: string | null;
  created_at: string;
  updated_at: string;
};

/** Public-safe view -- never includes tokens or the db password. */
export function toPublic(row: ConnectedBackend) {
  const { id, project_id, provider, supabase_project_ref, api_url, anon_key, status, error_message, updated_at } = row;
  return { id, project_id, provider, supabase_project_ref, api_url, anon_key, status, error_message, updated_at };
}

export async function getConnection(projectId: string, userId: string): Promise<ConnectedBackend | null> {
  const rows = await sql`
    select * from connected_backends where project_id = ${projectId} and user_id = ${userId} limit 1
  `;
  return (rows[0] as any) ?? null;
}

export async function createConnectingRow(opts: {
  projectId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}) {
  const expiresAt = new Date(Date.now() + opts.expiresInSeconds * 1000).toISOString();
  const rows = await sql`
    insert into connected_backends (project_id, user_id, status, access_token_encrypted, refresh_token_encrypted, token_expires_at)
    values (${opts.projectId}, ${opts.userId}, 'connecting', ${encryptSecret(opts.accessToken)}, ${encryptSecret(opts.refreshToken)}, ${expiresAt})
    on conflict (project_id) do update set
      status = 'connecting',
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      token_expires_at = excluded.token_expires_at,
      error_message = null,
      updated_at = now()
    returning *
  `;
  return rows[0] as ConnectedBackend;
}

export async function markProvisioning(projectId: string, opts: { orgSlug: string; projectRef: string; dbPassword: string }) {
  await sql`
    update connected_backends set
      status = 'provisioning',
      supabase_org_slug = ${opts.orgSlug},
      supabase_project_ref = ${opts.projectRef},
      db_password_encrypted = ${encryptSecret(opts.dbPassword)},
      updated_at = now()
    where project_id = ${projectId}
  `;
}

export async function markActive(projectId: string, opts: { apiUrl: string; anonKey: string; schemaSql?: string }) {
  await sql`
    update connected_backends set
      status = 'active',
      api_url = ${opts.apiUrl},
      anon_key = ${opts.anonKey},
      schema_sql = coalesce(${opts.schemaSql ?? null}, schema_sql),
      error_message = null,
      updated_at = now()
    where project_id = ${projectId}
  `;
}

export async function markError(projectId: string, message: string) {
  await sql`
    update connected_backends set status = 'error', error_message = ${message}, updated_at = now()
    where project_id = ${projectId}
  `;
}

export async function disconnect(projectId: string, userId: string) {
  await sql`
    update connected_backends set status = 'disconnected', updated_at = now()
    where project_id = ${projectId} and user_id = ${userId}
  `;
}

/** Returns a live access token for this connection, transparently
 *  refreshing (and persisting the new pair) if it's expired or about to
 *  expire. */
export async function getValidAccessToken(row: ConnectedBackend): Promise<string> {
  const rows = await sql`select token_expires_at, access_token_encrypted, refresh_token_encrypted from connected_backends where id = ${row.id}`;
  const current = rows[0] as any;
  const expiresAt = current?.token_expires_at ? new Date(current.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) {
    return decryptSecret(current.access_token_encrypted);
  }
  const refreshToken = decryptSecret(current.refresh_token_encrypted);
  const fresh = await refreshAccessToken(refreshToken);
  const newExpiresAt = new Date(Date.now() + fresh.expires_in * 1000).toISOString();
  await sql`
    update connected_backends set
      access_token_encrypted = ${encryptSecret(fresh.access_token)},
      refresh_token_encrypted = ${encryptSecret(fresh.refresh_token)},
      token_expires_at = ${newExpiresAt},
      updated_at = now()
    where id = ${row.id}
  `;
  return fresh.access_token;
}

/** Every edit saves as a new project row (see app/api/generate/route.ts),
 *  so a database connection made on an earlier version needs to follow
 *  the build forward instead of being orphaned on the row it started on.
 *  Safe no-op if there was no connection on the old id. */
export async function relinkProjectId(oldProjectId: string, newProjectId: string) {
  await sql`
    update connected_backends set project_id = ${newProjectId}, updated_at = now()
    where project_id = ${oldProjectId}
  `;
}
