-- API keys for the public /api/v1/generate endpoint (see app/settings/
-- api-keys and lib/apiKeys.ts). Only a salted hash of each key is ever
-- stored -- the raw key is shown to the user exactly once, at creation,
-- the same way Stripe/GitHub/every other API-key UX works. key_prefix is
-- stored in the clear purely so the settings page can show "gysm_live_a1b2..."
-- as a way to tell keys apart without ever re-displaying the full secret.
--
-- Safe to re-run: every statement uses IF NOT EXISTS. Purely additive --
-- no existing column, table, or row is touched.
create table if not exists api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  name         text not null,
  key_hash     text not null unique,
  key_prefix   text not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists api_keys_user_id_idx on api_keys (user_id);
create index if not exists api_keys_key_hash_idx on api_keys (key_hash) where revoked_at is null;
