-- A street the artist has put away: kept, with everything on it, but not on
-- the map and not reachable by visitors until it is shown again.
-- Applied to the live project via MCP on 10 Sep 2026.
alter table public.world_streets add column if not exists hidden boolean not null default false;
