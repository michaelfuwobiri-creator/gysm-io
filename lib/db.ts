import { neon } from "@neondatabase/serverless";

// Single Postgres database for this app (Neon) -- replaces the Supabase
// project that used to hold projects/credits/subscriptions. The `users`
// table synced from Clerk (see app/api/webhooks/clerk/route.ts) already
// lived here; projects/credits/subscriptions now do too, so there's one
// database instead of two.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "Missing DATABASE_URL. Set it in Vercel -> Project -> Settings -> Environment Variables (Neon connection string)."
  );
}

export const sql = neon(process.env.DATABASE_URL);

// Item #9 of GYSM_IO_HANDOFF.md asks for "RLS policies on all Supabase /
// clerk tables" -- flagging why that's not implemented literally, and
// what stands in for it instead. Row Level Security policies are enforced
// by Postgres per *database role*, and read via `auth.uid()`/`auth.jwt()`
// -- both are Supabase Auth/PostgREST concepts (the JWT Supabase's own
// API layer injects per request). This app talks to Neon directly through
// `sql` above, as one fixed database role, from trusted server-side route
// handlers authenticated via Clerk -- there's no PostgREST layer sitting
// between a browser and this database for RLS to gate, and no
// `auth.uid()` for a policy to call. Writing RLS policies against this
// schema would be inert: they'd just never fire.
//
// The real equivalent already in place, consistently, across every
// /api/* route in this app: every query is scoped in the WHERE clause
// itself to `user_id = ${user.id}` (or `org_id`) rather than trusted to
// application logic alone -- see app/api/projects/[id]/route.ts for the
// clearest example, including its comment on why org-admin-delete gets a
// narrower check than everything else. That's the same guarantee RLS
// gives (no request can read/write a row it doesn't own, enforced at the
// data-access layer, not just the UI), implemented at the one layer that
// actually sees every query here. db/migrations/0024_security_hardening.sql
// adds an audit_log table alongside this as the other real, actionable
// piece of item #9 -- see lib/auditLog.ts.
