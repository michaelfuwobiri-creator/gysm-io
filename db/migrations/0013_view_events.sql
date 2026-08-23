-- Per-build analytics: real view events (timestamp + referrer) instead of
-- just the raw `views` integer counter projects already has. Additive
-- only -- the existing `views` column and its increment in
-- app/publish/[id]/page.tsx are untouched; this is a second, richer
-- signal recorded alongside it so /dashboard/analytics can show views
-- over time and top referrers, not just a lifetime total.
create table if not exists project_view_events (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  viewed_at   timestamptz not null default now(),
  referrer    text -- raw Referer header, null if the browser didn't send one (common for direct/typed visits)
);

create index if not exists project_view_events_project_id_idx
  on project_view_events (project_id, viewed_at desc);
