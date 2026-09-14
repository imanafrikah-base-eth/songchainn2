-- Day Ones: the founding catalogue's rows carry the artist's name but no artist
-- id, so a fan of "LION HEART" earned the song receipt and never FAITH's. The
-- artist is read from the lead name ("IMAN AFRIKAH x RVSSIAN" is IMan Afrikah)
-- matched to the artist account with that name, and the artist receipts are
-- backfilled in the order fans got there.

create or replace function public.day_one_song_artist(_song_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    s.artist_id,
    (select a.artist_id::text
       from public.artist_accounts a
       join public.audience_profiles p on p.user_id = a.user_id
      where lower(btrim(p.display_name)) = lower(btrim(regexp_replace(s.artist_name, '\s+(x|&|feat\.?|ft\.?|featuring)\s+.*$', '', 'i')))
      order by a.artist_id::text
      limit 1)
  )
  from public.songs s
  where s.id = _song_id;
$$;
revoke all on function public.day_one_song_artist(text) from public, anon, authenticated;

create or replace function public.award_day_one(_user uuid, _song_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _artist text;
  _owner uuid;
  _published boolean;
begin
  if _user is null or _song_id is null then return; end if;

  select s.owner_id, coalesce(s.is_published, false)
    into _owner, _published
    from public.songs s where s.id = _song_id;
  if not found or not _published then return; end if;
  _artist := public.day_one_song_artist(_song_id);

  if _owner = _user then return; end if;
  if _artist is not null and exists (
    select 1 from public.artist_accounts a where a.user_id = _user and a.artist_id::text = _artist
  ) then return; end if;

  if not exists (select 1 from public.liked_songs l where l.user_id = _user and l.song_id = _song_id) then return; end if;
  if not exists (
    select 1 from public.song_analytics e where e.user_id = _user and e.song_id = _song_id and e.event_type = 'play'
  ) then return; end if;

  if not exists (select 1 from public.day_one_receipts r where r.user_id = _user and r.kind = 'song' and r.target_id = _song_id) then
    insert into public.day_one_receipts (user_id, kind, target_id, artist_id, fan_number)
    values (_user, 'song', _song_id, _artist, public.day_one_next_number('song', _song_id))
    on conflict do nothing;
  end if;

  if _artist is not null and not exists (
    select 1 from public.day_one_receipts r where r.user_id = _user and r.kind = 'artist' and r.target_id = _artist
  ) then
    insert into public.day_one_receipts (user_id, kind, target_id, artist_id, fan_number)
    values (_user, 'artist', _artist, _artist, public.day_one_next_number('artist', _artist))
    on conflict do nothing;
  end if;
exception when others then
  raise warning 'award_day_one: %', sqlerrm;
end;
$$;
revoke all on function public.award_day_one(uuid, text) from public, anon, authenticated;

-- Song receipts that were written without their artist.
update public.day_one_receipts r
   set artist_id = public.day_one_song_artist(r.target_id)
 where r.kind = 'song' and r.artist_id is null;

-- A fan's own artist account never keeps a receipt on that artist's songs.
delete from public.day_one_receipts r
 using public.artist_accounts a
 where r.kind = 'song' and a.user_id = r.user_id and a.artist_id::text = r.artist_id;

-- Artist receipts, in the order fans first qualified on any of that artist's songs.
-- Existing artist receipts keep their numbers; newcomers are numbered after them
-- only if they qualified later, so the whole list is renumbered once, here, by time.
with firsts as (
  select r.user_id, r.artist_id, min(r.earned_at) earned_at
    from public.day_one_receipts r
   where r.kind = 'song' and r.artist_id is not null
   group by r.user_id, r.artist_id
),
numbered as (
  select user_id, artist_id, earned_at,
         row_number() over (partition by artist_id order by earned_at, user_id) n
    from firsts
)
insert into public.day_one_receipts (user_id, kind, target_id, artist_id, fan_number, earned_at)
select user_id, 'artist', artist_id, artist_id, n + 100000, earned_at from numbered
on conflict (user_id, kind, target_id) do update set fan_number = excluded.fan_number, earned_at = excluded.earned_at;

update public.day_one_receipts set fan_number = fan_number - 100000 where kind = 'artist' and fan_number > 100000;

delete from public.day_one_counters where kind = 'artist';
insert into public.day_one_counters (kind, target_id, last_number)
select kind, target_id, max(fan_number) from public.day_one_receipts where kind = 'artist' group by kind, target_id;

-- The app hears a new receipt the moment it is earned.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'day_one_receipts') then
    execute 'alter publication supabase_realtime add table public.day_one_receipts';
  end if;
end $$;
