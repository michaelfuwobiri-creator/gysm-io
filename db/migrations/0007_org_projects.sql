-- Team/workspace support via Clerk Organizations (membership optional --
-- existing users keep working exactly as before, on their personal
-- account; teams are a purely additive, opt-in layer). A build belongs
-- either to a personal account (org_id null, same as every build today)
-- or to an org (org_id set to the Clerk organization id), never both.
-- Clerk's own session already verifies org membership, so `org_id = the
-- caller's active org id` is a safe access check on its own -- see
-- lib/auth.ts and the routes under app/api/projects/[id]/*.
alter table projects add column if not exists org_id text;

create index if not exists projects_org_id_idx on projects (org_id);
