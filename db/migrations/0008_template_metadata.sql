-- Template gallery metadata: a short, curated one-line description shown
-- under a template's name on /templates (see app/templates/page.tsx).
-- `name` already exists (0004_project_extras.sql, originally added for
-- build renaming) and is reused as the template's display title -- no
-- need for a separate title column.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS. Purely additive -- no
-- existing column, table, or row is touched.
alter table projects add column if not exists template_blurb text;
