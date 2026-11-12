import crypto from "crypto";
import type { StoreBlueprint } from "@/lib/blueprint";

// Pure helpers for the GYSM Shopify app (no database, no env reads), so they
// can be unit-tested. The embedded app uses Shopify "managed installation":
// Shopify installs the app with the scopes in the app config, the admin loads
// /shopify with an id_token, and the server exchanges that session token for
// an offline access token (token exchange). No OAuth redirect/callback page.

export const SHOPIFY_API_VERSION = "2026-10";

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** Returns the canonical shop domain, or null if it is not a *.myshopify.com host. */
export function normalizeShop(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  return SHOP_RE.test(s) && s.length <= 100 ? s : null;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export type SessionClaims = { shop: string; sub: string | null };

/** Verifies a Shopify session token (HS256 JWT signed with the app secret). */
export function verifySessionToken(token: unknown, secret: string, clientId: string, nowSec = Math.floor(Date.now() / 1000)): SessionClaims | null {
  if (typeof token !== "string" || !secret || !clientId) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = b64url(crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest());
  if (!safeEqual(sig, expected)) return null;
  let header: any;
  let claims: any;
  try {
    header = JSON.parse(Buffer.from(h, "base64").toString("utf8"));
    claims = JSON.parse(Buffer.from(p, "base64").toString("utf8"));
  } catch {
    return null;
  }
  if (header?.alg !== "HS256") return null;
  const leeway = 10;
  if (typeof claims?.exp !== "number" || claims.exp < nowSec - leeway) return null;
  if (typeof claims?.nbf === "number" && claims.nbf > nowSec + leeway) return null;
  if (claims.aud !== clientId) return null;
  let destHost: string | null = null;
  try {
    destHost = normalizeShop(new URL(String(claims.dest)).host);
  } catch {
    return null;
  }
  if (!destHost) return null;
  if (typeof claims.iss !== "string" || !claims.iss.startsWith(`https://${destHost}/`)) return null;
  return { shop: destHost, sub: typeof claims.sub === "string" ? claims.sub : null };
}

/** Verifies the X-Shopify-Hmac-Sha256 header of a webhook against the RAW body. */
export function verifyWebhookHmac(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return safeEqual(header, expected);
}

type FetchLike = typeof fetch;

/** Exchanges a session token for an offline access token. */
export async function exchangeToken(shop: string, idToken: string, clientId: string, secret: string, fetchImpl: FetchLike = fetch): Promise<{ accessToken: string; scope: string }> {
  const res = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: secret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: idToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
    }),
  });
  if (!res.ok) throw new Error(`Shopify token exchange failed (${res.status})`);
  const j: any = await res.json();
  if (!j?.access_token) throw new Error("Shopify token exchange returned no token");
  return { accessToken: String(j.access_token), scope: String(j.scope || "") };
}

export class ShopifyApiError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

/** Calls the Admin GraphQL API. Throws on HTTP or top-level GraphQL errors. */
export async function adminGraphql<T = any>(shop: string, accessToken: string, query: string, variables: Record<string, unknown> = {}, fetchImpl: FetchLike = fetch): Promise<T> {
  const res = await fetchImpl(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": accessToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new ShopifyApiError(`Shopify Admin API error (${res.status})`, res.status);
  const j: any = await res.json();
  if (j?.errors?.length) throw new ShopifyApiError(`Shopify GraphQL error: ${String(j.errors[0]?.message || "unknown").slice(0, 200)}`, 200);
  return j.data as T;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "19.90", "€19,90", "EUR 19.90" -> "19.90"; null if no usable positive number. */
export function parsePrice(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.replace(/\s/g, "").match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n.toFixed(2) : null;
}

export type DraftProduct = { title: string; descriptionHtml: string; price: string | null };
export type DraftPage = { title: string; body: string };

/** Turns a GYSM store plan into DRAFT products and unpublished starter pages. */
export function planToShopifyDrafts(plan: StoreBlueprint): { products: DraftProduct[]; pages: DraftPage[] } {
  const products = plan.products.slice(0, 12).map((p) => ({
    title: p.name.slice(0, 255),
    descriptionHtml: `<p>${esc(p.name)}. Replace this with your own product description.</p>`,
    price: parsePrice(p.price),
  }));
  const pages: DraftPage[] = [
    { title: "Shipping and returns", body: "<p>Write your delivery times and costs, and your returns and refunds terms here.</p>" },
    { title: "About us", body: `<p>Tell customers who you are and why you sell ${esc(plan.niche)}.</p>` },
    { title: "Contact", body: "<p>Add your business name, address, email and phone number here.</p>" },
  ];
  return { products, pages };
}
