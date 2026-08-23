import crypto from "crypto";
import { sql } from "@/lib/db";

// API key generation/verification for the public /api/v1/generate
// endpoint. Only a SHA-256 hash of each key is ever stored (see
// db/migrations/0011_api_keys.sql) -- the raw key exists only in memory
// for the single response that creates it, the same pattern Stripe/GitHub/
// every other API-key product uses. Nothing here touches Clerk; this is a
// second, independent auth path used only by the v1 API, layered on top
// of the existing Clerk session auth everything else uses.
const KEY_PREFIX = "gysm_live_";

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const secret = crypto.randomBytes(24).toString("hex"); // 48 hex chars
  const rawKey = `${KEY_PREFIX}${secret}`;
  return {
    rawKey,
    keyHash: hashKey(rawKey),
    keyPrefix: rawKey.slice(0, KEY_PREFIX.length + 8), // shown in the UI, e.g. gysm_live_a1b2c3d4
  };
}

export async function verifyApiKey(rawKey: string): Promise<{ userId: string; keyId: string } | null> {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) return null;
  const keyHash = hashKey(rawKey);
  try {
    const rows = await sql`
      select id, user_id from api_keys where key_hash = ${keyHash} and revoked_at is null limit 1
    `;
    const row = rows[0] as { id: string; user_id: string } | undefined;
    if (!row) return null;
    // Fire-and-forget -- last_used_at is informational only (shown on the
    // settings page), never worth blocking or failing the actual request
    // over.
    sql`update api_keys set last_used_at = now() where id = ${row.id}`.catch(() => {});
    return { userId: row.user_id, keyId: row.id };
  } catch (error: any) {
    console.error("[apiKeys] verifyApiKey failed:", error.message);
    return null;
  }
}
