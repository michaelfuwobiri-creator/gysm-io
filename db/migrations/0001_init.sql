-- GYSM.IO -- core schema, all in Neon.
--
-- User identity is Clerk (see lib/auth.ts, middleware.ts, app/sign-in,
-- app/sign-up). user_id columns below are Clerk user ids (text, e.g.
-- "user_2abc..."). This app used to split its data across two databases --
-- a Supabase project for projects/credits/subscriptions and Neon for a
-- `users` mirror synced from Clerk webhooks. Supabase has been dropped;
-- everything now lives here in Neon, queried directly via
-- @neondatabase/serverless (see lib/db.ts) -- no ORM, no RLS, just the app
-- talking to its own database with the Clerk session as the only gate
-- (enforced in code, in lib/auth.ts and middleware.ts).
--
-- Safe to re-run: every statement uses IF NOT EXISTS.

create extension if not exists pgcrypto;

-- ============================================================================
-- users -- mirrors Clerk users, kept in sync by app/api/webhooks/clerk.
-- ============================================================================
create table if not exists users (
  id         serial primary key,
  clerk_id   text unique not null,
  email      text,
  name       text,
  image_url  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- credits -- one row per user, current balance. 500 credits = 1 build
-- (kept in sync with CREDIT_COST_PER_BUILD in lib/credits.ts).
-- ============================================================================
create table if not exists credits (
  user_id    text primary key,
  balance    integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- subscriptions -- one row per user, mirrors the Stripe subscription state.
-- ============================================================================
create table if not exists subscriptions (
  user_id                 text primary key,
  stripe_customer_id      text,
  stripe_subscription_id  text unique,
  plan                    text,
  status                  text not null default 'inactive',
  current_period_end      timestamptz,
  updated_at              timestamptz not null default now()
);

-- ============================================================================
-- projects -- every generated build. is_template=true rows power /templates.
-- ============================================================================
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  prompt      text not null,
  html        text not null,
  is_template boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists projects_user_id_created_at_idx
  on projects (user_id, created_at desc);

create index if not exists projects_is_template_idx
  on projects (is_template)
  where is_template = true;
