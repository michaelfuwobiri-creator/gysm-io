-- Coming-soon domain marketplace: captures interest emails instead of
-- wiring real checkout, which doesn't exist yet. Additive only -- new
-- table, no changes to existing schema.
create table if not exists marketplace_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  domain_interest text,
  created_at timestamptz not null default now(),
  unique (email)
);

create index if not exists marketplace_waitlist_created_at_idx on marketplace_waitlist (created_at desc);
