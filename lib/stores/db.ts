// GYSM Stores data access (Neon). Every seller-facing query is scoped by
// user_id or by a store_id the caller has already been checked to own, the
// same pattern as the rest of this app (see lib/db.ts).
import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import type { CartLine, CatalogProduct, ProductInput } from "./core";
import type { HoursRow, ServiceInput } from "./booking";
import type { Address, Parcel, ShippingRate } from "./shipping";

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
  timezone: string;
  shipping_rates: ShippingRate[];
  ship_from: Address | null;
  default_parcel: Parcel | null;
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
  shipping_cents?: number;
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  label_url?: string | null;
  shipped_at?: string | null;
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
  patch: {
    name?: string; description?: string; notifyEmail?: string | null; status?: string; collectShipping?: boolean; timezone?: string;
    shippingRates?: ShippingRate[]; shipFrom?: Address; defaultParcel?: Parcel;
  },
): Promise<StoreRow | null> {
  const rows = await sql`
    update stores set
      name = coalesce(${patch.name ?? null}, name),
      description = coalesce(${patch.description ?? null}, description),
      notify_email = case when ${patch.notifyEmail !== undefined} then ${patch.notifyEmail ?? null} else notify_email end,
      status = coalesce(${patch.status ?? null}, status),
      collect_shipping = coalesce(${patch.collectShipping ?? null}, collect_shipping),
      timezone = coalesce(${patch.timezone ?? null}, timezone),
      shipping_rates = coalesce(${patch.shippingRates ? JSON.stringify(patch.shippingRates) : null}::jsonb, shipping_rates),
      ship_from = coalesce(${patch.shipFrom ? JSON.stringify(patch.shipFrom) : null}::jsonb, ship_from),
      default_parcel = coalesce(${patch.defaultParcel ? JSON.stringify(patch.defaultParcel) : null}::jsonb, default_parcel),
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
  details: { amountTotalCents: number | null; email: string | null; name: string | null; shipping: unknown; shippingCents?: number | null },
): Promise<OrderRow | null> {
  if (!isUuid(orderId)) return null;
  const rows = await db`
    update store_orders set status = 'paid', paid_at = now(), stripe_session_id = ${sessionId},
      amount_total_cents = coalesce(${details.amountTotalCents}, amount_total_cents),
      customer_email = ${details.email}, customer_name = ${details.name}, shipping_cents = ${details.shippingCents ?? 0},
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

// -- bookings (in the store's own database, like products) --------------------

export type ServiceRow = {
  id: string;
  store_id: string;
  name: string;
  description: string;
  duration_min: number;
  price_cents: number;
  active: boolean;
  sort: number;
};

export type BookingRow = {
  id: string;
  store_id: string;
  service_id: string | null;
  service_name: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  amount_cents: number;
  currency: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  note: string;
  stripe_session_id: string | null;
  created_at: string;
};

export async function listServices(db: Db, storeId: string, opts: { activeOnly?: boolean } = {}): Promise<ServiceRow[]> {
  return (opts.activeOnly
    ? await db`select * from store_services where store_id = ${storeId} and active order by sort, created_at`
    : await db`select * from store_services where store_id = ${storeId} order by sort, created_at`) as ServiceRow[];
}

export async function createService(db: Db, storeId: string, v: ServiceInput): Promise<ServiceRow> {
  const rows = await db`
    insert into store_services (store_id, name, description, duration_min, price_cents, active, sort)
    values (${storeId}, ${v.name}, ${v.description}, ${v.durationMin}, ${v.priceCents}, ${v.active},
            (select coalesce(max(sort), 0) + 1 from store_services where store_id = ${storeId}))
    returning *`;
  return rows[0] as ServiceRow;
}

export async function updateService(db: Db, storeId: string, id: string, v: ServiceInput): Promise<ServiceRow | null> {
  if (!isUuid(id)) return null;
  const rows = await db`
    update store_services set name = ${v.name}, description = ${v.description}, duration_min = ${v.durationMin},
      price_cents = ${v.priceCents}, active = ${v.active}
    where id = ${id} and store_id = ${storeId} returning *`;
  return (rows[0] as ServiceRow) ?? null;
}

export async function deleteService(db: Db, storeId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return (await db`delete from store_services where id = ${id} and store_id = ${storeId} returning id`).length > 0;
}

export async function getHours(db: Db, storeId: string): Promise<HoursRow[]> {
  return (await db`select weekday, open_min, close_min from store_hours where store_id = ${storeId} order by weekday`) as HoursRow[];
}

export async function setHours(db: Db, storeId: string, rows: HoursRow[]): Promise<void> {
  await db.transaction([
    db`delete from store_hours where store_id = ${storeId}`,
    ...rows.map((r) => db`insert into store_hours (store_id, weekday, open_min, close_min) values (${storeId}, ${r.weekday}, ${r.open_min}, ${r.close_min})`),
  ]);
}

/** Bookings that block time between two instants: confirmed ones, and unpaid ones still on hold. */
export async function busyBetween(db: Db, storeId: string, from: Date, to: Date, holdMinutes: number): Promise<{ start: Date; end: Date }[]> {
  const rows = await db`
    select starts_at, ends_at from store_bookings
    where store_id = ${storeId} and starts_at < ${to.toISOString()}::timestamptz and ends_at > ${from.toISOString()}::timestamptz
      and (status = 'confirmed' or (status = 'pending' and created_at > now() - make_interval(mins => ${holdMinutes}::int)))`;
  return (rows as any[]).map((r) => ({ start: new Date(r.starts_at), end: new Date(r.ends_at) }));
}

/** Records a booking unless the time was taken meanwhile. Returns null when it clashes. */
export async function createBooking(
  db: Db,
  b: {
    storeId: string; service: ServiceRow; start: Date; currency: string; status: "pending" | "confirmed";
    customer: { name: string; email: string; phone: string | null; note: string }; holdMinutes: number;
  },
): Promise<BookingRow | null> {
  const end = new Date(b.start.getTime() + b.service.duration_min * 60000);
  // Free the slot from expired unpaid holds first, so the unique index doesn't block a fresh booking.
  await db`update store_bookings set status = 'expired'
           where store_id = ${b.storeId} and status = 'pending' and created_at <= now() - make_interval(mins => ${b.holdMinutes}::int)`;
  try {
    const rows = await db`
      insert into store_bookings (store_id, service_id, service_name, starts_at, ends_at, status, amount_cents, currency,
                                  customer_name, customer_email, customer_phone, note, confirmed_at)
      select ${b.storeId}::uuid, ${b.service.id}::uuid, ${b.service.name}::text, ${b.start.toISOString()}::timestamptz,
             ${end.toISOString()}::timestamptz, ${b.status}::text, ${b.service.price_cents}::integer, ${b.currency}::text,
             ${b.customer.name}::text, ${b.customer.email}::text, ${b.customer.phone}::text, ${b.customer.note}::text,
             case when ${b.status}::text = 'confirmed' then now() else null end
      where not exists (
        select 1 from store_bookings
        where store_id = ${b.storeId}::uuid and status in ('pending', 'confirmed')
          and starts_at < ${end.toISOString()}::timestamptz and ends_at > ${b.start.toISOString()}::timestamptz)
      returning *`;
    return (rows[0] as BookingRow) ?? null;
  } catch (error: any) {
    if (error?.code === "23505") return null;
    throw error;
  }
}

export async function attachSessionToBooking(db: Db, bookingId: string, sessionId: string): Promise<void> {
  await db`update store_bookings set stripe_session_id = ${sessionId} where id = ${bookingId}`;
}

/** Confirms a paid booking exactly once. */
export async function confirmBooking(db: Db, bookingId: string, sessionId: string): Promise<BookingRow | null> {
  if (!isUuid(bookingId)) return null;
  try {
    const rows = await db`
      update store_bookings set status = 'confirmed', confirmed_at = now(), stripe_session_id = ${sessionId}
      where id = ${bookingId} and status in ('pending', 'expired') returning *`;
    return (rows[0] as BookingRow) ?? null;
  } catch (error: any) {
    // The slot went to someone else after this hold lapsed: leave it for the seller to sort out (refund).
    if (error?.code === "23505") {
      console.error("[stores] paid booking clashes with another booking", { bookingId, sessionId });
      return null;
    }
    throw error;
  }
}

export async function expireBooking(db: Db, bookingId: string): Promise<void> {
  if (!isUuid(bookingId)) return;
  await db`update store_bookings set status = 'expired' where id = ${bookingId} and status = 'pending'`;
}

export async function cancelBooking(db: Db, storeId: string, bookingId: string): Promise<BookingRow | null> {
  if (!isUuid(bookingId)) return null;
  const rows = await db`
    update store_bookings set status = 'cancelled'
    where id = ${bookingId} and store_id = ${storeId} and status in ('pending', 'confirmed') returning *`;
  return (rows[0] as BookingRow) ?? null;
}

export async function upcomingBookings(db: Db, storeId: string, limit = 30): Promise<BookingRow[]> {
  return (await db`
    select * from store_bookings where store_id = ${storeId} and status = 'confirmed' and ends_at > now()
    order by starts_at limit ${limit}`) as BookingRow[];
}

export async function getOrder(db: Db, storeId: string, orderId: string): Promise<OrderRow | null> {
  if (!isUuid(orderId)) return null;
  const rows = await db`
    select o.*, coalesce(json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents))
             filter (where i.id is not null), '[]') as items
    from store_orders o left join store_order_items i on i.order_id = o.id
    where o.id = ${orderId} and o.store_id = ${storeId} group by o.id`;
  return (rows[0] as OrderRow) ?? null;
}

/** Records shipment details and marks a paid order fulfilled. */
export async function markOrderShipped(
  db: Db,
  storeId: string,
  orderId: string,
  t: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; labelUrl: string | null },
): Promise<OrderRow | null> {
  if (!isUuid(orderId)) return null;
  const rows = await db`
    update store_orders set status = 'fulfilled', shipped_at = now(), carrier = ${t.carrier}, tracking_number = ${t.trackingNumber},
      tracking_url = ${t.trackingUrl}, label_url = ${t.labelUrl}
    where id = ${orderId} and store_id = ${storeId} and status in ('paid', 'fulfilled') returning *`;
  return (rows[0] as OrderRow) ?? null;
}
