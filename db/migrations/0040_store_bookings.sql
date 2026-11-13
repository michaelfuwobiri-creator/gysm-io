-- GYSM Stores bookings: services with a duration and optional price, weekly
-- opening hours, and bookings (paid ones go through Stripe on the seller's own
-- account, like orders). A store that runs on the seller's own Neon database
-- gets the same tables there (lib/stores/connections.ts BYO_SCHEMA).
-- Safe to re-run.

alter table stores add column if not exists timezone text not null default 'Europe/Rome';

create table if not exists store_services (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores (id) on delete cascade,
  name          text not null,
  description   text not null default '',
  duration_min  integer not null check (duration_min between 5 and 480),
  price_cents   integer not null default 0 check (price_cents = 0 or price_cents >= 50),
  active        boolean not null default true,
  sort          integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists store_services_store_idx on store_services (store_id, sort);

create table if not exists store_hours (
  store_id   uuid not null references stores (id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  open_min   smallint not null check (open_min between 0 and 1440),
  close_min  smallint not null check (close_min between 0 and 1440 and close_min > open_min),
  primary key (store_id, weekday)
);

create table if not exists store_bookings (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references stores (id) on delete cascade,
  service_id         uuid references store_services (id) on delete set null,
  service_name       text not null,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  status             text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  amount_cents       integer not null default 0,
  currency           text not null,
  customer_name      text not null,
  customer_email     text not null,
  customer_phone     text,
  note               text not null default '',
  stripe_session_id  text unique,
  created_at         timestamptz not null default now(),
  confirmed_at       timestamptz
);
create index if not exists store_bookings_store_idx on store_bookings (store_id, starts_at);
-- One active booking per start time per store (a second guard next to the overlap check in code).
create unique index if not exists store_bookings_active_start on store_bookings (store_id, starts_at) where status in ('pending', 'confirmed');
