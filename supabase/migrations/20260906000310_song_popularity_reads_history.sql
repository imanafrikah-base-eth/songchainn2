-- Stream counts, part two: switch get_song_popularity() to read the history.
--
-- APPLY THIS TOGETHER WITH THE FRONTEND DEPLOY, NOT BEFORE. The bundle that
-- was live until then still adds its own baseline on the client; run this
-- under that bundle and every count doubles. The table and its rows
-- (20260906000300) are safe to have in place early: nothing reads them until
-- this runs.

-- The one place the sum happens. Same shape as before; play_count is now
-- history + real plays, and the song set includes anything with history.
create or replace function public.get_song_popularity()
returns table(
  song_id text,
  play_count bigint,
  like_count bigint,
  comment_count bigint,
  share_count bigint,
  view_count bigint,
  popularity_score bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
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
    select song_id, count(*) as plays
    from song_analytics where event_type = 'play'
    group by song_id
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
$$;

grant execute on function public.get_song_popularity() to anon, authenticated;
