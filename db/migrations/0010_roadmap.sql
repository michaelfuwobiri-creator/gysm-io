-- Public feature-request / roadmap board (see app/roadmap). Same honest
-- pattern as connector_requests (0009): real user-submitted signal
-- instead of a fabricated "coming soon" list. Items are admin-authored
-- (see lib/isAdmin.ts) so the board can't be spammed with junk entries,
-- but voting is open to any signed-in user.
--
-- Safe to re-run: every statement uses IF NOT EXISTS. Purely additive --
-- no existing column, table, or row is touched.
create table if not exists roadmap_items (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  status      text not null default 'planned', -- 'planned' | 'in_progress' | 'shipped'
  created_at  timestamptz not null default now()
);

create table if not exists roadmap_votes (
  item_id     uuid not null references roadmap_items(id) on delete cascade,
  user_id     text not null,
  created_at  timestamptz not null default now(),
  primary key (item_id, user_id)
);

create index if not exists roadmap_items_status_idx on roadmap_items (status);
