-- App Store Guideline 1.2: users can report objectionable content and block
-- other users. Reports are reviewed by the team (info@gysm.io, within 24h).
create table if not exists content_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id text not null,
  kind        text not null check (kind in ('comment','build')),
  target_id   uuid not null,
  reason      text not null default '',
  status      text not null default 'open',
  created_at  timestamptz not null default now()
);
create index if not exists content_reports_status_idx on content_reports (status, created_at desc);

create table if not exists user_blocks (
  blocker_id text not null,
  blocked_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
