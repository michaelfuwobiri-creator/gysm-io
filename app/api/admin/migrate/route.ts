import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import { sql } from "@/lib/db";

// One-time operational helper, not a general migration framework. This
// sandbox has no DATABASE_URL (see lib/db.ts's own error message for
// why), so db/migrations/*.sql files can't be applied by running psql
// locally the way they normally would be -- but the deployed app already
// has DATABASE_URL configured in Vercel, and every statement below is
// copied verbatim from db/migrations/0010_*.sql through 0021_*.sql (IF NOT
// EXISTS / ADD COLUMN IF NOT EXISTS throughout, so hitting this twice is harmless). Admin-gated,
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
  // 0014_project_tags.sql -- BuildGuild category chips.
  {
    id: "0014_projects_tags_col",
    run: () => sql`alter table projects add column if not exists tags text[] not null default '{}'`,
  },
  {
    id: "0014_projects_tags_gin_idx",
    run: () => sql`create index if not exists projects_tags_gin_idx on projects using gin (tags)`,
  },
  // 0015_media_generations.sql -- Media Factory core generation table.
  {
    id: "0015_media_generations",
    run: () => sql`
      create table if not exists media_generations (
        id               uuid primary key default gen_random_uuid(),
        user_id          text not null,
        kind             text not null,
        provider         text not null,
        status           text not null default 'pending',
        credit_cost      integer not null,
        input            jsonb not null default '{}',
        provider_job_id  text,
        output_url       text,
        error            text,
        created_at       timestamptz not null default now(),
        updated_at       timestamptz not null default now()
      )
    `,
  },
  {
    id: "0015_media_generations_user_id_created_at_idx",
    run: () => sql`create index if not exists media_generations_user_id_created_at_idx on media_generations (user_id, created_at desc)`,
  },
  // 0016_brand_kits.sql -- Brand Kit / Style Lock (item 36).
  {
    id: "0016_brand_kits",
    run: () => sql`
      create table if not exists brand_kits (
        user_id         text primary key,
        name            text,
        primary_color   text,
        secondary_color text,
        font_family     text,
        logo_url        text,
        created_at      timestamptz not null default now(),
        updated_at      timestamptz not null default now()
      )
    `,
  },
  // 0017_media_assets.sql -- Asset Management / Cast-Settings-Objects (item 10).
  {
    id: "0017_media_assets",
    run: () => sql`
      create table if not exists media_assets (
        id                  uuid primary key default gen_random_uuid(),
        user_id             text not null,
        category            text not null,
        name                text not null,
        reference_image_url text not null,
        created_at          timestamptz not null default now()
      )
    `,
  },
  {
    id: "0017_media_assets_user_id_category_idx",
    run: () => sql`create index if not exists media_assets_user_id_category_idx on media_assets (user_id, category, created_at desc)`,
  },
  // 0018_media_generations_public.sql -- Flow TV / Community Gallery (item 11).
  {
    id: "0018_media_generations_is_public_col",
    run: () => sql`alter table media_generations add column if not exists is_public boolean not null default false`,
  },
  {
    id: "0018_media_generations_publisher_name_col",
    run: () => sql`alter table media_generations add column if not exists publisher_name text`,
  },
  {
    id: "0018_media_generations_published_at_col",
    run: () => sql`alter table media_generations add column if not exists published_at timestamptz`,
  },
  {
    id: "0018_media_generations_public_idx",
    run: () => sql`create index if not exists media_generations_public_idx on media_generations (is_public, published_at desc) where is_public = true`,
  },
  // 0019_media_templates.sql -- Template System (item 37).
  {
    id: "0019_media_templates",
    run: () => sql`
      create table if not exists media_templates (
        id          uuid primary key default gen_random_uuid(),
        user_id     text not null,
        name        text not null,
        skill_id    text not null,
        prompt      text not null default '',
        pick_value  text,
        created_at  timestamptz not null default now()
      )
    `,
  },
  {
    id: "0019_media_templates_user_id_idx",
    run: () => sql`create index if not exists media_templates_user_id_idx on media_templates (user_id, created_at desc)`,
  },

  // 0020_voiie.sql -- VOIIE hunter/closer/builder: lead records, the
  // outreach thread, and in-progress consultation answers. Renumbered
  // from 0016 (its original number on this branch) to 0020 to clear of
  // main's own, unrelated 0014-0019 range above -- copied verbatim from
  // db/migrations/0016_voiie.sql; see it for the full design rationale.
  {
    id: "0020_voiie_leads",
    run: () => sql`
      create table if not exists voiie_leads (
        id                 uuid primary key default gen_random_uuid(),
        owner_user_id      text not null,
        platform           text not null default 'twitter',
        handle             text not null,
        display_name       text,
        bio                text,
        signal             text,
        contact_email      text,
        contact_phone      text,
        status             text not null default 'new',
        demo_project_id    uuid references projects(id) on delete set null,
        plan_id            text,
        stripe_checkout_session_id text,
        converted_user_id  text,
        converted_at       timestamptz,
        created_at         timestamptz not null default now(),
        updated_at         timestamptz not null default now()
      )
    `,
  },
  {
    id: "0020_voiie_leads_owner_status_idx",
    run: () => sql`create index if not exists voiie_leads_owner_status_idx on voiie_leads (owner_user_id, status, created_at desc)`,
  },
  {
    id: "0020_voiie_leads_owner_platform_handle_idx",
    run: () => sql`create unique index if not exists voiie_leads_owner_platform_handle_idx on voiie_leads (owner_user_id, platform, lower(handle))`,
  },
  {
    id: "0020_voiie_messages",
    run: () => sql`
      create table if not exists voiie_messages (
        id         uuid primary key default gen_random_uuid(),
        lead_id    uuid not null references voiie_leads(id) on delete cascade,
        direction  text not null,
        channel    text not null,
        body       text not null,
        meta       jsonb,
        created_at timestamptz not null default now()
      )
    `,
  },
  {
    id: "0020_voiie_messages_lead_id_created_at_idx",
    run: () => sql`create index if not exists voiie_messages_lead_id_created_at_idx on voiie_messages (lead_id, created_at asc)`,
  },
  {
    id: "0020_voiie_consultations",
    run: () => sql`
      create table if not exists voiie_consultations (
        lead_id          uuid primary key references voiie_leads(id) on delete cascade,
        answers          jsonb not null default '{}'::jsonb,
        current_question integer not null default 0,
        completed_at     timestamptz,
        created_at       timestamptz not null default now(),
        updated_at       timestamptz not null default now()
      )
    `,
  },

  // 0021_voiie_v2.sql -- lead compliance/engagement columns, real hunt-safety
  // settings, and the renewal-side customer/renewal/support-ticket tables.
  // Renumbered from 0017 for the same reason as above -- see
  // db/migrations/0017_voiie_v2.sql for the full rationale.
  // Split into 3 single-statement entries -- the combined version (one sql``
  // call with all 3 semicolon-separated ALTERs) failed live with "cannot
  // insert multiple commands into a prepared statement": Neon's serverless
  // driver runs each sql`` call as one prepared statement, and Postgres
  // prepared statements can't hold more than one command. That failure
  // then cascaded into 0021_voiie_leads_tags_idx below ("column tags does
  // not exist"), since the tags column never actually got added.
  {
    id: "0021_voiie_leads_tags",
    run: () => sql`alter table voiie_leads add column if not exists tags text[] not null default '{}'`,
  },
  {
    id: "0021_voiie_leads_dnc",
    run: () => sql`alter table voiie_leads add column if not exists do_not_contact boolean not null default false`,
  },
  {
    id: "0021_voiie_leads_demo_viewed",
    run: () => sql`alter table voiie_leads add column if not exists demo_viewed_at timestamptz`,
  },
  {
    id: "0021_voiie_leads_tags_idx",
    run: () => sql`
      create index if not exists voiie_leads_owner_tags_idx on voiie_leads using gin (tags)
    `,
  },
  {
    id: "0021_voiie_settings",
    run: () => sql`
      create table if not exists voiie_settings (
        owner_user_id     text primary key,
        daily_hunt_limit  integer not null default 50,
        spintax_enabled   boolean not null default true,
        kill_switch       boolean not null default false,
        blacklist         jsonb not null default '[]'::jsonb,
        updated_at        timestamptz not null default now()
      )
    `,
  },
  {
    id: "0021_voiie_customers",
    run: () => sql`
      create table if not exists voiie_customers (
        id                 uuid primary key default gen_random_uuid(),
        lead_id            uuid not null unique references voiie_leads(id) on delete cascade,
        owner_user_id      text not null,
        converted_user_id  text not null,
        business_name      text not null,
        slug               text not null unique,
        gysm_subdomain     text not null,
        custom_domain      text,
        plan_id            text not null,
        brand_kit          jsonb not null default '{}'::jsonb,
        status             text not null default 'active',
        expiry_date        timestamptz not null,
        created_at         timestamptz not null default now(),
        updated_at         timestamptz not null default now()
      )
    `,
  },
  {
    id: "0021_voiie_customers_owner_status_idx",
    run: () => sql`
      create index if not exists voiie_customers_owner_status_idx on voiie_customers (owner_user_id, status, expiry_date)
    `,
  },
  {
    id: "0021_voiie_renewals",
    run: () => sql`
      create table if not exists voiie_renewals (
        id                     uuid primary key default gen_random_uuid(),
        customer_id            uuid not null references voiie_customers(id) on delete cascade,
        type                   text not null,
        amount_cents           integer not null,
        status                 text not null default 'pending',
        due_date               timestamptz not null,
        stripe_checkout_session_id text,
        paid_at                timestamptz,
        created_at             timestamptz not null default now()
      )
    `,
  },
  {
    id: "0021_voiie_renewals_customer_status_idx",
    run: () => sql`
      create index if not exists voiie_renewals_customer_status_idx on voiie_renewals (customer_id, status, due_date)
    `,
  },
  {
    id: "0021_voiie_support_tickets",
    run: () => sql`
      create table if not exists voiie_support_tickets (
        id           uuid primary key default gen_random_uuid(),
        customer_id  uuid not null references voiie_customers(id) on delete cascade,
        issue        text not null,
        status       text not null default 'open',
        created_at   timestamptz not null default now(),
        updated_at   timestamptz not null default now()
      )
    `,
  },
  {
    id: "0021_voiie_support_tickets_customer_status_idx",
    run: () => sql`
      create index if not exists voiie_support_tickets_customer_status_idx on voiie_support_tickets (customer_id, status)
    `,
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
