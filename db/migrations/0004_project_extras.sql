-- GYSM.IO -- build management features: rename, duplicate, version
-- history, remix, and lightweight view counts.
--
-- name             -- user-set display name, overrides the raw prompt on
--                      dashboard cards once set (see RenameButton).
-- views            -- incremented on each /publish/[id] page load.
-- root_project_id  -- edits always save as a NEW row (see
--                      app/api/generate/route.ts); this points every
--                      edit-descendant row back at the first row in its
--                      chain so the builder's History panel and the
--                      dashboard (which now only lists roots) can group
--                      them. Null on the root row itself and on
--                      duplicates/remixes, which intentionally start a
--                      fresh chain of their own.
--
-- Safe to re-run: every statement uses IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS. Purely additive -- no existing column, table, or row is touched.

alter table projects add column if not exists name text;
alter table projects add column if not exists views integer not null default 0;
alter table projects add column if not exists root_project_id uuid references projects(id) on delete set null;

create index if not exists projects_root_project_id_idx
  on projects (root_project_id);
