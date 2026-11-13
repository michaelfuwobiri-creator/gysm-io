import { priceCart, storeCanSell, storesEnabled } from "@/lib/stores/core";
import { attachSessionToOrder, createPendingOrder, getStoreBySlug, listProducts } from "@/lib/stores/db";
import { storeDb } from "@/lib/stores/connections";
import { createStoreCheckout } from "@/lib/stores/payments";
import { json, readJson } from "@/lib/stores/api";

export const runtime = "nodejs";

/** Public: a customer's cart -> a Stripe Checkout page on the seller's account. */
export async function POST(req: Request) {
  if (!storesEnabled()) return json({ error: "Not found" }, 404);
  const body = await readJson(req);
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const store = slug ? await getStoreBySlug(slug) : null;
  if (!store || store.status === "draft") return json({ error: "Store not found." }, 404);
  if (!storeCanSell(store)) return json({ error: "This store isn't taking orders right now." }, 409);

  const db = await storeDb(store);
  const priced = priceCart(body?.items, await listProducts(db, store.id, { activeOnly: true }));
  if ("error" in priced) return json({ error: priced.error }, 400);

  const orderId = await createPendingOrder(db, store.id, store.currency, priced.lines, priced.totalCents);
  try {
    const session = await createStoreCheckout(store, orderId, priced.lines, priced.totalCents);
    await attachSessionToOrder(db, orderId, session.id);
    return json({ url: session.url });
  } catch (e: any) {
    console.error("[stores/checkout] Stripe session failed:", e?.message || e);
    return json({ error: "Payments are unavailable for this store right now. Please try again later." }, 502);
  }
}
