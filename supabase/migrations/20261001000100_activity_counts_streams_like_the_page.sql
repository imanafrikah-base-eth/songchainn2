-- The Studio activity board and the song activity panel count plays the way
-- the artist's page counts streams.
--
-- Until now artist_activity() and song_activity() counted raw play rows: a
-- Room or battle listen shared by forty people counted forty times, the
-- stream history a record carried before plays were logged here was left
-- out, and a founding song with no artist_id on its row was not the
-- artist's at all. N3M3SIS's Studio read 92 all time while their page read
-- 1,641 and they reported that their streams do not match.
--
-- Three changes, both functions:
--   1. A play is counted once per group_key when it has one (a shared
--      listen), once per row otherwise. Same rule as song_play_counts().
--   2. plays_total adds song_stream_history.plays, the frozen baseline.
--   3. An artist's songs are those with their artist_id, plus the rows that
--      carry the same artist_name and no artist_id (the founding catalogue).
--
-- Signatures, grants and security settings are unchanged. The JSON keys are
-- the same ones the client reads today.

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
  -- One row per counted play: a shared listen collapses to its earliest row.
  plays as (
    select distinct on (coalesce(group_key, id::text))
           created_at, user_id, city, country, source
      from public.song_analytics
     where song_id = _song_id and event_type = 'play'
     order by coalesce(group_key, id::text), created_at
  ),
  history as (
    select coalesce(sum(plays), 0)::bigint as plays from public.song_stream_history where song_id = _song_id
  )
  select jsonb_build_object(
    'song_id', _song_id,
    'plays_total', (select count(*) from plays) + (select plays from history),
    'plays_7d', (select count(*) from plays where created_at > now() - interval '7 days'),
    'plays_30d', (select count(*) from plays where created_at > now() - interval '30 days'),
    'listeners_30d', (select count(distinct user_id) from plays where user_id is not null and created_at > now() - interval '30 days'),
    'by_day', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'plays', coalesce(p.n, 0)) order by d.day)
        from days d
        left join (select (created_at at time zone 'utc')::date as day, count(*) as n from plays where created_at > now() - interval '30 days' group by 1) p on p.day = d.day
    ),
    -- City floor: fewer than 3 plays in a city folds into Other.
    'cities', (
      select coalesce(jsonb_agg(jsonb_build_object('city', city, 'country', country, 'plays', n) order by (city = 'Other'), n desc), '[]'::jsonb)
        from (
          select city, country, sum(n) as n
            from (
              select case when n >= 3 then city    else 'Other' end as city,
                     case when n >= 3 then country else null    end as country,
                     n
                from (select city, country, count(*) as n from plays where city is not null and created_at > now() - interval '90 days' group by city, country) raw
            ) folded
           group by city, country
           order by (city = 'Other'), n desc
           limit 8
        ) c
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
  names as (
    select distinct artist_name from public.songs where artist_id = _artist_id and artist_name is not null
  ),
  mine as (
    select s.id, s.title
      from public.songs s
     where s.is_published = true
       and (s.artist_id = _artist_id
            or (s.artist_id is null and s.artist_name in (select artist_name from names)))
  ),
  owns as (
    select exists (
      select 1 from public.artist_accounts a, me where a.artist_id = _artist_id and a.user_id = me.uid
    ) or public.has_role((select uid from me), 'admin'::app_role) as ok
  ),
  -- One row per counted play: a shared listen collapses to its earliest row.
  plays as (
    select distinct on (coalesce(p.group_key, p.id::text))
           p.song_id, p.created_at, p.user_id, p.city, p.country, p.source
      from public.song_analytics p
      join mine on mine.id = p.song_id
     where p.event_type = 'play'
     order by coalesce(p.group_key, p.id::text), p.created_at
  ),
  history as (
    select h.song_id, h.plays from public.song_stream_history h join mine on mine.id = h.song_id
  ),
  days as (
    select generate_series((now() at time zone 'utc')::date - 29, (now() at time zone 'utc')::date, '1 day')::date as day
  )
  select jsonb_build_object(
    'artist_id', _artist_id,
    'songs', (select count(*) from mine),
    'plays_total', (select count(*) from plays) + (select coalesce(sum(plays), 0) from history),
    'plays_30d', (select count(*) from plays where created_at > now() - interval '30 days'),
    'listeners_30d', (select count(distinct user_id) from plays where user_id is not null and created_at > now() - interval '30 days'),
    'by_day', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'plays', coalesce(p.n, 0)) order by d.day)
        from days d
        left join (select (created_at at time zone 'utc')::date as day, count(*) as n from plays where created_at > now() - interval '30 days' group by 1) p on p.day = d.day
    ),
    -- City floor: fewer than 3 plays in a city folds into Other.
    'cities', (
      select coalesce(jsonb_agg(jsonb_build_object('city', city, 'country', country, 'plays', n) order by (city = 'Other'), n desc), '[]'::jsonb)
        from (
          select city, country, sum(n) as n
            from (
              select case when n >= 3 then city    else 'Other' end as city,
                     case when n >= 3 then country else null    end as country,
                     n
                from (select city, country, count(*) as n from plays where city is not null and created_at > now() - interval '90 days' group by city, country) raw
            ) folded
           group by city, country
           order by (city = 'Other'), n desc
           limit 10
        ) c
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
          'plays_total', (select count(*) from plays p where p.song_id = m.id) + (select coalesce(sum(h.plays), 0) from history h where h.song_id = m.id),
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
