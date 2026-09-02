-- Media Factory -- real (non-simulated) image/video/avatar/audio
-- generation, credit-metered the same way builds already are (see
-- lib/credits.ts's deductCredit). One row per generation request,
-- regardless of provider -- kind/provider/status/output_url cover every
-- capability (image, video, avatar, captions, tts, voice-clone, music,
-- edit) without a separate table per provider.
--
-- Not tied to a project: a generated image/clip may end up used inside a
-- build later (see the "Use as Hero" style actions in the builder), but
-- the generation itself is a standalone user asset, same relationship a
-- photo library has to the documents it gets pasted into.
--
-- status lifecycle: pending -> (processing for async providers) -> done
-- | failed. Synchronous providers (image, captions, tts, edit) go
-- straight pending -> done|failed in one request. Async providers
-- (video, avatar, music) return provider_job_id immediately and the
-- client polls GET /api/media/[id]/status, which itself polls the
-- provider and updates this row.
--
-- Safe to re-run: every statement uses IF NOT EXISTS.

create table if not exists media_generations (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null,
  kind             text not null, -- 'image' | 'video' | 'avatar' | 'captions' | 'tts' | 'voice-clone' | 'music' | 'edit'
  provider         text not null, -- 'fal' | 'replicate' | 'heygen' | 'openai' | 'elevenlabs'
  status           text not null default 'pending', -- 'pending' | 'processing' | 'done' | 'failed'
  credit_cost      integer not null,
  input            jsonb not null default '{}',
  provider_job_id  text,
  output_url       text,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists media_generations_user_id_created_at_idx
  on media_generations (user_id, created_at desc);
