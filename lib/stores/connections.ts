// Server side of "bring your own accounts": checks a seller's keys against the
// provider, stores them encrypted, and picks the database a store runs on.
import { neon } from "@neondatabase/serverless";
import { sql } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { cleanProviderKeys, PROVIDER_GUIDES, type CleanKeys, type KeyedProvider } from "./integrations";
import { getConnection, setDbProvider, storeIsEmpty, upsertConnection, type Db, type StoreRow } from "./db";

/** The store tables, created inside the seller's own Neon database (no link to GYSM's stores table). */
export const BYO_SCHEMA: string[] = [
  `create table if not exists store_products (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null,
    name text not null,
    description text not null default '',
    price_cents integer not null check (price_cents >= 50 and price_cents <= 99999999),
    image_url text,
    stock integer check (stock is null or stock >= 0),
    active boolean not null default true,
    sort integer not null default 0,
    created_at timestamptz not null default now())`,
  `create index if not exists store_products_store_idx on store_products (store_id, sort)`,
  `create table if not exists store_orders (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null,
    status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'fulfilled', 'refunded')),
    currency text not null,
    amount_total_cents integer not null default 0,
    customer_email text,
    customer_name text,
    shipping jsonb,
    stripe_session_id text unique,
    created_at timestamptz not null default now(),
    paid_at timestamptz)`,
  `create index if not exists store_orders_store_idx on store_orders (store_id, created_at desc)`,
  `create table if not exists store_order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references store_orders (id) on delete cascade,
    product_id uuid references store_products (id) on delete set null,
    name text not null,
    unit_price_cents integer not null,
    quantity integer not null check (quantity > 0))`,
  `create index if not exists store_order_items_order_idx on store_order_items (order_id)`,
  `create table if not exists store_services (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null,
    name text not null,
    description text not null default '',
    duration_min integer not null check (duration_min between 5 and 480),
    price_cents integer not null default 0 check (price_cents = 0 or price_cents >= 50),
    active boolean not null default true,
    sort integer not null default 0,
    created_at timestamptz not null default now())`,
  `create index if not exists store_services_store_idx on store_services (store_id, sort)`,
  `create table if not exists store_hours (
    store_id uuid not null,
    weekday smallint not null check (weekday between 0 and 6),
    open_min smallint not null check (open_min between 0 and 1440),
    close_min smallint not null check (close_min between 0 and 1440 and close_min > open_min),
    primary key (store_id, weekday))`,
  `create table if not exists store_bookings (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null,
    service_id uuid references store_services (id) on delete set null,
    service_name text not null,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
    amount_cents integer not null default 0,
    currency text not null,
    customer_name text not null,
    customer_email text not null,
    customer_phone text,
    note text not null default '',
    stripe_session_id text unique,
    created_at timestamptz not null default now(),
    confirmed_at timestamptz)`,
  `create index if not exists store_bookings_store_idx on store_bookings (store_id, starts_at)`,
  `create unique index if not exists store_bookings_active_start on store_bookings (store_id, starts_at) where status in ('pending', 'confirmed')`,
  `alter table store_orders add column if not exists shipping_cents integer not null default 0`,
  `alter table store_orders add column if not exists carrier text`,
  `alter table store_orders add column if not exists tracking_number text`,
  `alter table store_orders add column if not exists tracking_url text`,
  `alter table store_orders add column if not exists label_url text`,
  `alter table store_orders add column if not exists shipped_at timestamptz`,
];

async function check(url: string, headers: Record<string, string>, what: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (res.status === 401 || res.status === 403) return `${what} rejected the key. Copy it again and make sure it is the full value.`;
    if (!res.ok) return `${what} answered with status ${res.status}. Try again in a minute.`;
    return null;
  } catch {
    return `Couldn't reach ${what}. Try again in a minute.`;
  }
}

/** Calls the provider once with the keys to prove they work. Returns an error message or null. */
async function verifyKeys(provider: KeyedProvider, keys: CleanKeys): Promise<string | null> {
  switch (provider) {
    case "neon":
      try {
        const db = neon(keys.secret);
        await db`select 1`;
        return null;
      } catch (e: any) {
        return `Neon refused the connection: ${String(e?.message ?? "unknown error").slice(0, 160)}`;
      }
    case "supabase":
      return check(`${keys.publicConfig.projectUrl}/rest/v1/`, { apikey: keys.secret, Authorization: `Bearer ${keys.secret}` }, "Supabase");
    case "clerk":
      return check("https://api.clerk.com/v1/users?limit=1", { Authorization: `Bearer ${keys.secret}` }, "Clerk");
    case "shippo":
      return check("https://api.goshippo.com/carrier_accounts/?results=1", { Authorization: `ShippoToken ${keys.secret}` }, "Shippo");
  }
}

export type ConnectOutcome = { ok: boolean; message: string };

/**
 * Validates, verifies and saves a seller's keys for one provider. For Neon it
 * also creates the store tables in the seller's database and moves an empty
 * store onto it. The secret is only ever stored encrypted.
 */
export async function connectProvider(store: StoreRow, provider: KeyedProvider, publicValue: unknown, secretValue: unknown): Promise<ConnectOutcome> {
  const label = PROVIDER_GUIDES[provider].label;
  const cleaned = cleanProviderKeys(provider, publicValue, secretValue);
  if ("error" in cleaned) return { ok: false, message: cleaned.error };
  const keys = cleaned.value;

  const problem = await verifyKeys(provider, keys);
  if (problem) {
    await upsertConnection({ storeId: store.id, provider, publicConfig: keys.publicConfig, secretEnc: null, status: "error", errorMessage: problem });
    return { ok: false, message: problem };
  }

  if (provider === "neon") {
    try {
      const db = neon(keys.secret);
      for (const statement of BYO_SCHEMA) await db.query(statement);
    } catch (e: any) {
      const msg = `Connected to Neon, but couldn't create the store tables: ${String(e?.message ?? "").slice(0, 160)}`;
      await upsertConnection({ storeId: store.id, provider, publicConfig: keys.publicConfig, secretEnc: null, status: "error", errorMessage: msg });
      return { ok: false, message: msg };
    }
  }

  await upsertConnection({ storeId: store.id, provider, publicConfig: keys.publicConfig, secretEnc: encryptSecret(keys.secret), status: "verified", errorMessage: null });

  if (provider === "neon") {
    if (store.db_provider === "neon") return { ok: true, message: `${label} connection updated. The store keeps using your database.` };
    if (await storeIsEmpty(sql, store.id)) {
      await setDbProvider(store.id, "neon");
      dbCache.delete(store.id);
      return { ok: true, message: "Neon connected. The store tables were created in your database, and this store's products and orders will be saved there." };
    }
    return { ok: true, message: "Neon connected and checked, but this store already has products or orders on GYSM's database, so it stays there. Create a new store to start on your own database." };
  }
  if (provider === "supabase") {
    return { ok: true, message: "Supabase connected and checked. Store data stays on GYSM's database for now; running a store on Supabase is the next step being built." };
  }
  if (provider === "clerk") {
    return { ok: true, message: `Clerk connected and checked (${keys.publicConfig.mode} keys). Customer sign-in on the storefront is the next step being built.` };
  }
  return { ok: true, message: `Shippo connected and checked (${keys.publicConfig.mode} token). Shipping rates and labels at checkout are the next step being built.` };
}

const dbCache = new Map<string, { at: number; db: Db }>();
const DB_TTL_MS = 5 * 60_000;

/** The database a store's products and orders live in: the seller's Neon, or GYSM's. */
export async function storeDb(store: Pick<StoreRow, "id" | "db_provider">): Promise<Db> {
  if (store.db_provider !== "neon") return sql;
  const hit = dbCache.get(store.id);
  if (hit && Date.now() - hit.at < DB_TTL_MS) return hit.db;
  const conn = await getConnection(store.id, "neon");
  if (!conn?.secret_enc || conn.status !== "verified") {
    throw new Error("This store runs on its own Neon database, but the connection is missing. Reconnect Neon in the store dashboard.");
  }
  const db = neon(decryptSecret(conn.secret_enc)) as unknown as Db;
  // Stores connected before a feature shipped may lack its tables: create any
  // missing ones (all statements are "if not exists") once per server process.
  for (const statement of BYO_SCHEMA) await db.query(statement);
  if (dbCache.size > 200) dbCache.clear();
  dbCache.set(store.id, { at: Date.now(), db });
  return db;
}

/** Public view of a store's connections: never includes secrets. */
export function publicConnection(c: { provider: string; public_config: Record<string, string>; status: string; error_message: string | null; verified_at: string | null }) {
  const config = { ...c.public_config };
  return { provider: c.provider, status: c.status, error: c.error_message, verifiedAt: c.verified_at, config };
}

/** The decrypted secret of a verified connection (e.g. the seller's Shippo token), or null. Server-side only. */
export async function providerSecret(storeId: string, provider: KeyedProvider): Promise<string | null> {
  const conn = await getConnection(storeId, provider);
  if (!conn?.secret_enc || conn.status !== "verified") return null;
  return decryptSecret(conn.secret_enc);
}
