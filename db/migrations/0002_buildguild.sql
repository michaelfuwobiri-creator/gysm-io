-- BuildGuild -- public gallery of published apps + comments/discussion.
--
-- Any user can publish one of their own projects to BuildGuild (opt-in,
-- is_public flag). Published projects show a title/tagline/publisher_name
-- set at publish time (independent of the original build prompt) plus a
-- comment thread anyone signed in can post to.
--
-- Applied directly against the live Neon database via SQL Editor on
-- 2026-08-15 -- this file documents that change for the repo/history.
-- Safe to re-run: every statement uses IF NOT EXISTS.

alter table projects add column if not exists is_public boolean not null default false;
alter table projects add column if not exists title text;
alter table projects add column if not exists tagline text;
alter table projects add column if not exists publisher_name text;
alter table projects add column if not exists published_at timestamptz;

-- ============================================================================
-- comments -- discussion thread on a published (BuildGuild) project.
-- ============================================================================
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id text,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_project_id_created_at_idx
  on comments (project_id, created_at asc);

create index if not exists projects_is_public_published_at_idx
  on projects (is_public, published_at desc)
  where is_public = true;
