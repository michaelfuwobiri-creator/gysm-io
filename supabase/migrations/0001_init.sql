-- GYSM.IO -- core schema for the paywall/credits/projects system.
--
-- User identity is Clerk, not Supabase Auth (see lib/auth.ts, middleware.ts,
-- app/sign-in, app/sign-up). user_id columns below are Clerk user ids
-- (text, e.g. "user_2abc...") -- not uuids, and not foreign keys into
-- auth.users, because Clerk users are never written into Supabase's own
-- auth schema. All access to these tables goes through supabaseAdmin (the
-- service-role client, see lib/supabase.ts), which bypasses RLS entirely --
-- RLS is left enabled with no permissive policies as a default-deny backstop
-- in case the anon/authenticated key is ever used against these tables by
-- mistake.
--
-- Safe to re-run: tables use IF NOT EXISTS, functions use CREATE OR REPLACE,
-- policies are dropped and recreated.

create extension if not exists pgcrypto;

-- ============================================================================
-- credits -- one row per user, current balance. 500 credits = 1 build
-- (kept in sync with CREDIT_COST_PER_BUILD in lib/credits.ts).
-- ============================================================================
create table if not exists public.credits (
  user_id    text primary key,
  balance    integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.credits enable row level security;

drop policy if exists "credits: read own" on public.credits;

-- ============================================================================
-- subscriptions -- one row per user, mirrors the Stripe subscription state.
-- ============================================================================
create table if not exists public.subscriptions (
  user_id                 text primary key,
  stripe_customer_id      text,
  stripe_subscription_id  text unique,
  plan                    text,
  status                  text not null default 'inactive',
  current_period_end      timestamptz,
  updated_at              timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions: read own" on public.subscriptions;

-- ============================================================================
-- projects -- every generated build. is_template=true rows power /templates.
-- ============================================================================
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
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
drop policy if exists "projects: insert own" on public.projects;

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
create or replace function public.deduct_credit(p_user_id text, p_amount integer)
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
create or replace function public.add_credits(p_user_id text, p_amount integer)
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
