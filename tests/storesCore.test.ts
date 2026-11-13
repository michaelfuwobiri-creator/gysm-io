import { describe, expect, it } from "vitest";
import {
  formatMoney, parsePriceToCents, parseProductInput, priceCart, slugProblem, slugify,
  storeCanSell, storeSlugFromHost, storeUrl, storesEnabled, type CatalogProduct,
} from "@/lib/stores/core";

const mug: CatalogProduct = { id: "p1", name: "Mug", price_cents: 1250, image_url: null, stock: 3, active: true };
const tee: CatalogProduct = { id: "p2", name: "Tee", price_cents: 2000, image_url: null, stock: null, active: true };
const old: CatalogProduct = { id: "p3", name: "Old", price_cents: 500, image_url: null, stock: null, active: false };

describe("stores flag", () => {
  it("is off unless exactly true", () => {
    expect(storesEnabled({})).toBe(false);
    expect(storesEnabled({ STORES_ENABLED: "1" })).toBe(false);
    expect(storesEnabled({ STORES_ENABLED: "true" })).toBe(true);
  });
});

describe("slugs", () => {
  it("accepts normal names", () => {
    for (const s of ["mias-bakery", "shop42", "abc"]) expect(slugProblem(s)).toBeNull();
  });
  it.each(["ab", "Upper", "a_b", "-abc", "abc-", "a--b", "www", "api", "x".repeat(41)])("rejects %j", (s) => {
    expect(slugProblem(s)).not.toBeNull();
  });
  it("suggests a slug from a name", () => {
    expect(slugify("Mia's Bakery!")).toBe("mias-bakery");
    expect(slugify("Caffè Roma")).toBe("caffe-roma");
  });
});

describe("prices", () => {
  it("parses common formats to cents", () => {
    expect(parsePriceToCents("12.50")).toBe(1250);
    expect(parsePriceToCents("12,5")).toBe(1250);
    expect(parsePriceToCents("12")).toBe(1200);
    expect(parsePriceToCents(9.99)).toBe(999);
  });
  it.each(["", "abc", "0.10", "-1", "1.234", "1e3", null, undefined, {}])("rejects %j", (v) => {
    expect(parsePriceToCents(v)).toBeNull();
  });
  it("formats money", () => {
    expect(formatMoney(1250, "eur")).toBe("€12.50");
  });
});

describe("product input", () => {
  it("accepts a valid product", () => {
    const r = parseProductInput({ name: " Mug ", price: "12.50", stock: "3", imageUrl: "https://x.com/a.png" });
    expect(r).toEqual({ ok: true, value: { name: "Mug", description: "", priceCents: 1250, imageUrl: "https://x.com/a.png", stock: 3, active: true } });
  });
  it("rejects bad input", () => {
    expect(parseProductInput({ name: "", price: "1" }).ok).toBe(false);
    expect(parseProductInput({ name: "A", price: "x" }).ok).toBe(false);
    expect(parseProductInput({ name: "A", price: "1", imageUrl: "http://x.com/a.png" }).ok).toBe(false);
    expect(parseProductInput({ name: "A", price: "1", stock: "-2" }).ok).toBe(false);
  });
});

describe("cart pricing", () => {
  const catalog = [mug, tee, old];
  it("prices from the catalogue and merges duplicate lines", () => {
    const r = priceCart([{ productId: "p1", quantity: 1 }, { productId: "p1", quantity: 1 }, { productId: "p2", quantity: 1, price: 1 }], catalog);
    expect(r).toMatchObject({ ok: true, totalCents: 4500 });
    if ("lines" in r) expect(r.lines.map((l) => [l.product.id, l.quantity])).toEqual([["p1", 2], ["p2", 1]]);
  });
  it("refuses empty, unknown, inactive and oversold carts", () => {
    expect(priceCart([], catalog).ok).toBe(false);
    expect(priceCart([{ productId: "nope", quantity: 1 }], catalog).ok).toBe(false);
    expect(priceCart([{ productId: "p3", quantity: 1 }], catalog).ok).toBe(false);
    expect(priceCart([{ productId: "p1", quantity: 4 }], catalog)).toEqual({ ok: false, error: 'Only 3 of "Mug" left.' });
    expect(priceCart([{ productId: "p2", quantity: 0 }], catalog).ok).toBe(false);
    expect(priceCart([{ productId: "p2", quantity: 1.5 }], catalog).ok).toBe(false);
  });
});

describe("store hosts and urls", () => {
  it("maps store subdomains to slugs", () => {
    expect(storeSlugFromHost("mias-bakery.gysm.store", "gysm.store")).toBe("mias-bakery");
    expect(storeSlugFromHost("www.mias-bakery.gysm.store:443", "gysm.store")).toBe("mias-bakery");
    expect(storeSlugFromHost("gysm.store", "gysm.store")).toBeNull();
    expect(storeSlugFromHost("www.gysm.store", "gysm.store")).toBeNull();
    expect(storeSlugFromHost("a.b.gysm.store", "gysm.store")).toBeNull();
    expect(storeSlugFromHost("api.gysm.store", "gysm.store")).toBeNull();
    expect(storeSlugFromHost("mias-bakery.gysm.store", undefined)).toBeNull();
    expect(storeSlugFromHost("mias-bakery.gysm.io", "gysm.store")).toBeNull();
  });
  it("builds store urls", () => {
    expect(storeUrl("mia", { STORES_ROOT_DOMAIN: "gysm.store" })).toBe("https://mia.gysm.store");
    expect(storeUrl("mia", {})).toBe("https://www.gysm.io/shop/mia");
  });
  it("sells only when live and Stripe is ready", () => {
    expect(storeCanSell({ status: "live", stripe_charges_enabled: true })).toBe(true);
    expect(storeCanSell({ status: "draft", stripe_charges_enabled: true })).toBe(false);
    expect(storeCanSell({ status: "live", stripe_charges_enabled: false })).toBe(false);
  });
});

import { cleanProviderKeys, setupGuideText } from "@/lib/stores/integrations";

describe("bring-your-own provider keys", () => {
  it("accepts a Neon connection string and keeps only public details public", () => {
    const r = cleanProviderKeys("neon", undefined, "postgresql://u:p@ep-x-1.eu-central-1.aws.neon.tech/neondb?sslmode=require");
    expect(r).toMatchObject({ ok: true, value: { publicConfig: { host: "ep-x-1.eu-central-1.aws.neon.tech", database: "neondb" } } });
  });
  it("pins hosts to the provider", () => {
    expect(cleanProviderKeys("neon", undefined, "postgresql://u:p@evil.example.com/db").ok).toBe(false);
    expect(cleanProviderKeys("supabase", "https://evil.com", "x".repeat(40)).ok).toBe(false);
    expect(cleanProviderKeys("supabase", "https://abcdefghijklmnopqrst.supabase.co", "eyJ" + "a".repeat(40)).ok).toBe(true);
  });
  it("checks Clerk keys come from the same environment", () => {
    expect(cleanProviderKeys("clerk", "pk_test_abcdefghijkl", "sk_test_abcdefghijkl").ok).toBe(true);
    expect(cleanProviderKeys("clerk", "pk_test_abcdefghijkl", "sk_live_abcdefghijkl").ok).toBe(false);
    expect(cleanProviderKeys("clerk", "nope", "sk_test_abcdefghijkl").ok).toBe(false);
  });
  it("checks Shippo tokens", () => {
    expect(cleanProviderKeys("shippo", undefined, "shippo_test_abcdef123456").ok).toBe(true);
    expect(cleanProviderKeys("shippo", undefined, "abc").ok).toBe(false);
    expect(cleanProviderKeys("shippo", undefined, "").ok).toBe(false);
  });
  it("writes a guide for the agent", () => {
    const g = setupGuideText(["stripe", "neon"]);
    expect(g).toContain("Stripe (required to sell)");
    expect(g).toContain("console.neon.tech");
  });
});

import { afterEach } from "vitest";
import { agentToolsFor, describeCall, needsApproval, storeSecretLabel } from "@/lib/agentCore";

describe("agent store tools", () => {
  const names = () => agentToolsFor(false).map((t: any) => t.function.name);
  afterEach(() => {
    delete process.env.STORES_ENABLED;
  });
  it("are offered only while stores are enabled", () => {
    expect(names().some((n: string) => n.startsWith("store_"))).toBe(false);
    process.env.STORES_ENABLED = "true";
    expect(names()).toEqual(expect.arrayContaining([
      "store_setup_guide", "store_status", "store_create", "store_add_product", "store_update_product",
      "store_remove_product", "store_orders", "store_payments_link", "store_update", "store_connect",
      "store_add_service", "store_update_service", "store_remove_service", "store_set_hours", "store_bookings", "store_cancel_booking",
    ]));
  });
  it("asks the user before creating a store or connecting keys", () => {
    expect(needsApproval("store_create", {})).toBe(true);
    expect(needsApproval("store_connect", {})).toBe(true);
    expect(needsApproval("store_payments_link", {})).toBe(true);
    expect(needsApproval("store_update", {})).toBe(true);
    expect(needsApproval("store_remove_product", {})).toBe(true);
    expect(needsApproval("store_status", {})).toBe(false);
    expect(needsApproval("store_orders", {})).toBe(false);
    expect(needsApproval("store_cancel_booking", {})).toBe(true);
    expect(needsApproval("store_remove_service", {})).toBe(true);
    expect(needsApproval("store_set_hours", {})).toBe(false);
  });
  it("labels the private box with the right key name", () => {
    expect(storeSecretLabel("clerk")).toBe("Clerk secret key");
    expect(storeSecretLabel("shippo")).toBe("Shippo API token");
    expect(describeCall("store_connect", { provider: "neon", store: "mia" })).toContain("you type the key");
  });
});
