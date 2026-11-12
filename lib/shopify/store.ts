import { sql } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { exchangeToken, normalizeShop, verifySessionToken } from "./core";

// Server-side glue: session-token auth + the shopify_shops table
// (db/migrations/0038_shopify.sql).

export function shopifyConfig() {
  const clientId = process.env.SHOPIFY_API_KEY || "";
  const secret = process.env.SHOPIFY_API_SECRET || "";
  return { clientId, secret, ready: Boolean(clientId && secret) };
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

/**
 * Verifies the session token and returns the shop plus its Admin API token,
 * exchanging the session token for an offline token on first use (or after a
 * reinstall).
 */
export async function authenticateShop(req: Request): Promise<{ shop: string; accessToken: string } | null> {
  const cfg = shopifyConfig();
  if (!cfg.ready) return null;
  const idToken = bearer(req);
  const claims = verifySessionToken(idToken, cfg.secret, cfg.clientId);
  if (!claims || !idToken) return null;
  const shop = claims.shop;
  const rows = (await sql`select access_token_enc from shopify_shops where shop = ${shop} and uninstalled_at is null`) as { access_token_enc: string }[];
  if (rows[0]?.access_token_enc) {
    try {
      return { shop, accessToken: decryptSecret(rows[0].access_token_enc) };
    } catch {
      // Key rotated or row damaged: fall through and exchange a fresh token.
    }
  }
  const { accessToken, scope } = await exchangeToken(shop, idToken, cfg.clientId, cfg.secret);
  const enc = encryptSecret(accessToken);
  await sql`
    insert into shopify_shops (shop, access_token_enc, scope, installed_at, uninstalled_at)
    values (${shop}, ${enc}, ${scope}, now(), null)
    on conflict (shop) do update set access_token_enc = ${enc}, scope = ${scope}, installed_at = now(), uninstalled_at = null`;
  return { shop, accessToken };
}

export async function markUninstalled(rawShop: string) {
  const shop = normalizeShop(rawShop);
  if (!shop) return;
  await sql`update shopify_shops set uninstalled_at = now(), access_token_enc = '' where shop = ${shop}`;
}

export async function eraseShop(rawShop: string) {
  const shop = normalizeShop(rawShop);
  if (!shop) return;
  await sql`delete from shopify_shops where shop = ${shop}`;
}

export async function recordBuild(shop: string) {
  await sql`update shopify_shops set builds = builds + 1, last_build_at = now() where shop = ${shop}`;
}
