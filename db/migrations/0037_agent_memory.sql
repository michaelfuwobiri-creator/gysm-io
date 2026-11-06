-- GYSM Agent memory: short facts about a user's preferences (brand, style,
-- audience) that the agent saves with the remember tool and reads at the
-- start of every chat. The user can view and delete them. Safe to re-run.
create table if not exists agent_memory (
  id         bigserial primary key,
  user_id    text not null,
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_memory_user_idx on agent_memory (user_id, id);
