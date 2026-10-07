-- gysmlink: link-in-bio pages for GYSM users (one page per user for now).
-- Public page at /l/<handle>; every outbound click goes through /l/go/<link id>
-- so it can be counted. Safe to re-run (IF NOT EXISTS); purely additive.
create table if not exists gysmlink_pages (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null unique,
  handle       text not null unique,
  display_name text not null default '',
  bio          text not null default '',
  theme        text not null default 'midnight',
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists gysmlink_links (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references gysmlink_pages(id) on delete cascade,
  title      text not null,
  url        text not null,
  position   int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists gysmlink_links_page_idx on gysmlink_links (page_id, position);

create table if not exists gysmlink_events (
  id       bigserial primary key,
  page_id  uuid not null references gysmlink_pages(id) on delete cascade,
  link_id  uuid references gysmlink_links(id) on delete set null,
  kind     text not null check (kind in ('view','click')),
  referrer text not null default 'direct',
  device   text not null default 'desktop',
  at       timestamptz not null default now()
);
create index if not exists gysmlink_events_page_at_idx on gysmlink_events (page_id, at desc);
