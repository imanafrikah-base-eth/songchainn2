-- Applied to the live project 12 Sep 2026 via MCP.
--
-- Two functions were still running with a role mutable search_path, the last
-- two the linter flags. Both are trigger functions, so they run on somebody
-- else's insert or update: whatever search_path that session happens to carry
-- is the one the function body resolves its table names against. Pinning it is
-- the documented fix and changes nothing about what they do.
alter function public.update_updated_at_column() set search_path = public, pg_temp;
alter function public.world_street_stage_sync() set search_path = public, pg_temp;
