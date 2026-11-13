-- GYSM Stores shipping: flat rates customers pick at checkout, the seller's
-- ship-from address and default parcel for Shippo labels, and tracking on
-- orders. Sellers' own Neon databases get the order columns too
-- (lib/stores/connections.ts BYO_SCHEMA). Safe to re-run.

alter table stores add column if not exists shipping_rates jsonb not null default '[]'::jsonb;
alter table stores add column if not exists ship_from jsonb;
alter table stores add column if not exists default_parcel jsonb;

alter table store_orders add column if not exists shipping_cents integer not null default 0;
alter table store_orders add column if not exists carrier text;
alter table store_orders add column if not exists tracking_number text;
alter table store_orders add column if not exists tracking_url text;
alter table store_orders add column if not exists label_url text;
alter table store_orders add column if not exists shipped_at timestamptz;
