-- Voice in Artist Worlds: a station that goes live, and episodes saved from it.
--
-- A world's artist can open their station and talk, play and bring people on,
-- live, inside their own world. What they say can be kept as an episode that
-- visitors play back later. Free for the first ten worlds made (drafts count),
-- and for World #001, which lives in code rather than in this table.
-- Applied to the live project on 11 Sep 2026 through the Supabase MCP.

create table if not exists public.world_voice_sessions (
  id uuid primary key default gen_random_uuid(),
  -- Keyed by slug so World #001 (a coded world with no row here) can host too.
  world_slug text not null,
  world_id uuid references public.worlds(id) on delete cascade,
  host_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  room_name text not null,
  status text not null default 'live' check (status in ('live', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists world_voice_sessions_live on public.world_voice_sessions (world_slug) where status = 'live';

create table if not exists public.world_episodes (
  id uuid primary key default gen_random_uuid(),
  world_slug text not null,
  world_id uuid references public.worlds(id) on delete cascade,
  session_id uuid references public.world_voice_sessions(id) on delete set null,
  host_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  description text,
  storage_key text,
  audio_url text,
  mime_type text,
  bytes bigint,
  duration_seconds numeric,
  -- False until the recording is really in storage and the artist keeps it.
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists world_episodes_world on public.world_episodes (world_slug, created_at desc);

/** Is voice free for this world: one of the first ten worlds made, or World #001. */
create or replace function public.world_voice_free(_slug text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select _slug = 'iman-afrikah'
      or _slug in (select w.slug from public.worlds w order by w.created_at asc limit 10);
$$;

/** May the signed-in person host voice in this world. The owner only, and only where voice is on. */
create or replace function public.can_host_world_voice(_slug text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.world_voice_free(_slug) and (
    exists (select 1 from public.worlds w where w.slug = _slug and (w.owner_id = auth.uid() or public.has_world_role(w.id)))
    -- World #001 is written in code; its artist is catalog artist 3.
    or (_slug = 'iman-afrikah' and exists (select 1 from public.artist_accounts a where a.user_id = auth.uid() and a.artist_id = '3'))
  );
$$;

grant execute on function public.world_voice_free(text) to anon, authenticated;
grant execute on function public.can_host_world_voice(text) to authenticated;

alter table public.world_voice_sessions enable row level security;
alter table public.world_episodes enable row level security;

drop policy if exists "voice sessions are public" on public.world_voice_sessions;
create policy "voice sessions are public" on public.world_voice_sessions
  for select to anon, authenticated using (true);

drop policy if exists "hosts open their own sessions" on public.world_voice_sessions;
create policy "hosts open their own sessions" on public.world_voice_sessions
  for insert to authenticated
  with check (host_id = (select auth.uid()) and public.can_host_world_voice(world_slug));

drop policy if exists "hosts end their own sessions" on public.world_voice_sessions;
create policy "hosts end their own sessions" on public.world_voice_sessions
  for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

drop policy if exists "published episodes are public" on public.world_episodes;
create policy "published episodes are public" on public.world_episodes
  for select to anon, authenticated
  using (is_published or host_id = (select auth.uid()));

drop policy if exists "hosts keep their own episodes" on public.world_episodes;
create policy "hosts keep their own episodes" on public.world_episodes
  for insert to authenticated
  with check (host_id = (select auth.uid()) and public.can_host_world_voice(world_slug));

drop policy if exists "hosts change their own episodes" on public.world_episodes;
create policy "hosts change their own episodes" on public.world_episodes
  for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

drop policy if exists "hosts delete their own episodes" on public.world_episodes;
create policy "hosts delete their own episodes" on public.world_episodes
  for delete to authenticated
  using (host_id = (select auth.uid()));

grant select on public.world_voice_sessions, public.world_episodes to anon, authenticated;
grant insert, update on public.world_voice_sessions to authenticated;
grant insert, update, delete on public.world_episodes to authenticated;

-- An episode recording is an upload like any other, so a failed one is written down too.
alter table public.upload_failures drop constraint if exists upload_failures_kind_check;
alter table public.upload_failures add constraint upload_failures_kind_check check (kind in ('visual', 'song', 'episode'));
