-- Shopify App Store app: one row per installed shop. The offline access token
-- is encrypted with BACKEND_ENCRYPTION_KEY (lib/crypto.ts) before it is stored.
-- GYSM keeps no Shopify customer data, so the customers/* compliance webhooks
-- have nothing to delete; shop/redact removes the whole row. Safe to re-run.
create table if not exists shopify_shops (
  shop            text primary key,
  access_token_enc text not null default '',
  scope           text not null default '',
  installed_at    timestamptz not null default now(),
  uninstalled_at  timestamptz,
  builds          integer not null default 0,
  last_build_at   timestamptz
);
