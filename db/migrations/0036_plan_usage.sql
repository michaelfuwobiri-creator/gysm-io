-- Usage limits for the EUR 20/month plan (lib/usage.ts): a 5-hour window and
-- a weekly cap per subscriber, both counted in credits. Safe to re-run.
create table if not exists plan_usage (
  user_id      text primary key,
  window_start timestamptz,
  window_used  bigint not null default 0,
  week_start   timestamptz,
  week_used    bigint not null default 0,
  updated_at   timestamptz not null default now()
);
