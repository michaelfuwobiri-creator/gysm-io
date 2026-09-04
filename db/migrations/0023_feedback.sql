-- Public, user-submitted feedback board (see app/feedback). Deliberately
-- the mirror image of roadmap_items (0010): roadmap is admin-authored
-- ("here's what we're building"), feedback is user-authored ("here's what
-- you want us to build") -- any signed-in user can post an item, any
-- signed-in user can upvote someone else's, and Mike (lib/isAdmin.ts) can
-- triage by changing status or deleting spam/dupes. Same open-signal
-- philosophy as roadmap_items and connector_requests: real requests, not a
-- fabricated backlog.
--
-- Safe to re-run: every statement uses IF NOT EXISTS. Purely additive --
-- no existing column, table, or row is touched.
create table if not exists feedback_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  title       text not null,
  description text,
  status      text not null default 'open', -- 'open' | 'planned' | 'in_progress' | 'shipped' | 'declined'
  created_at  timestamptz not null default now()
);

create table if not exists feedback_votes (
  item_id     uuid not null references feedback_items(id) on delete cascade,
  user_id     text not null,
  created_at  timestamptz not null default now(),
  primary key (item_id, user_id)
);

create index if not exists feedback_items_status_idx on feedback_items (status);
create index if not exists feedback_items_user_id_idx on feedback_items (user_id);
