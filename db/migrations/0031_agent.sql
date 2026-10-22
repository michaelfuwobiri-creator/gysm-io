-- GYSM Agent: deployments it has made for a user, and an activity log the
-- get_logs tool reads back. Safe to apply more than once.
create table if not exists agent_deployments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  project text not null,
  vercel_deployment_id text not null,
  url text,
  state text not null default 'QUEUED',
  created_at timestamptz not null default now()
);
create index if not exists agent_deployments_user_idx on agent_deployments (user_id, created_at desc);

create table if not exists agent_logs (
  id bigserial primary key,
  user_id text not null,
  tool text not null,
  ok boolean not null default true,
  summary text not null,
  at timestamptz not null default now()
);
create index if not exists agent_logs_user_idx on agent_logs (user_id, at desc);
