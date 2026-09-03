-- VOIIE v2 -- adds the pieces the hunter/ops dashboard needs that 0016
-- didn't cover yet: lead tagging + do-not-contact (compliance), demo-view
-- tracking (the "viewed" pixel), a real per-operator hunt-safety settings
-- row (daily limit / blacklist / spintax / kill switch -- previously just
-- UI mockup, now persisted), a lightweight customer/renewal layer for the
-- annual-renewal side of the business (gysm-io's own `projects`/`users`/
-- `subscriptions` tables have no notion of an expiry date or brand kit,
-- and VOIIE's $79-499 one-time-plus-renewal plans need one), and support
-- tickets. Safe to re-run: every statement uses IF NOT EXISTS / guards.

-- ============================================================================
-- voiie_leads: compliance + demo-engagement columns
-- ============================================================================
alter table voiie_leads add column if not exists tags text[] not null default '{}';
alter table voiie_leads add column if not exists do_not_contact boolean not null default false;
alter table voiie_leads add column if not exists demo_viewed_at timestamptz;

create index if not exists voiie_leads_owner_tags_idx
  on voiie_leads using gin (tags);

-- ============================================================================
-- voiie_settings: one row per operator -- the real state behind the
-- Hunter panel's "Anti-spam" controls (daily hunt limit, do-not-contact
-- blacklist, spintax toggle, kill switch). Upserted from app/voiie's
-- settings tab; read by lib/voiie/hunt.ts + lib/voiie/outreach.ts before
-- every hunt/send so the switches actually gate behavior, not just the UI.
-- ============================================================================
create table if not exists voiie_settings (
  owner_user_id     text primary key,
  daily_hunt_limit  integer not null default 50,
  spintax_enabled   boolean not null default true,
  kill_switch       boolean not null default false,
  blacklist         jsonb not null default '[]'::jsonb, -- handles/domains never to contact
  updated_at        timestamptz not null default now()
);

-- ============================================================================
-- voiie_customers: the renewal-relevant extension of a converted lead.
-- Deliberately NOT a duplicate of gysm-io's users/projects/subscriptions --
-- converted_user_id + demo_project_id already point at the real account
-- and the real project (see lib/voiie/billing.ts). This table only holds
-- what those don't: the annual expiry VOIIE's plans are sold against, the
-- gysm.io subdomain/custom domain shown in the Production tab, and the
-- extracted brand kit (logo/colors/theme) reused on repairs/upgrades.
-- ============================================================================
create table if not exists voiie_customers (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid not null unique references voiie_leads(id) on delete cascade,
  owner_user_id      text not null,
  converted_user_id  text not null,
  business_name      text not null,
  slug               text not null unique,
  gysm_subdomain     text not null,
  custom_domain      text,
  plan_id            text not null,
  brand_kit          jsonb not null default '{}'::jsonb,
  status             text not null default 'active', -- 'active' | 'renewal_due' | 'churned'
  expiry_date        timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists voiie_customers_owner_status_idx
  on voiie_customers (owner_user_id, status, expiry_date);

-- ============================================================================
-- voiie_renewals: one row per renewal/repair/upgrade charge sent to a
-- converted customer (renew domain+hosting, one-off repair, add feature,
-- plan upgrade). Populated by the renewals cron + the dashboard's manual
-- "Renew / Upgrade / Repair / Add Feature" actions.
-- ============================================================================
create table if not exists voiie_renewals (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null references voiie_customers(id) on delete cascade,
  type                   text not null,     -- 'domain' | 'hosting' | 'upgrade' | 'repair' | 'add_feature'
  amount_cents           integer not null,
  status                 text not null default 'pending', -- 'pending' | 'sent' | 'paid'
  due_date               timestamptz not null,
  stripe_checkout_session_id text,
  paid_at                timestamptz,
  created_at             timestamptz not null default now()
);

create index if not exists voiie_renewals_customer_status_idx
  on voiie_renewals (customer_id, status, due_date);

-- ============================================================================
-- voiie_support_tickets: post-conversion support issues raised against a
-- customer (bugs, change requests, billing questions).
-- ============================================================================
create table if not exists voiie_support_tickets (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references voiie_customers(id) on delete cascade,
  issue        text not null,
  status       text not null default 'open', -- 'open' | 'in_progress' | 'resolved'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists voiie_support_tickets_customer_status_idx
  on voiie_support_tickets (customer_id, status);
