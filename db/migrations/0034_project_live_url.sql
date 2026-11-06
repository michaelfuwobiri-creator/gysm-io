-- Sites deployed by GYSM Agent are saved as projects; live_url is where they run.
-- Optional: the app works without it (falls back to the saved preview).
alter table projects add column if not exists live_url text;
