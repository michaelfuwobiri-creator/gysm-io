-- GYSM.IO -- core schema for the paywall/credits/projects system.
--
-- READ THIS FIRST: your repo had no SQL migrations in it at all -- whatever
-- tables exist today in your live Supabase project were created by hand in
-- the dashboard, and I have no way to inspect that schema from here. Before
-- running this:
--   1. Open Supabase -> Table Editor and check whether `credits`,
--      `subscriptions`, or `projects` tables already exist.
--   2. If they don't exist yet, just run this whole file in the SQL Editor.
--   3. If any of them already exist with DIFFERENT columns than below, tell
--      me the actual column names/types and I'll adjust lib/credits.ts,
--      lib/stripe.ts and the webhook to match instead of the other way
--      around -- don't blindly run this over live data.
--
-- Safe to re-run: tables use IF NOT EXISTS, functions use CREATE OR REPLACE,
-- policies are dropped and recreated.

create extension if not exists pgcrypto;

-- ============================================================================
-- credits -- one row per user, current balance. 500 credits = 1 build
-- (kept in sync with CREDIT_COST_PER_BUILD in lib/credits.ts).
-- ============================================================================
create table if not exists public.credits (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.credits enable row level security;

drop policy if exists "credits: read own" on public.credits;
create policy "credits: read own"
  on public.credits for select
  using (auth.uid() = user_id);

-- No client-side insert/update/delete policies on purpose: every write goes
-- through deduct_credit()/add_credits() below (SECURITY DEFINER) or through
-- the service-role key on the server. The app never writes this table from
-- the browser.

-- ============================================================================
-- subscriptions -- one row per user, mirrors the Stripe subscription state.
-- ============================================================================
create table if not exists public.subscriptions (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  plan                   text,
  status                 text not null default 'inactive',
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Writes happen only via the service-role key (app/api/billing/webhook), so
-- no client-facing write policy is defined here either.

-- ============================================================================
-- projects -- every generated build. is_template=true rows power /templates.
-- ============================================================================
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  prompt      text not null,
  html        text not null,
  is_template boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists projects_user_id_created_at_idx
  on public.projects (user_id, created_at desc);

create index if not exists projects_is_template_idx
  on public.projects (is_template)
  where is_template = true;

alter table public.projects enable row level security;

drop policy if exists "projects: read own or template" on public.projects;
create policy "projects: read own or template"
  on public.projects for select
  using (auth.uid() = user_id or is_template = true);

drop policy if exists "projects: insert own" on public.projects;
create policy "projects: insert own"
  on public.projects for insert
  with check (auth.uid() = user_id);

-- ============================================================================
-- deduct_credit -- atomic paywall check-and-deduct. Called from
-- app/api/generate/route.ts AFTER a successful generation. The WHERE clause
-- (balance >= p_amount) runs inside the single UPDATE, so two concurrent
-- requests from the same user can't both pass a balance check that was read
-- before either deduction landed -- Postgres serializes the two updates on
-- the row, and the second one re-evaluates the guard against the already-
-- decremented balance. Returns false (no row updated) if insufficient credit
-- or if the user has no credits row at all yet.
-- ============================================================================
create or replace function public.deduct_credit(p_user_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.credits
    set balance = balance - p_amount,
        updated_at = now()
    where user_id = p_user_id
      and balance >= p_amount;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- ============================================================================
-- add_credits -- called from the Stripe webhook on checkout.session.completed
-- and invoice.paid (renewals). Upserts so a brand-new user's first payment
-- doesn't need a pre-existing credits row.
-- ============================================================================
create or replace function public.add_credits(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credits (user_id, balance, updated_at)
  values (p_user_id, p_amount, now())
  on conflict (user_id)
  do update set balance = public.credits.balance + excluded.balance,
                updated_at = now();
end;
$$;
