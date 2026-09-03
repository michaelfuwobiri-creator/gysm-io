-- VOIIE -- Hunter + Closer + Builder: hunts prospects on Twitter/X and
-- Threads who look like they need a website, runs a 12-question
-- consultation over Email/DM/WhatsApp, builds them a free live demo (via
-- lib/ai/orchestrator.ts, saved as a normal row in `projects` and served
-- for free at /publish/[id] -- no separate hosting system needed), and on
-- payment converts the lead into a real GYSM.IO account that owns that
-- build going forward (see lib/voiie/billing.ts + the checkout.session.completed
-- branch in app/api/billing/webhook/route.ts).
--
-- Deliberately reuses existing infrastructure rather than inventing a
-- parallel one: demos ARE projects rows, "go live" reuses
-- custom_domain/lib/vercelDomains.ts, and a converted lead becomes a real
-- `users` row via the existing Clerk webhook once their Clerk account is
-- created. Only the genuinely new state -- the lead record itself, the
-- outreach thread, and the consultation's in-progress answers -- gets new
-- tables here.
--
-- Safe to re-run: every statement uses IF NOT EXISTS.

-- ============================================================================
-- voiie_leads -- one row per hunted prospect. owner_user_id scopes leads to
-- whichever GYSM.IO account is running VOIIE, the same user_id/org_id
-- pattern every other table in this app uses (see lib/auth.ts) -- so this
-- is ready to open up to more than one operator later without a schema
-- change, even though today it's just Mike's own account.
-- ============================================================================
create table if not exists voiie_leads (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      text not null,
  platform           text not null default 'twitter', -- 'twitter' | 'threads' | 'manual'
  handle             text not null,
  display_name       text,
  bio                text,
  signal             text,              -- why this account was flagged (matched hunt query / keyword)
  contact_email      text,
  contact_phone      text,              -- E.164, for WhatsApp
  status             text not null default 'new',
    -- 'new' -> 'contacted' -> 'consulting' -> 'demo_sent' -> 'negotiating' -> 'paid' -> 'converted' | 'lost'
  demo_project_id    uuid references projects(id) on delete set null,
  plan_id            text,              -- voiie_starter | voiie_pro | voiie_agency once quoted/paid
  stripe_checkout_session_id text,
  converted_user_id  text,              -- Clerk user id of the real account created on payment
  converted_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists voiie_leads_owner_status_idx
  on voiie_leads (owner_user_id, status, created_at desc);

create unique index if not exists voiie_leads_owner_platform_handle_idx
  on voiie_leads (owner_user_id, platform, lower(handle));

-- ============================================================================
-- voiie_messages -- full outreach + reply thread for a lead, across every
-- channel (email/dm/whatsapp), newest last.
-- ============================================================================
create table if not exists voiie_messages (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references voiie_leads(id) on delete cascade,
  direction  text not null,   -- 'outbound' | 'inbound'
  channel    text not null,   -- 'email' | 'twitter_dm' | 'threads_dm' | 'whatsapp' | 'system'
  body       text not null,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create index if not exists voiie_messages_lead_id_created_at_idx
  on voiie_messages (lead_id, created_at asc);

-- ============================================================================
-- voiie_consultations -- the 12-question flow's in-progress + final
-- answers for one lead. One row per lead (a lead only ever runs the
-- consultation once).
-- ============================================================================
create table if not exists voiie_consultations (
  lead_id         uuid primary key references voiie_leads(id) on delete cascade,
  answers         jsonb not null default '{}'::jsonb,
  current_question integer not null default 0,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
