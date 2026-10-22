-- gysmlink and Shield were removed from the product. This drops their tables
-- and ALL data in them permanently. Safe to run more than once.
drop table if exists shield_alerts cascade;
drop table if exists shield_events cascade;
drop table if exists shield_agents cascade;
drop table if exists gysmlink_events cascade;
drop table if exists gysmlink_links cascade;
drop table if exists gysmlink_pages cascade;
