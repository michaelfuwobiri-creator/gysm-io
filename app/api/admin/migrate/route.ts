import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import { sql } from "@/lib/db";

// One-time operational helper, not a general migration framework. This
// sandbox has no DATABASE_URL (see lib/db.ts's own error message for
// why), so db/migrations/*.sql files can't be applied by running psql
// locally the way they normally would be -- but the deployed app already
// has DATABASE_URL configured in Vercel, and every statement below is
// copied verbatim from 0010_roadmap.sql / 0011_api_keys.sql (IF NOT
// EXISTS throughout, so hitting this twice is harmless). Admin-gated,
// POST-only, and each statement runs and reports individually so a
// partial failure is visible instead of silent.
//
// The neon() tagged-template driver runs one statement per call (no
// multi-statement support over its HTTP transport), so this is a list of
// individual statements rather than one big SQL string.
const STATEMENTS: { id: string; run: () => Promise<unknown> }[] = [
  {
    id: "0010_roadmap_items",
    run: () => sql`
      create table if not exists roadmap_items (
        id          uuid primary key default gen_random_uuid(),
        title       text not null,
        description text,
        status      text not null default 'planned',
        created_at  timestamptz not null default now()
      )
    `,
  },
  {
    id: "0010_roadmap_votes",
    run: () => sql`
      create table if not exists roadmap_votes (
        item_id     uuid not null references roadmap_items(id) on delete cascade,
        user_id     text not null,
        created_at  timestamptz not null default now(),
        primary key (item_id, user_id)
      )
    `,
  },
  {
    id: "0010_roadmap_items_status_idx",
    run: () => sql`create index if not exists roadmap_items_status_idx on roadmap_items (status)`,
  },
  {
    id: "0011_api_keys",
    run: () => sql`
      create table if not exists api_keys (
        id           uuid primary key default gen_random_uuid(),
        user_id      text not null,
        name         text not null,
        key_hash     text not null unique,
        key_prefix   text not null,
        created_at   timestamptz not null default now(),
        last_used_at timestamptz,
        revoked_at   timestamptz
      )
    `,
  },
  {
    id: "0011_api_keys_user_id_idx",
    run: () => sql`create index if not exists api_keys_user_id_idx on api_keys (user_id)`,
  },
  {
    id: "0011_api_keys_key_hash_idx",
    run: () => sql`create index if not exists api_keys_key_hash_idx on api_keys (key_hash) where revoked_at is null`,
  },
  // 0012_gap_features.sql -- github push, generic project connectors
  // (Airtable/Sheets/Resend/PostHog), and the automated pre-publish
  // check columns. Copied verbatim; wasn't in this runner yet even
  // though the code that depends on it already shipped, so adding it
  // now to make sure the underlying tables actually exist.
  {
    id: "0012_github_connections",
    run: () => sql`
      create table if not exists github_connections (
        id                uuid primary key default gen_random_uuid(),
        project_id        uuid not null references projects(id) on delete cascade,
        user_id           text not null,
        owner             text not null,
        repo              text not null,
        branch            text not null default 'main',
        token_encrypted   text not null,
        status            text not null default 'connected',
        error_message     text,
        last_pushed_at    timestamptz,
        last_commit_url   text,
        created_at        timestamptz not null default now(),
        updated_at        timestamptz not null default now()
      )
    `,
  },
  {
    id: "0012_github_connections_project_id_idx",
    run: () => sql`create unique index if not exists github_connections_project_id_idx on github_connections (project_id)`,
  },
  {
    id: "0012_github_connections_user_id_idx",
    run: () => sql`create index if not exists github_connections_user_id_idx on github_connections (user_id)`,
  },
  {
    id: "0012_project_connectors",
    run: () => sql`
      create table if not exists project_connectors (
        id                 uuid primary key default gen_random_uuid(),
        project_id         uuid not null references projects(id) on delete cascade,
        user_id            text not null,
        provider           text not null,
        config             jsonb not null default '{}'::jsonb,
        secret_encrypted   text,
        status             text not null default 'active',
        error_message      text,
        last_synced_at     timestamptz,
        created_at         timestamptz not null default now(),
        updated_at         timestamptz not null default now(),
        unique (project_id, provider)
      )
    `,
  },
  {
    id: "0012_project_connectors_user_id_idx",
    run: () => sql`create index if not exists project_connectors_user_id_idx on project_connectors (user_id)`,
  },
  {
    id: "0012_projects_check_status_col",
    run: () => sql`alter table projects add column if not exists check_status text`,
  },
  {
    id: "0012_projects_check_results_col",
    run: () => sql`alter table projects add column if not exists check_results jsonb`,
  },
  {
    id: "0012_projects_check_run_at_col",
    run: () => sql`alter table projects add column if not exists check_run_at timestamptz`,
  },
  // 0013_view_events.sql -- per-build analytics (views over time + top
  // referrers), additive alongside the existing `views` counter.
  {
    id: "0013_project_view_events",
    run: () => sql`
      create table if not exists project_view_events (
        id          uuid primary key default gen_random_uuid(),
        project_id  uuid not null references projects(id) on delete cascade,
        viewed_at   timestamptz not null default now(),
        referrer    text
      )
    `,
  },
  {
    id: "0013_project_view_events_idx",
    run: () => sql`create index if not exists project_view_events_project_id_idx on project_view_events (project_id, viewed_at desc)`,
  },
];

export async function POST(_req: NextRequest) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    return Response.json({ error: "Not authorized." }, { status: 403 });
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const stmt of STATEMENTS) {
    try {
      await stmt.run();
      results.push({ id: stmt.id, ok: true });
    } catch (error: any) {
      console.error(`[admin/migrate] ${stmt.id} failed:`, error.message);
      results.push({ id: stmt.id, ok: false, error: error.message });
    }
  }

  return Response.json({ results });
}
