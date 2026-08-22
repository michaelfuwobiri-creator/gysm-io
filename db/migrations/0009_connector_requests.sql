-- Interest capture for not-yet-built connectors on /connectors (see
-- app/connectors/page.tsx). Same pattern as marketplace_waitlist
-- (0005_marketplace_waitlist.sql) -- records real interest instead of
-- wiring a connector that doesn't exist yet. Scoped to user_id (this is
-- a signed-in-only page, unlike the public marketplace waitlist) so a
-- user only ever "requests" a given connector once and the UI can show
-- an honest "Requested" state on reload.
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS. Purely additive -- no
-- existing column, table, or row is touched.
create table if not exists connector_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  connector   text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, connector)
);

create index if not exists connector_requests_user_id_idx on connector_requests (user_id);
