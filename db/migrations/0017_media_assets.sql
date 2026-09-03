-- Media Factory -- Asset Management / "Ingredients" (42-tool spec, layer
-- 2, item 10: Cast/Settings/Objects). A user's saved, named reference
-- images -- a character, a location, a prop -- reusable across
-- generations instead of re-describing (or re-uploading) the same thing
-- every time.
--
-- Deliberately just storage + a category label, no embedding/identity
-- model of its own: "consistency" comes from passing reference_image_url
-- into a real image-to-image or image-to-video call at generation time
-- (see lib/media/providers/fal.ts's generateImage() referenceImageUrl
-- param and app/api/media/video/route.ts's existing first_frame_image),
-- not from anything stored here.
--
-- Safe to re-run: every statement uses IF NOT EXISTS.

create table if not exists media_assets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null,
  category            text not null, -- 'cast' | 'setting' | 'object'
  name                text not null,
  reference_image_url text not null, -- data: URL or hosted URL, same convention MediaItem.url already uses
  created_at          timestamptz not null default now()
);

create index if not exists media_assets_user_id_category_idx
  on media_assets (user_id, category, created_at desc);
