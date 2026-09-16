-- Music that lives in a world.
--
-- An artist can put a record in their own world and nowhere else: it plays for
-- the people who hold enough of their coin, and for everybody else there is a
-- preview video, which is the part the rest of the app is allowed to show.
--
-- The audio file itself is never named in public. Everything a visitor may see
-- (title, artwork, the preview) is in world_tracks; where the audio actually
-- sits is in world_track_files, which has row level security on and no policy
-- at all, so nothing but the service role can read it. A locked song whose URL
-- is in the page is not locked, and this is how that is prevented: the only
-- way to the audio is the world-track-url function, which checks the caller's
-- own wallet and hands back a link that dies in two minutes.
--
-- A world is named by slug rather than by row, because the first worlds are
-- defined in code (iman-afrikah) and the ones built in the builder are rows.
-- Both must be able to hold music.

create table if not exists public.world_tracks (
  id uuid primary key default gen_random_uuid(),
  world_slug text not null,
  world_id uuid references public.worlds(id) on delete cascade,
  /** The street it stands on, so a link can land somebody right in front of it. */
  street_slug text,
  /** Whose coin unlocks it. */
  artist_id text,
  title text not null,
  /** 'Part one', 'Side B', whatever the artist calls it. */
  part_label text,
  artist_credit text,
  artwork_url text,
  preview_video_url text,
  /** What it takes to play, in dollars of that artist's coin, priced when the play is tapped. */
  unlock_usd numeric not null default 1 check (unlock_usd >= 0 and unlock_usd <= 10000),
  duration_seconds numeric,
  sort_order integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists world_tracks_world_idx on public.world_tracks (world_slug, sort_order);
create index if not exists world_tracks_published_idx on public.world_tracks (published_at desc) where published_at is not null;

create table if not exists public.world_track_files (
  track_id uuid primary key references public.world_tracks(id) on delete cascade,
  bucket text not null default 'world-locked',
  path text not null,
  created_at timestamptz not null default now()
);

alter table public.world_tracks enable row level security;
alter table public.world_track_files enable row level security;

-- Everybody, signed in or not, may see a published track: its name, its cover,
-- its preview. That is the point of it.
drop policy if exists world_tracks_public_read on public.world_tracks;
create policy world_tracks_public_read on public.world_tracks
  for select to anon, authenticated
  using (published_at is not null and published_at <= now());

-- The artist who owns the world manages their own music, drafts included.
drop policy if exists world_tracks_owner_all on public.world_tracks;
create policy world_tracks_owner_all on public.world_tracks
  for all to authenticated
  using (
    exists (select 1 from public.worlds w where w.id = world_tracks.world_id and w.owner_id = (select auth.uid()))
    or exists (select 1 from public.artist_accounts a where a.artist_id = world_tracks.artist_id and a.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.worlds w where w.id = world_tracks.world_id and w.owner_id = (select auth.uid()))
    or exists (select 1 from public.artist_accounts a where a.artist_id = world_tracks.artist_id and a.user_id = (select auth.uid()))
  );

-- world_track_files deliberately has no policy: only the service role, inside
-- the world-track-url function, ever reads where the audio lives.

grant select on public.world_tracks to anon, authenticated;
grant insert, update, delete on public.world_tracks to authenticated;

comment on table public.world_tracks is 'Music that plays only inside an artist world, for holders of enough of that artist''s coin. Public rows are safe to show to anyone.';
comment on table public.world_track_files is 'Where a world track''s audio actually sits. Service role only, on purpose.';
