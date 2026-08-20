-- Custom domains: lets a user point their own domain at a published
-- build. Additive only -- new columns on projects, nothing removed or
-- changed. Verification/DNS challenge is handled by Vercel's API (see
-- lib/vercelDomains.ts); we just track the state here so the builder UI
-- and middleware.ts (multi-tenant host routing) can read it cheaply.
alter table projects add column if not exists custom_domain text;
alter table projects add column if not exists custom_domain_status text not null default 'none';
alter table projects add column if not exists custom_domain_verification jsonb;

create unique index if not exists projects_custom_domain_unique_idx on projects (custom_domain) where custom_domain is not null;
