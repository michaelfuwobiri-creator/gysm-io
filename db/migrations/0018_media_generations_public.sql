-- Flow TV / Community Gallery (42-tool spec, layer 2, item 11) -- lets a
-- user opt a finished generation into a public gallery, same is_public
-- opt-in pattern projects/BuildGuild already uses (see
-- db/migrations/0014_project_tags.sql's neighbor migrations and
-- app/api/projects/[id]/publish/route.ts). Off by default -- every
-- existing generation stays private until its owner explicitly
-- publishes it.
--
-- publisher_name is denormalized at publish time from the real signed-in
-- user's name (same as projects.publisher_name), not joined from a
-- separate users table -- there isn't one; identity comes from Clerk via
-- getUser().
--
-- Safe to re-run: every statement uses IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS.

alter table media_generations add column if not exists is_public boolean not null default false;
alter table media_generations add column if not exists publisher_name text;
alter table media_generations add column if not exists published_at timestamptz;

create index if not exists media_generations_public_idx
  on media_generations (is_public, published_at desc)
  where is_public = true;
