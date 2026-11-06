-- Shield: monitoring for automated agents (Zapier / Make / n8n / custom).
-- An agent reports each action to /api/shield/ingest with its own token;
-- Shield allows or denies it against the agent's granted scopes and limits,
-- records alerts, and can quarantine the agent. Only a SHA-256 hash of each
-- token is stored. Safe to re-run (IF NOT EXISTS); purely additive.
create table if not exists shield_agents (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null,
  name                text not null,
  platform            text not null default 'custom',
  description         text not null default '',
  permissions         text[] not null default '{}',
  status              text not null default 'active' check (status in ('active','paused','quarantined')),
  token_hash          text not null unique,
  token_prefix        text not null,
  rate_limit_per_min  int  not null default 60,
  bulk_limit          int  not null default 1000,
  payment_limit_cents bigint not null default 0,
  auto_quarantine     boolean not null default true,
  alert_email         text,
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz
);
create index if not exists shield_agents_user_idx on shield_agents (user_id);

create table if not exists shield_events (
  id           bigserial primary key,
  agent_id     uuid not null references shield_agents(id) on delete cascade,
  scope        text not null,
  action       text,
  records      bigint,
  amount_cents bigint,
  decision     text not null check (decision in ('allow','deny')),
  at           timestamptz not null default now()
);
create index if not exists shield_events_agent_at_idx on shield_events (agent_id, at desc);

create table if not exists shield_alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  agent_id        uuid not null references shield_agents(id) on delete cascade,
  severity        text not null check (severity in ('low','medium','high','critical')),
  kind            text not null,
  message         text not null,
  created_at      timestamptz not null default now(),
  acknowledged_at timestamptz
);
create index if not exists shield_alerts_user_idx on shield_alerts (user_id, created_at desc);
create index if not exists shield_alerts_agent_idx on shield_alerts (agent_id, created_at desc);
