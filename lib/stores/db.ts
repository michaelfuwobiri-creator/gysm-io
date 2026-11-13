// GYSM Stores data access (Neon). Every seller-facing query is scoped by
// user_id or by a store_id the caller has already been checked to own, the
// same pattern as the rest of this app (see lib/db.ts).
import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import type { CartLine, CatalogProduct, ProductInput } from "./core";

/** A Neon query function: GYSM's own database, or the seller's (see lib/stores/connections.ts). */
export type Db = typeof sql;

export type StoreRow = {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  description: string;
  currency: string;
  notify_email: string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  status: "draft" | "live" | "paused";
  db_provider: "gysm" | "neon";
  collect_shipping: boolean;
  created_at: string;
};

export type ProductRow = CatalogProduct & { store_id: string; description: string; sort: number };

export type OrderRow = {
  id: string;
  store_id: string;
  status: string;
  currency: string;
  amount_total_cents: number;
  customer_email: string | null;
  customer_name: string | null;
  shipping: any;
  stripe_session_id: string | null;
  created_at: string;
  paid_at: string | null;
  items?: { name: string; quantity: number; unit_price_cents: number }[];
};

export async function listStoresForUser(userId: string): Promise<StoreRow[]> {
  return (await sql`select * from stores where user_id = ${userId} order by created_at desc`) as StoreRow[];
}

export async function getStoreForUser(id: string, userId: string): Promise<StoreRow | null> {
  if (!isUuid(id)) return null;
  const rows = await sql`select * from stores where id = ${id} and user_id = ${userId} limit 1`;
  return (rows[0] as StoreRow) ?? null;
}

export async function getStoreBySlug(slug: string): Promise<StoreRow | null> {
  const rows = await sql`select * from stores where slug = ${slug} limit 1`;
  return (rows[0] as StoreRow) ?? null;
}

export async function getStoreById(id: string): Promise<StoreRow | null> {
  if (!isUuid(id)) return null;
  const rows = await sql`select * from stores where id = ${id} limit 1`;
  return (rows[0] as StoreRow) ?? null;
}

/** Returns null when the slug is already taken. */
export async function createStore(input: {
  userId: string;
  name: string;
  slug: string;
  currency: string;
  notifyEmail: string | null;
}): Promise<StoreRow | null> {
  try {
    const rows = await sql`
      insert into stores (user_id, name, slug, currency, notify_email)
      values (${input.userId}, ${input.name}, ${input.slug}, ${input.currency}, ${input.notifyEmail})
      returning *`;
    return rows[0] as StoreRow;
  } catch (error: any) {
    if (error?.code === "23505") return null;
    throw error;
  }
}

export async function updateStore(
  id: string,
  userId: string,
  patch: { name?: string; description?: string; notifyEmail?: string | null; status?: string; collectShipping?: boolean },
): Promise<StoreRow | null> {
  const rows = await sql`
    update stores set
      name = coalesce(${patch.name ?? null}, name),
      description = coalesce(${patch.description ?? null}, description),
      notify_email = case when ${patch.notifyEmail !== undefined} then ${patch.notifyEmail ?? null} else notify_email end,
      status = coalesce(${patch.status ?? null}, status),
      collect_shipping = coalesce(${patch.collectShipping ?? null}, collect_shipping),
      updated_at = now()
    where id = ${id} and user_id = ${userId}
    returning *`;
  return (rows[0] as StoreRow) ?? null;
}

export async function setStoreStripeAccount(id: string, userId: string, accountId: string): Promise<void> {
  await sql`update stores set stripe_account_id = ${accountId}, updated_at = now() where id = ${id} and user_id = ${userId}`;
}

export async function setChargesEnabled(accountId: string, enabled: boolean): Promise<void> {
  await sql`update stores set stripe_charges_enabled = ${enabled}, updated_at = now() where stripe_account_id = ${accountId}`;
}

export async function listProducts(db: Db, storeId: string, opts: { activeOnly?: boolean } = {}): Promise<ProductRow[]> {
  const rows = opts.activeOnly
    ? await db`select * from store_products where store_id = ${storeId} and active order by sort, created_at`
    : await db`select * from store_products where store_id = ${storeId} order by sort, created_at`;
  return rows as ProductRow[];
}

export async function createProduct(db: Db, storeId: string, p: ProductInput): Promise<ProductRow> {
  const rows = await db`
    insert into store_products (store_id, name, description, price_cents, image_url, stock, active, sort)
    values (${storeId}, ${p.name}, ${p.description}, ${p.priceCents}, ${p.imageUrl}, ${p.stock}, ${p.active},
            (select coalesce(max(sort), 0) + 1 from store_products where store_id = ${storeId}))
    returning *`;
  return rows[0] as ProductRow;
}

export async function updateProduct(db: Db, storeId: string, productId: string, p: ProductInput): Promise<ProductRow | null> {
  if (!isUuid(productId)) return null;
  const rows = await db`
    update store_products set name = ${p.name}, description = ${p.description}, price_cents = ${p.priceCents},
      image_url = ${p.imageUrl}, stock = ${p.stock}, active = ${p.active}
    where id = ${productId} and store_id = ${storeId}
    returning *`;
  return (rows[0] as ProductRow) ?? null;
}

export async function deleteProduct(db: Db, storeId: string, productId: string): Promise<boolean> {
  if (!isUuid(productId)) return false;
  const rows = await db`delete from store_products where id = ${productId} and store_id = ${storeId} returning id`;
  return rows.length > 0;
}

/** Records an order before payment so the webhook can match the Stripe session back to it. */
export async function createPendingOrder(db: Db, storeId: string, currency: string, lines: CartLine[], totalCents: number): Promise<string> {
  const orderId = randomUUID();
  await db.transaction([
    db`insert into store_orders (id, store_id, currency, amount_total_cents) values (${orderId}, ${storeId}, ${currency}, ${totalCents})`,
    ...lines.map(
      (l) => db`
        insert into store_order_items (order_id, product_id, name, unit_price_cents, quantity)
        values (${orderId}, ${l.product.id}, ${l.product.name}, ${l.product.price_cents}, ${l.quantity})`,
    ),
  ]);
  return orderId;
}

export async function attachSessionToOrder(db: Db, orderId: string, sessionId: string): Promise<void> {
  await db`update store_orders set stripe_session_id = ${sessionId} where id = ${orderId}`;
}

/**
 * Marks the order paid exactly once (Stripe may deliver the same event twice)
 * and takes the sold quantities off stock. Returns the order only on the first call.
 */
export async function markOrderPaid(
  db: Db,
  orderId: string,
  sessionId: string,
  details: { amountTotalCents: number | null; email: string | null; name: string | null; shipping: unknown },
): Promise<OrderRow | null> {
  if (!isUuid(orderId)) return null;
  const rows = await db`
    update store_orders set status = 'paid', paid_at = now(), stripe_session_id = ${sessionId},
      amount_total_cents = coalesce(${details.amountTotalCents}, amount_total_cents),
      customer_email = ${details.email}, customer_name = ${details.name},
      shipping = ${details.shipping ? JSON.stringify(details.shipping) : null}::jsonb
    where id = ${orderId} and status = 'pending'
    returning *`;
  const order = (rows[0] as OrderRow) ?? null;
  if (!order) return null;
  await db`
    update store_products p set stock = greatest(p.stock - i.quantity, 0)
    from store_order_items i
    where i.order_id = ${orderId} and p.id = i.product_id and p.stock is not null`;
  order.items = (await db`
    select name, quantity, unit_price_cents from store_order_items where order_id = ${orderId} order by name`) as any;
  return order;
}

export async function markOrderExpired(db: Db, orderId: string): Promise<void> {
  if (!isUuid(orderId)) return;
  await db`update store_orders set status = 'expired' where id = ${orderId} and status = 'pending'`;
}

export async function listOrders(db: Db, storeId: string, limit = 50): Promise<OrderRow[]> {
  return (await db`
    select o.*, coalesce(json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents))
             filter (where i.id is not null), '[]') as items
    from store_orders o left join store_order_items i on i.order_id = o.id
    where o.store_id = ${storeId} and o.status <> 'pending'
    group by o.id order by o.created_at desc limit ${limit}`) as OrderRow[];
}

/** True when the store has no products and no orders in this database (safe to switch databases). */
export async function storeIsEmpty(db: Db, storeId: string): Promise<boolean> {
  const rows = await db`
    select (select count(*) from store_products where store_id = ${storeId})::int as products,
           (select count(*) from store_orders where store_id = ${storeId})::int as orders`;
  const r = rows[0] as any;
  return !r || (r.products === 0 && r.orders === 0);
}

export async function setDbProvider(storeId: string, provider: "gysm" | "neon"): Promise<void> {
  await sql`update stores set db_provider = ${provider}, updated_at = now() where id = ${storeId}`;
}

// -- bring-your-own connections (always in GYSM's database) ------------------

export type ConnectionRow = {
  store_id: string;
  provider: string;
  public_config: Record<string, string>;
  secret_enc: string | null;
  status: "verified" | "error";
  error_message: string | null;
  verified_at: string | null;
  updated_at: string;
};

export async function listConnections(storeId: string): Promise<ConnectionRow[]> {
  return (await sql`select * from store_connections where store_id = ${storeId} order by provider`) as ConnectionRow[];
}

export async function getConnection(storeId: string, provider: string): Promise<ConnectionRow | null> {
  const rows = await sql`select * from store_connections where store_id = ${storeId} and provider = ${provider} limit 1`;
  return (rows[0] as ConnectionRow) ?? null;
}

export async function upsertConnection(c: {
  storeId: string;
  provider: string;
  publicConfig: Record<string, string>;
  secretEnc: string | null;
  status: "verified" | "error";
  errorMessage: string | null;
}): Promise<void> {
  await sql`
    insert into store_connections (store_id, provider, public_config, secret_enc, status, error_message, verified_at, updated_at)
    values (${c.storeId}, ${c.provider}, ${JSON.stringify(c.publicConfig)}::jsonb, ${c.secretEnc}, ${c.status}, ${c.errorMessage},
            case when ${c.status} = 'verified' then now() else null end, now())
    on conflict (store_id, provider) do update set
      public_config = excluded.public_config, secret_enc = excluded.secret_enc, status = excluded.status,
      error_message = excluded.error_message, verified_at = excluded.verified_at, updated_at = now()`;
}

export async function deleteConnection(storeId: string, provider: string): Promise<void> {
  await sql`delete from store_connections where store_id = ${storeId} and provider = ${provider}`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
