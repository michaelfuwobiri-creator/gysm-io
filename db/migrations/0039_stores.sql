-- GYSM Stores, phase 1: a seller's online store with products, Stripe
-- checkout and orders. Behind STORES_ENABLED (off unless "true").
--
-- Payments use Stripe Connect with direct charges: each store connects its
-- own Stripe account and the customer pays the seller, not GYSM. GYSM never
-- holds a seller's money. Safe to re-run.
--
-- Bring your own accounts: a seller can connect their own Neon, Supabase,
-- Clerk and Shippo accounts (store_connections, secrets encrypted with
-- BACKEND_ENCRYPTION_KEY). With a verified Neon connection the store's
-- products and orders live in the seller's own database (db_provider =
-- 'neon'); otherwise they live here (db_provider = 'gysm').

create table if not exists stores (
  id                     uuid primary key default gen_random_uuid(),
  user_id                text not null,
  slug                   text not null unique,
  name                   text not null,
  description            text not null default '',
  currency               text not null default 'eur',
  notify_email           text,
  stripe_account_id      text unique,
  stripe_charges_enabled boolean not null default false,
  status                 text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  db_provider            text not null default 'gysm' check (db_provider in ('gysm', 'neon')),
  collect_shipping       boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists stores_user_idx on stores (user_id);

create table if not exists store_products (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores (id) on delete cascade,
  name         text not null,
  description  text not null default '',
  price_cents  integer not null check (price_cents >= 50 and price_cents <= 99999999),
  image_url    text,
  stock        integer check (stock is null or stock >= 0),
  active       boolean not null default true,
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists store_products_store_idx on store_products (store_id, sort);

create table if not exists store_orders (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references stores (id) on delete cascade,
  status             text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'fulfilled', 'refunded')),
  currency           text not null,
  amount_total_cents integer not null default 0,
  customer_email     text,
  customer_name      text,
  shipping           jsonb,
  stripe_session_id  text unique,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz
);
create index if not exists store_orders_store_idx on store_orders (store_id, created_at desc);

create table if not exists store_order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references store_orders (id) on delete cascade,
  product_id       uuid references store_products (id) on delete set null,
  name             text not null,
  unit_price_cents integer not null,
  quantity         integer not null check (quantity > 0)
);
create index if not exists store_order_items_order_idx on store_order_items (order_id);

create table if not exists store_connections (
  store_id       uuid not null references stores (id) on delete cascade,
  provider       text not null check (provider in ('neon', 'supabase', 'clerk', 'shippo')),
  public_config  jsonb not null default '{}'::jsonb,
  secret_enc     text,
  status         text not null default 'error' check (status in ('verified', 'error')),
  error_message  text,
  verified_at    timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (store_id, provider)
);
