-- Multi-file projects. A build is still one row in `projects`; its entry
-- document stays in projects.html (so every existing reader keeps working).
-- Extra files, and index.html's mirror, live here. A single-file build has
-- no rows in this table.
--
-- Safe to re-run (IF NOT EXISTS). Purely additive: no existing data changes.
create table if not exists project_files (
  project_id  uuid not null references projects(id) on delete cascade,
  path        text not null,
  content     text not null,
  updated_at  timestamptz not null default now(),
  primary key (project_id, path)
);
create index if not exists project_files_project_id_idx on project_files (project_id);
