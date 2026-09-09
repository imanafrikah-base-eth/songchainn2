-- A release can be timed to the minute, not just the day. release_at is the
-- moment; release_date stays in step (its date) for everything that groups
-- or sorts by day. Public read hides a record until release_at; the publish
-- trigger skips a timed release still ahead; announce_scheduled_releases()
-- now runs every five minutes and notifies followers once the moment passes.
-- Applied to the live project via MCP on 10 Sep 2026 (full body there).
alter table public.songs add column if not exists release_at timestamptz;
create index if not exists songs_release_at_idx on public.songs (release_at) where release_at is not null;
