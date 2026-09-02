-- BuildGuild category tags -- a fixed set of chips (see BUILD_TAGS in
-- lib/buildTags.ts) a builder can attach to a project at publish time,
-- so /buildguild's filter chips can filter on something real instead of
-- being decorative. Optional (defaults to empty), max 3 per build,
-- enforced server-side in app/api/projects/[id]/publish/route.ts, not
-- just in the picker UI.
--
-- Applied directly against the live Neon database via SQL Editor, same
-- as db/migrations/0002_buildguild.sql. Safe to re-run.

alter table projects add column if not exists tags text[] not null default '{}';

-- GIN index so "which published builds have tag X" (the /buildguild
-- filter) doesn't do a sequential scan as the table grows.
create index if not exists projects_tags_gin_idx on projects using gin (tags);
