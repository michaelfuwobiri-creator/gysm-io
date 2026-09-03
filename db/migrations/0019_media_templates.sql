-- Template System (42-tool spec, layer 6, item 37) -- a saved Media
-- Factory composer state (which skill, what prompt, which fixed-choice
-- pick value) a user can reload with one click instead of re-typing it
-- every time. Not tied to a specific generation's output -- this is the
-- *input* config, reusable across many future runs.
--
-- Safe to re-run: uses IF NOT EXISTS.

create table if not exists media_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  name        text not null,
  skill_id    text not null, -- matches a MediaSkillDef.id in LinearBuilderClient.tsx (e.g. "image", "thumbnail", "reframe")
  prompt      text not null default '',
  pick_value  text, -- reframe's aspect ratio / video-upscale's resolution, when the skill has one
  created_at  timestamptz not null default now()
);

create index if not exists media_templates_user_id_idx
  on media_templates (user_id, created_at desc);
