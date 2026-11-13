// GYSM Stores for AI assistants (the public MCP server, lib/mcp/server.ts):
// find live stores, read a store's catalogue, and start a checkout whose link
// the shopper opens to pay on Stripe. Read-only except start_checkout, which
// only records a pending order and creates a Stripe Checkout page.
import { sql } from "@/lib/db";
import { formatMoney, storeCanSell, storeUrl } from "./core";
import { getStoreBySlug, listProducts, listServices } from "./db";
import { storeDb } from "./connections";
import { startStoreCheckout } from "./checkout";

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export type StoreSummary = { slug: string; name: string; description: string; url: string; currency: string };

/** Live stores whose name, description, or (GYSM-hosted) products or services match the words. */
export async function findStores(query: unknown, limit = 10): Promise<StoreSummary[]> {
  const q = clean(query, 80);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = q
    ? await sql`
        select s.slug, s.name, s.description, s.currency from stores s
        where s.status = 'live' and (
          s.name ilike ${like} or s.description ilike ${like}
          or exists (select 1 from store_products p where p.store_id = s.id and p.active and (p.name ilike ${like} or p.description ilike ${like}))
          or exists (select 1 from store_services v where v.store_id = s.id and v.active and (v.name ilike ${like} or v.description ilike ${like})))
        order by s.updated_at desc limit ${Math.min(limit, 20)}`
    : await sql`select slug, name, description, currency from stores where status = 'live' order by updated_at desc limit ${Math.min(limit, 20)}`;
  return (rows as any[]).map((r) => ({ slug: r.slug, name: r.name, description: String(r.description ?? "").slice(0, 300), url: storeUrl(r.slug), currency: r.currency }));
}

export async function storeCatalog(slug: unknown) {
  const s = clean(slug, 40).toLowerCase();
  const store = s ? await getStoreBySlug(s) : null;
  if (!store || store.status !== "live") return null;
  const db = await storeDb(store);
  const [products, services] = await Promise.all([listProducts(db, store.id, { activeOnly: true }), listServices(db, store.id, { activeOnly: true })]);
  return {
    slug: store.slug,
    name: store.name,
    description: store.description,
    url: storeUrl(store.slug),
    currency: store.currency,
    takingOrders: storeCanSell(store),
    shippingOptions: store.collect_shipping ? (store.shipping_rates ?? []).map((r) => ({ name: r.name, price: r.amount_cents ? formatMoney(r.amount_cents, store.currency) : "free" })) : [],
    products: products.slice(0, 100).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description.slice(0, 400),
      price: formatMoney(p.price_cents, store.currency),
      priceCents: p.price_cents,
      inStock: p.stock === null ? true : p.stock > 0,
      stock: p.stock,
      image: p.image_url,
    })),
    services: services.slice(0, 50).map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description.slice(0, 400),
      durationMinutes: v.duration_min,
      price: v.price_cents ? formatMoney(v.price_cents, store.currency) : "free",
      bookOn: storeUrl(store.slug),
    })),
  };
}

export { startStoreCheckout };
