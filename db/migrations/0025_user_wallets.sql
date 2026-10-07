-- Non-custodial wallet linking (Phase 0, GYSM Credit / GSM).
--
-- GYSM never holds or generates user keys. A user connects a wallet they
-- already control and proves ownership by signing a one-time message; we
-- store only the PUBLIC address, linked to their Clerk user id.
--
-- Safe to re-run (IF NOT EXISTS). Purely additive.
create table if not exists user_wallets (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,                 -- Clerk user id
  address         text not null unique,          -- lowercase 0x..., one wallet belongs to one account
  chain_family    text not null default 'evm',
  linked_at       timestamptz not null default now()
);
create index if not exists user_wallets_user_id_idx on user_wallets (user_id);

-- One-time challenges. Each is bound to a user + address, expires, and can
-- be consumed exactly once.
create table if not exists wallet_nonces (
  nonce       text primary key,
  user_id     text not null,
  address     text not null,                     -- lowercase
  message     text not null,                     -- exact text the wallet must sign
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists wallet_nonces_user_id_idx on wallet_nonces (user_id, created_at desc);
