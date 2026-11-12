import crypto from "crypto";
import { describe, expect, it, vi } from "vitest";
import { makeStoreBlueprint } from "@/lib/blueprint";
import { SHOPIFY_LAUNCH_CHECKLIST, adminGraphql, hasActiveSubscription, planSelectionUrl, exchangeToken, normalizeShop, parsePrice, planToShopifyDrafts, verifySessionToken, verifyWebhookHmac } from "@/lib/shopify/core";

const SECRET = "test-secret";
const CLIENT = "client-123";
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
function jwt(claims: Record<string, unknown>, secret = SECRET, header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }) {
  const h = b64u(header);
  const p = b64u(claims);
  const sig = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${h}.${p}.${sig}`;
}
const NOW = 1_800_000_000;
const good = { iss: "https://demo.myshopify.com/admin", dest: "https://demo.myshopify.com", aud: CLIENT, sub: "42", exp: NOW + 60, nbf: NOW - 5 };

describe("normalizeShop", () => {
  it("accepts only *.myshopify.com", () => {
    expect(normalizeShop("Demo.myshopify.com")).toBe("demo.myshopify.com");
    expect(normalizeShop("evil.com")).toBeNull();
    expect(normalizeShop("demo.myshopify.com.evil.com")).toBeNull();
    expect(normalizeShop("https://demo.myshopify.com")).toBeNull();
    expect(normalizeShop(undefined)).toBeNull();
  });
});

describe("verifySessionToken", () => {
  it("accepts a valid token", () => {
    expect(verifySessionToken(jwt(good), SECRET, CLIENT, NOW)).toEqual({ shop: "demo.myshopify.com", sub: "42" });
  });
  it("rejects bad signature, audience, expiry and shop", () => {
    expect(verifySessionToken(jwt(good, "other"), SECRET, CLIENT, NOW)).toBeNull();
    expect(verifySessionToken(jwt({ ...good, aud: "x" }), SECRET, CLIENT, NOW)).toBeNull();
    expect(verifySessionToken(jwt({ ...good, exp: NOW - 60 }), SECRET, CLIENT, NOW)).toBeNull();
    expect(verifySessionToken(jwt({ ...good, nbf: NOW + 600 }), SECRET, CLIENT, NOW)).toBeNull();
    expect(verifySessionToken(jwt({ ...good, dest: "https://evil.com", iss: "https://evil.com/admin" }), SECRET, CLIENT, NOW)).toBeNull();
    expect(verifySessionToken(jwt({ ...good, iss: "https://other.myshopify.com/admin" }), SECRET, CLIENT, NOW)).toBeNull();
    expect(verifySessionToken(jwt(good, SECRET, { alg: "none" }), SECRET, CLIENT, NOW)).toBeNull();
    expect(verifySessionToken("a.b", SECRET, CLIENT, NOW)).toBeNull();
    expect(verifySessionToken(null, SECRET, CLIENT, NOW)).toBeNull();
    expect(verifySessionToken(jwt(good), "", CLIENT, NOW)).toBeNull();
  });
});

describe("verifyWebhookHmac", () => {
  const body = '{"shop_domain":"demo.myshopify.com"}';
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64");
  it("verifies the raw body", () => {
    expect(verifyWebhookHmac(body, sig, SECRET)).toBe(true);
    expect(verifyWebhookHmac(body + " ", sig, SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, null, SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, sig, "")).toBe(false);
  });
});

describe("token exchange and Admin API", () => {
  it("posts the token-exchange grant and returns the token", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: "shpat_x", scope: "read_products" }), { status: 200 }));
    const r = await exchangeToken("demo.myshopify.com", "idtok", CLIENT, SECRET, f as any);
    expect(r).toEqual({ accessToken: "shpat_x", scope: "read_products" });
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe("https://demo.myshopify.com/admin/oauth/access_token");
    const sent = JSON.parse(init.body);
    expect(sent.grant_type).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
    expect(sent.subject_token).toBe("idtok");
    expect(sent.requested_token_type).toBe("urn:shopify:params:oauth:token-type:offline-access-token");
  });
  it("throws on a failed exchange", async () => {
    const f = vi.fn(async () => new Response("no", { status: 400 }));
    await expect(exchangeToken("demo.myshopify.com", "t", CLIENT, SECRET, f as any)).rejects.toThrow();
  });
  it("sends the access token header and surfaces GraphQL errors", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ data: { a: 1 } }), { status: 200 }));
    expect(await adminGraphql("demo.myshopify.com", "tok", "{a}", {}, ok as any)).toEqual({ a: 1 });
    expect(((ok.mock.calls[0] as any)[1].headers as any)["x-shopify-access-token"]).toBe("tok");
    const bad = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "Throttled" }] }), { status: 200 }));
    await expect(adminGraphql("demo.myshopify.com", "tok", "{a}", {}, bad as any)).rejects.toThrow(/Throttled/);
  });
});

describe("planToShopifyDrafts", () => {
  it("parses prices", () => {
    expect(parsePrice("19.9")).toBe("19.90");
    expect(parsePrice("€18,50")).toBe("18.50");
    expect(parsePrice("free")).toBeNull();
    expect(parsePrice("0")).toBeNull();
  });
  it("makes draft products and three starter pages", () => {
    const plan = makeStoreBlueprint({ niche: "soy candles", products: [{ name: "Lavender candle", price: "18" }, "Cedar candle"], currency: "EUR" });
    const d = planToShopifyDrafts(plan);
    expect(d.products).toHaveLength(2);
    expect(d.products[0]).toMatchObject({ title: "Lavender candle", price: "18.00" });
    expect(d.products[1].price).toBeNull();
    expect(d.pages.map((p) => p.title)).toEqual(["Shipping and returns", "About us", "Contact"]);
  });
  it("escapes HTML in the niche", () => {
    const d = planToShopifyDrafts(makeStoreBlueprint({ niche: "<script>x</script>" }));
    expect(d.pages[1].body).not.toContain("<script>");
  });
});

describe("launch checklist", () => {
  it("is written for Shopify admin, not for the single-page builder", () => {
    const text = SHOPIFY_LAUNCH_CHECKLIST.join(" ");
    expect(SHOPIFY_LAUNCH_CHECKLIST.length).toBeGreaterThanOrEqual(5);
    expect(text).toMatch(/Settings > Payments/);
    expect(text).not.toMatch(/payment link|Generate the page/i);
  });
});

describe("Shopify App Pricing helpers", () => {
  it("detects an active subscription", async () => {
    const mk = (status: string) => vi.fn(async () => new Response(JSON.stringify({ data: { currentAppInstallation: { activeSubscriptions: [{ name: "GYSM", status }] } } }), { status: 200 }));
    expect(await hasActiveSubscription("demo.myshopify.com", "t", mk("ACTIVE") as any)).toBe(true);
    expect(await hasActiveSubscription("demo.myshopify.com", "t", mk("CANCELLED") as any)).toBe(false);
    const none = vi.fn(async () => new Response(JSON.stringify({ data: { currentAppInstallation: { activeSubscriptions: [] } } }), { status: 200 }));
    expect(await hasActiveSubscription("demo.myshopify.com", "t", none as any)).toBe(false);
  });
  it("builds the hosted plan selection URL", () => {
    expect(planSelectionUrl("demo.myshopify.com")).toBe("https://admin.shopify.com/store/demo/charges/gysm/pricing_plans");
  });
});
