-- Song details, the distribution choice, activity sources and the sync desk.
-- Applied to the live project 4 Sep 2026.
--
-- DETAILS. Lyrics, credits, splits and the rights identifiers (ISRC, ISWC,
-- publisher, PRO) live on the song row and are editable by the artist at any
-- time. Every field is optional. They make a record "rights-ready": a sync
-- desk, a distributor or a publisher can read what they need without email.
--
-- DISTRIBUTION. An artist chooses at upload whether a record lives in the app
-- only or goes on chain as a tradeable asset; "app" is the default and can be
-- changed later ("Take it onchain"). The song_coins row is still the truth of
-- whether a coin exists; distribution records the artist's wish.
--
-- ACTIVITY. song_analytics gains where a play came from (feed, search, world,
-- battle, share, player) and the city it came from, so the activity board can
-- show streams by city and by source. City is derived server-side from the
-- request, never typed by anyone.

alter table public.songs
  add column if not exists lyrics text,
  add column if not exists description text,
  add column if not exists credits jsonb not null default '[]'::jsonb,
  add column if not exists splits jsonb not null default '[]'::jsonb,
  add column if not exists isrc text,
  add column if not exists iswc text,
  add column if not exists language text,
  add column if not exists explicit boolean not null default false,
  add column if not exists release_date date,
  add column if not exists publisher text,
  add column if not exists pro text,
  add column if not exists distribution text not null default 'app',
  add column if not exists onchain_requested_at timestamptz,
  add column if not exists details_updated_at timestamptz;

alter table public.songs drop constraint if exists songs_distribution_check;
alter table public.songs add constraint songs_distribution_check check (distribution in ('app','onchain'));

-- The seeded catalog has no owner_id; those artists are linked through
-- artist_accounts. Either link lets the artist edit their own records.
drop policy if exists "Artists update own songs" on public.songs;
create policy "Artists update own songs"
  on public.songs
  for update
  using (
    owner_id = (select auth.uid())
    or exists (select 1 from public.artist_accounts a where a.user_id = (select auth.uid()) and a.artist_id = songs.artist_id)
  )
  with check (
    owner_id = (select auth.uid())
    or exists (select 1 from public.artist_accounts a where a.user_id = (select auth.uid()) and a.artist_id = songs.artist_id)
  );

drop policy if exists "Artists read own songs" on public.songs;
create policy "Artists read own songs"
  on public.songs
  for select
  using (
    owner_id = (select auth.uid())
    or exists (select 1 from public.artist_accounts a where a.user_id = (select auth.uid()) and a.artist_id = songs.artist_id)
  );

alter table public.song_analytics
  add column if not exists source text,
  add column if not exists city text,
  add column if not exists country text;

create index if not exists song_analytics_song_time_idx on public.song_analytics (song_id, created_at desc);

-- ---------------------------------------------------------------- sync desk

create table if not exists public.sync_requests (
  id uuid primary key default gen_random_uuid(),
  song_id text not null,
  requester_name text not null,
  requester_email text not null,
  company text,
  use_type text not null,
  territory text,
  budget text,
  message text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.sync_requests enable row level security;

drop policy if exists "Anyone can ask to license a song" on public.sync_requests;
create policy "Anyone can ask to license a song"
  on public.sync_requests for insert to anon, authenticated
  with check (status = 'new' and length(requester_email) > 3 and length(requester_name) > 0);

drop policy if exists "Artists and admins read requests for their songs" on public.sync_requests;
create policy "Artists and admins read requests for their songs"
  on public.sync_requests for select to authenticated
  using (
    public.has_role((select auth.uid()), 'admin'::app_role)
    or exists (
      select 1 from public.songs s
       where s.id = sync_requests.song_id
         and (s.owner_id = (select auth.uid())
              or exists (select 1 from public.artist_accounts a where a.user_id = (select auth.uid()) and a.artist_id = s.artist_id))
    )
  );

grant insert on public.sync_requests to anon, authenticated;
grant select on public.sync_requests to authenticated;

-- ---------------------------------------------------------------- activity

-- One song's activity, for everybody: aggregates only, no person is named.
create or replace function public.song_activity(_song_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select generate_series((now() at time zone 'utc')::date - 29, (now() at time zone 'utc')::date, '1 day')::date as day
  ),
  plays as (
    select created_at, user_id, city, country, source
      from public.song_analytics
     where song_id = _song_id and event_type = 'play'
  )
  select jsonb_build_object(
    'song_id', _song_id,
    'plays_total', (select count(*) from plays),
    'plays_7d', (select count(*) from plays where created_at > now() - interval '7 days'),
    'plays_30d', (select count(*) from plays where created_at > now() - interval '30 days'),
    'listeners_30d', (select count(distinct user_id) from plays where user_id is not null and created_at > now() - interval '30 days'),
    'by_day', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'plays', coalesce(p.n, 0)) order by d.day)
        from days d
        left join (select (created_at at time zone 'utc')::date as day, count(*) as n from plays where created_at > now() - interval '30 days' group by 1) p on p.day = d.day
    ),
    'cities', (
      select coalesce(jsonb_agg(jsonb_build_object('city', city, 'country', country, 'plays', n) order by n desc), '[]'::jsonb)
        from (select city, country, count(*) as n from plays where city is not null and created_at > now() - interval '90 days' group by city, country order by n desc limit 8) c
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', source, 'plays', n) order by n desc), '[]'::jsonb)
        from (select coalesce(source, 'player') as source, count(*) as n from plays where created_at > now() - interval '90 days' group by 1 order by n desc) s
    ),
    'saves', (select count(*) from public.liked_songs where song_id = _song_id),
    'purchases', (select count(*) from public.song_purchases where song_id = _song_id),
    'copies_sold', (select coalesce(sum(copies), 0) from public.song_purchases where song_id = _song_id),
    'usd_volume', (select coalesce(round(sum(usd_paid)::numeric, 2), 0) from public.song_purchases where song_id = _song_id),
    'holders', (select count(distinct user_id) from public.song_holdings where song_id = _song_id and balance > 0)
  );
$$;

-- An artist's whole catalog, for the artist, their manager and anyone judging
-- the catalog. Money detail (individual purchases with transaction hashes)
-- is included only when the caller is the artist or an admin.
create or replace function public.artist_activity(_artist_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  mine as (
    select s.id, s.title
      from public.songs s
     where s.artist_id = _artist_id and s.is_published = true
  ),
  owns as (
    select exists (
      select 1 from public.artist_accounts a, me where a.artist_id = _artist_id and a.user_id = me.uid
    ) or public.has_role((select uid from me), 'admin'::app_role) as ok
  ),
  plays as (
    select p.song_id, p.created_at, p.user_id, p.city, p.country, p.source
      from public.song_analytics p
      join mine on mine.id = p.song_id
     where p.event_type = 'play'
  ),
  days as (
    select generate_series((now() at time zone 'utc')::date - 29, (now() at time zone 'utc')::date, '1 day')::date as day
  )
  select jsonb_build_object(
    'artist_id', _artist_id,
    'songs', (select count(*) from mine),
    'plays_total', (select count(*) from plays),
    'plays_30d', (select count(*) from plays where created_at > now() - interval '30 days'),
    'listeners_30d', (select count(distinct user_id) from plays where user_id is not null and created_at > now() - interval '30 days'),
    'by_day', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'plays', coalesce(p.n, 0)) order by d.day)
        from days d
        left join (select (created_at at time zone 'utc')::date as day, count(*) as n from plays where created_at > now() - interval '30 days' group by 1) p on p.day = d.day
    ),
    'cities', (
      select coalesce(jsonb_agg(jsonb_build_object('city', city, 'country', country, 'plays', n) order by n desc), '[]'::jsonb)
        from (select city, country, count(*) as n from plays where city is not null and created_at > now() - interval '90 days' group by city, country order by n desc limit 10) c
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', source, 'plays', n) order by n desc), '[]'::jsonb)
        from (select coalesce(source, 'player') as source, count(*) as n from plays where created_at > now() - interval '90 days' group by 1 order by n desc) s
    ),
    'saves', (select count(*) from public.liked_songs l join mine on mine.id = l.song_id),
    'followers', (select count(*) from public.liked_artists where artist_id = _artist_id),
    'purchases', (select count(*) from public.song_purchases sp join mine on mine.id = sp.song_id),
    'usd_volume', (select coalesce(round(sum(sp.usd_paid)::numeric, 2), 0) from public.song_purchases sp join mine on mine.id = sp.song_id),
    'holders', (select count(distinct sh.user_id) from public.song_holdings sh join mine on mine.id = sh.song_id where sh.balance > 0),
    'per_song', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'song_id', m.id, 'title', m.title,
          'plays_30d', (select count(*) from plays p where p.song_id = m.id and p.created_at > now() - interval '30 days'),
          'plays_total', (select count(*) from plays p where p.song_id = m.id),
          'saves', (select count(*) from public.liked_songs l where l.song_id = m.id),
          'purchases', (select count(*) from public.song_purchases sp where sp.song_id = m.id),
          'usd_volume', (select coalesce(round(sum(sp.usd_paid)::numeric, 2), 0) from public.song_purchases sp where sp.song_id = m.id),
          'holders', (select count(distinct sh.user_id) from public.song_holdings sh where sh.song_id = m.id and sh.balance > 0)
        ) order by (select count(*) from plays p where p.song_id = m.id and p.created_at > now() - interval '30 days') desc), '[]'::jsonb)
        from mine m
    ),
    'money', case when (select ok from owns) then (
      select coalesce(jsonb_agg(jsonb_build_object(
          'song_id', sp.song_id, 'title', m.title, 'copies', sp.copies, 'usd', sp.usd_paid, 'eth', sp.eth_paid,
          'tx_hash', sp.tx_hash, 'at', sp.purchased_at
        ) order by sp.purchased_at desc), '[]'::jsonb)
        from (select * from public.song_purchases order by purchased_at desc limit 100) sp
        join mine m on m.id = sp.song_id
    ) else null end
  );
$$;

grant execute on function public.song_activity(text) to anon, authenticated;
grant execute on function public.artist_activity(text) to anon, authenticated;
