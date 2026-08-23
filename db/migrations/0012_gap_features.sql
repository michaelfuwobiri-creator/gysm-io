-- GYSM.IO -- competitive-gap features: GitHub push, generic data-source
-- connectors (Airtable / Google Sheets / Resend / PostHog), and an
-- automated pre-publish check.
--
-- Safe to re-run: every statement uses IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS. Purely additive -- no existing column, table, or row is touched.

-- "Push to GitHub" -- ongoing sync via a user-pasted fine-grained PAT
-- (no GitHub OAuth App registration needed on GYSM's side, matching the
-- "no fake OAuth automation" honesty bar Voiie set -- see
-- app/api/projects/[id]/vercel-export/route.ts). The token is encrypted
-- at rest with lib/crypto.ts and only ever decrypted server-side to make
-- the push call; it is never sent back to the client after save.
create table if not exists github_connections (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  user_id           text not null,

  owner             text not null,
  repo              text not null,
  branch            text not null default 'main',
  token_encrypted   text not null,

  status            text not null default 'connected', -- 'connected' | 'error'
  error_message     text,
  last_pushed_at    timestamptz,
  last_commit_url   text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists github_connections_project_id_idx
  on github_connections (project_id);

create index if not exists github_connections_user_id_idx
  on github_connections (user_id);

-- Generic external data-source connector, one row per (project, provider).
-- v1 for Airtable/Google Sheets is a *snapshot* import (fetched once at
-- connect/refresh time and baked into the generated app), not a live
-- two-way sync -- the UI says exactly that. This is a deliberate,
-- honestly-scoped v1: it avoids embedding a live secret in client-side
-- generated JS (an Airtable PAT is not designed to be public the way a
-- Supabase anon key is), while still letting a user build on top of data
-- they already have without setting up a real database.
--
-- Also used for Resend (email sending, proxied server-side -- secret_encrypted
-- holds the API key) and PostHog (analytics, config holds the public
-- project key + host, which is designed to be embedded client-side --
-- secret_encrypted stays null for that provider).
create table if not exists project_connectors (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  user_id            text not null,

  provider           text not null, -- 'airtable' | 'google_sheets' | 'resend' | 'posthog'
  config             jsonb not null default '{}'::jsonb, -- non-secret fields (base id, table name, sheet url, posthog host/key, from-address...)
  secret_encrypted   text, -- Airtable PAT / Resend API key, encrypted; null for posthog (its key is public by design)

  status             text not null default 'active', -- 'active' | 'error'
  error_message      text,
  last_synced_at     timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (project_id, provider)
);

create index if not exists project_connectors_user_id_idx
  on project_connectors (user_id);

-- Automated pre-publish check (broken internal links, obvious placeholder
-- text, missing image alt text, unbalanced script/style tags). Runs
-- automatically right after a build is generated/edited; result shown as
-- a small trust badge on /publish pages and the dashboard.
alter table projects add column if not exists check_status text; -- 'pass' | 'warnings' | null (not yet run)
alter table projects add column if not exists check_results jsonb;
alter table projects add column if not exists check_run_at timestamptz;
