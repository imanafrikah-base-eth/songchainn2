-- Harden get_song_popularity() against missing or empty tables.
-- Previous version referenced song_comments in the driving subquery; if that
-- table is empty or absent the whole CTE returns nothing and all counts show 0.
-- Rewrite to source song_ids from song_analytics + liked_songs only, keeping
-- SECURITY DEFINER so RLS is bypassed for global aggregate counts.

CREATE OR REPLACE FUNCTION public.get_song_popularity()
RETURNS TABLE (
  song_id       text,
  play_count    bigint,
  like_count    bigint,
  comment_count bigint,
  share_count   bigint,
  view_count    bigint,
  popularity_score bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    all_songs.song_id,
    COALESCE(p.plays,  0)::bigint AS play_count,
    COALESCE(l.likes,  0)::bigint AS like_count,
    COALESCE(c.comments, 0)::bigint AS comment_count,
    COALESCE(s.shares, 0)::bigint AS share_count,
    COALESCE(v.views,  0)::bigint AS view_count,
    (COALESCE(p.plays,  0) * 3 +
     COALESCE(l.likes,  0) * 5 +
     COALESCE(c.comments, 0) * 4 +
     COALESCE(s.shares, 0) * 6 +
     COALESCE(v.views,  0) * 1)::bigint AS popularity_score
  FROM (
    SELECT DISTINCT song_id FROM song_analytics WHERE song_id IS NOT NULL
    UNION
    SELECT DISTINCT song_id FROM liked_songs WHERE song_id IS NOT NULL
  ) all_songs
  LEFT JOIN (
    SELECT song_id, COUNT(*) AS plays
    FROM song_analytics WHERE event_type = 'play'
    GROUP BY song_id
  ) p USING (song_id)
  LEFT JOIN (
    SELECT song_id, COUNT(*) AS likes
    FROM liked_songs
    GROUP BY song_id
  ) l USING (song_id)
  LEFT JOIN (
    SELECT song_id, COUNT(*) AS shares
    FROM song_analytics WHERE event_type = 'share'
    GROUP BY song_id
  ) s USING (song_id)
  LEFT JOIN (
    SELECT song_id, COUNT(*) AS views
    FROM song_analytics WHERE event_type = 'view'
    GROUP BY song_id
  ) v USING (song_id)
  LEFT JOIN (
    SELECT song_id, COUNT(*) AS comments
    FROM song_analytics WHERE event_type = 'comment'
    GROUP BY song_id
  ) c USING (song_id)
$$;

REVOKE ALL ON FUNCTION public.get_song_popularity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_song_popularity() TO anon;
GRANT EXECUTE ON FUNCTION public.get_song_popularity() TO authenticated;

-- Re-apply get_pulse_counts with SECURITY DEFINER (idempotent).
CREATE OR REPLACE FUNCTION public.get_pulse_counts()
RETURNS TABLE (song_id text, pulse_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT song_id, COUNT(*)::bigint AS pulse_count
  FROM song_analytics
  WHERE event_type = 'pulse'
    AND song_id IS NOT NULL
  GROUP BY song_id
$$;

REVOKE ALL ON FUNCTION public.get_pulse_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pulse_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.get_pulse_counts() TO authenticated;

-- Re-apply get_today_hot_songs with SECURITY DEFINER (idempotent).
CREATE OR REPLACE FUNCTION public.get_today_hot_songs(
  p_since timestamptz DEFAULT (now() - interval '24 hours'),
  p_limit int DEFAULT 10
)
RETURNS TABLE (song_id text, plays_today bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT song_id, COUNT(*)::bigint AS plays_today
  FROM song_analytics
  WHERE event_type = 'play'
    AND created_at >= p_since
    AND song_id IS NOT NULL
  GROUP BY song_id
  ORDER BY plays_today DESC
  LIMIT p_limit
$$;

REVOKE ALL ON FUNCTION public.get_today_hot_songs(timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_today_hot_songs(timestamptz, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_today_hot_songs(timestamptz, int) TO authenticated;
