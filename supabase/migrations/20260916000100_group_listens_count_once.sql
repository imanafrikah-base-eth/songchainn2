-- A song heard together is one stream.
--
-- The Room and a battle play one song to a whole crowd. Every listener still
-- records their own listen, so an artist can still see who was there and the
-- points engine still has something to pay, but the stream count must not go
-- up by the size of the room: a group listen is one stream.
--
-- Each listen from a group place carries the same group_key ('room:<entry id>',
-- 'battle:<battle id>:<song id>'). Everywhere plays are counted, listens with a
-- key count once per key, and listens without one count one each as they always
-- have.

alter table public.song_analytics add column if not exists group_key text;

comment on column public.song_analytics.group_key is
  'Set when the listen was part of one shared play (the Room, a battle). All the listeners of that play share the key, and stream counts count the key once.';

create index if not exists song_analytics_group_key_idx
  on public.song_analytics (group_key)
  where group_key is not null;

-- Plays, counted the way a stream is counted: one per shared play, one per
-- listen otherwise.
create or replace function public.song_play_counts()
returns table(song_id text, plays bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    sa.song_id,
    (count(*) filter (where sa.group_key is null) + count(distinct sa.group_key))::bigint as plays
  from song_analytics sa
  where sa.event_type = 'play'
    and sa.song_id is not null
  group by sa.song_id;
$function$;

create or replace function public.get_song_popularity()
returns table(song_id text, play_count bigint, like_count bigint, comment_count bigint, share_count bigint, view_count bigint, popularity_score bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    all_songs.song_id,
    (coalesce(h.plays, 0) + coalesce(p.plays, 0))::bigint as play_count,
    coalesce(l.likes, 0)::bigint as like_count,
    coalesce(c.comments, 0)::bigint as comment_count,
    coalesce(s.shares, 0)::bigint as share_count,
    coalesce(v.views, 0)::bigint as view_count,
    ((coalesce(h.plays, 0) + coalesce(p.plays, 0)) * 3 +
     coalesce(l.likes, 0) * 5 +
     coalesce(c.comments, 0) * 4 +
     coalesce(s.shares, 0) * 6 +
     coalesce(v.views, 0) * 1)::bigint as popularity_score
  from (
    select distinct song_id from song_analytics where song_id is not null
    union
    select distinct song_id from liked_songs where song_id is not null
    union
    select song_id from song_stream_history
  ) all_songs
  left join (
    select song_id, plays from song_stream_history
  ) h using (song_id)
  left join (
    select song_id, plays from song_play_counts()
  ) p using (song_id)
  left join (
    select song_id, count(*) as likes
    from liked_songs
    group by song_id
  ) l using (song_id)
  left join (
    select song_id, count(*) as shares
    from song_analytics where event_type = 'share'
    group by song_id
  ) s using (song_id)
  left join (
    select song_id, count(*) as views
    from song_analytics where event_type = 'view'
    group by song_id
  ) v using (song_id)
  left join (
    select song_id, count(*) as comments
    from song_analytics where event_type = 'comment'
    group by song_id
  ) c using (song_id);
$function$;

create or replace function public.get_today_hot_songs(p_since timestamp with time zone default null::timestamp with time zone, p_limit integer default 10)
returns table(song_id text, plays_today bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    sa.song_id,
    (count(*) filter (where sa.group_key is null) + count(distinct sa.group_key))::bigint as plays_today
  from song_analytics sa
  where sa.event_type = 'play'
    and sa.song_id is not null
    -- If no p_since passed, compute midnight CAT (UTC+2) on the server
    and sa.created_at >= coalesce(
          p_since,
          date_trunc('day', now() at time zone 'Africa/Johannesburg') at time zone 'Africa/Johannesburg'
        )
  group by sa.song_id
  order by plays_today desc
  limit p_limit;
$function$;

grant execute on function public.song_play_counts() to anon, authenticated;
grant execute on function public.get_song_popularity() to anon, authenticated;
grant execute on function public.get_today_hot_songs(timestamp with time zone, integer) to anon, authenticated;
