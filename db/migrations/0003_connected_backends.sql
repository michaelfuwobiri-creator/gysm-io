-- GYSM.IO -- "Connect database" feature.
--
-- Lets a user link a real Supabase project (their own, via OAuth) to one
-- of their builds, so the generated app talks to a real Postgres database
-- and real auth instead of the in-memory/localStorage state every build
-- gets by default. GYSM.IO never hosts this data or pays for it -- the
-- user's own Supabase org owns the project; we just hold the OAuth tokens
-- and API credentials needed to provision/manage it on their behalf and
-- to inject the right client config into the generated HTML.
--
-- Gated to paid subscription plans in app code (see lib/backend.ts),
-- not enforced here.
--
-- Safe to re-run: every statement uses IF NOT EXISTS.

create table if not exists connected_backends (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid not null references projects(id) on delete cascade,
  user_id                   text not null,

  provider                  text not null default 'supabase',

  -- Supabase org/project identity once provisioned.
  supabase_org_slug         text,
  supabase_project_ref      text,
  api_url                   text,
  anon_key                  text,

  -- Secrets -- all encrypted at rest with lib/crypto.ts (AES-256-GCM,
  -- BACKEND_ENCRYPTION_KEY). Never sent to the client or the AI model
  -- in plaintext except anon_key, which is public/safe by design.
  db_password_encrypted     text,
  access_token_encrypted    text not null,
  refresh_token_encrypted   text not null,
  token_expires_at          timestamptz,

  -- 'connecting'   -- OAuth handshake done, project not yet created.
  -- 'provisioning' -- Supabase project creating (can take ~2 min).
  -- 'active'       -- ready, schema pushed, generated app is wired up.
  -- 'error'        -- provisioning or schema push failed.
  -- 'disconnected' -- user unlinked it; row kept for history.
  status                    text not null default 'connecting',
  error_message             text,

  -- Schema GYSM.IO generated/pushed for this build, kept so edits can
  -- extend it instead of re-inferring from scratch.
  schema_sql                text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- One active backend connection per project.
create unique index if not exists connected_backends_project_id_idx
  on connected_backends (project_id);

create index if not exists connected_backends_user_id_idx
  on connected_backends (user_id);
