-- Team collaboration on a build (Gap 7, first slice): comments that work on
-- private builds, and a lightweight "who is viewing" presence list.
--
-- Both are keyed by the build's ROOT project id (coalesce(root_project_id, id)),
-- because every edit saves as a new projects row; keying by the root keeps one
-- discussion across all versions of the same build.
--
-- Safe to re-run (IF NOT EXISTS). Purely additive. The existing `comments`
-- table (public BuildGuild discussion) is untouched.
create table if not exists build_comments (
  id          uuid primary key default gen_random_uuid(),
  root_id     uuid not null references projects(id) on delete cascade,
  user_id     text not null,
  author_name text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists build_comments_root_idx on build_comments (root_id, created_at asc);

create table if not exists build_presence (
  root_id      uuid not null references projects(id) on delete cascade,
  user_id      text not null,
  display_name text not null,
  last_seen    timestamptz not null default now(),
  primary key (root_id, user_id)
);
