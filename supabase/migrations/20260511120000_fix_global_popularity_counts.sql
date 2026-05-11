-- Fix global popularity counts being scoped to per-user due to
-- security_invoker on song_popularity view + RLS on underlying tables.
-- SECURITY DEFINER functions bypass RLS only when they query tables
-- directly — NOT when going through a security_invoker view.

-- 1. Turn off security_invoker on the view so the fallback path also works.
ALTER VIEW public.song_popularity SET (security_invoker = off);

-- 2. Rebuild get_song_popularity() to query tables directly, bypassing the
--    view entirely. Grants anon so logged-out users also see global counts.
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
    SELECT DISTINCT song_id FROM song_analytics
    UNION
    SELECT DISTINCT song_id FROM liked_songs
    UNION
    SELECT DISTINCT song_id FROM song_comments
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
    FROM song_comments
    GROUP BY song_id
  ) c USING (song_id)
$$;

REVOKE ALL ON FUNCTION public.get_song_popularity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_song_popularity() TO anon;
GRANT EXECUTE ON FUNCTION public.get_song_popularity() TO authenticated;

-- 3. New RPC: global today-hot-songs (bypasses per-user RLS on song_analytics)
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
  GROUP BY song_id
  ORDER BY plays_today DESC
  LIMIT p_limit
$$;

REVOKE ALL ON FUNCTION public.get_today_hot_songs(timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_today_hot_songs(timestamptz, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_today_hot_songs(timestamptz, int) TO authenticated;

-- 4. New RPC: global pulse counts (bypasses per-user RLS on song_analytics)
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
  GROUP BY song_id
$$;

REVOKE ALL ON FUNCTION public.get_pulse_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pulse_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.get_pulse_counts() TO authenticated;
