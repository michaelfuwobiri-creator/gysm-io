// Shared "cart -> Stripe Checkout" step, used by the storefront and by AI
// assistants through the MCP server. Prices always come from the store's own
// catalogue; the customer pays on Stripe's page into the seller's account.
import { priceCart, storeCanSell, storesEnabled } from "./core";
import { attachSessionToOrder, createPendingOrder, getStoreBySlug, listProducts } from "./db";
import { storeDb } from "./connections";
import { createStoreCheckout } from "./payments";

export type CheckoutResult = { ok: true; url: string; totalCents: number; currency: string } | { ok: false; status: number; error: string };

export async function startStoreCheckout(slug: unknown, items: unknown): Promise<CheckoutResult> {
  if (!storesEnabled()) return { ok: false, status: 404, error: "Not found" };
  const store = typeof slug === "string" && slug ? await getStoreBySlug(slug.trim().toLowerCase()) : null;
  if (!store || store.status === "draft") return { ok: false, status: 404, error: "Store not found." };
  if (!storeCanSell(store)) return { ok: false, status: 409, error: "This store isn't taking orders right now." };
  const db = await storeDb(store);
  const priced = priceCart(items, await listProducts(db, store.id, { activeOnly: true }));
  if ("error" in priced) return { ok: false, status: 400, error: priced.error };
  const orderId = await createPendingOrder(db, store.id, store.currency, priced.lines, priced.totalCents);
  try {
    const session = await createStoreCheckout(store, orderId, priced.lines, priced.totalCents);
    await attachSessionToOrder(db, orderId, session.id);
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    return { ok: true, url: session.url, totalCents: priced.totalCents, currency: store.currency };
  } catch (e: any) {
    console.error("[stores/checkout] Stripe session failed:", e?.message || e);
    return { ok: false, status: 502, error: "Payments are unavailable for this store right now. Please try again later." };
  }
}
