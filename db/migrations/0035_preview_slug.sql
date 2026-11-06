-- Friendly names for hosted Agent previews (src.gysm.io, www.gysm.io/s/src).
alter table projects add column if not exists preview_slug text;
create unique index if not exists projects_preview_slug_key on projects (preview_slug) where preview_slug is not null;
