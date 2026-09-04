-- Item #9 (security hardening) from GYSM_IO_HANDOFF.md. Only the piece of
-- that item that actually needs a table: a generic audit log for
-- sensitive admin/destructive actions. Rate limiting lives in Upstash
-- Redis (see lib/rateLimit.ts), not Postgres, so it needs no migration.
--
-- Deliberately generic (actor/action/target/metadata) rather than one
-- column per action type, so new call sites (see lib/auditLog.ts) never
-- need a schema change -- same reasoning as roadmap_items.status being a
-- free-form text column instead of a Postgres enum.
--
-- Safe to re-run: every statement uses IF NOT EXISTS. Purely additive --
-- no existing column, table, or row is touched.
create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_user_id text,          -- Clerk user id; null for unauthenticated/system actions
  action       text not null,  -- e.g. 'roadmap.delete', 'project.delete', 'api_key.create'
  target_type  text,           -- e.g. 'project', 'roadmap_item', 'api_key'
  target_id    text,
  metadata     jsonb,          -- free-form extra detail (e.g. { "title": "..." } for a delete)
  created_at   timestamptz not null default now()
);

create index if not exists audit_log_actor_idx on audit_log (actor_user_id);
create index if not exists audit_log_action_idx on audit_log (action);
create index if not exists audit_log_created_at_idx on audit_log (created_at desc);
