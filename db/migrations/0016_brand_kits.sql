-- Media Factory -- Brand Kit / Style Lock (42-tool spec, layer 6, item 36).
-- One row per user (upsert on user_id), not per-project -- a brand kit is
-- an identity thing ("this is GYSM's/my agency's look"), same scope as a
-- Stripe customer or a credit balance, not tied to any single build.
--
-- Deliberately just colors/font/logo-url text fields, no image processing
-- of its own: applying it is the caller's job (see lib/brandKit.ts's
-- brandKitPromptSuffix, wired into runMediaGeneration in
-- app/builder/LinearBuilderClient.tsx), not a new AI capability.
--
-- Safe to re-run: every statement uses IF NOT EXISTS.

create table if not exists brand_kits (
  user_id         text primary key,
  name            text,
  primary_color   text,   -- hex, e.g. '#FF0080'
  secondary_color text,   -- hex
  font_family     text,
  logo_url        text,   -- data: URL or hosted URL, same convention MediaItem.url already uses
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
