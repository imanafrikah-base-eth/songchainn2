-- Hot Today: strictly today's streams since midnight CAT (UTC+2), real counts, no fallback seeding.
-- The section resets every day at midnight Johannesburg/Nairobi time.
-- If p_since is NULL the server computes midnight CAT itself (protects against clock skew).

DROP FUNCTION IF EXISTS public.get_today_hot_songs(timestamp with time zone, integer);

CREATE FUNCTION public.get_today_hot_songs(
  p_since timestamp with time zone DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(song_id text, plays_today bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    sa.song_id,
    COUNT(*)::bigint AS plays_today
  FROM song_analytics sa
  WHERE sa.event_type = 'play'
    AND sa.song_id IS NOT NULL
    AND sa.created_at >= COALESCE(
          p_since,
          DATE_TRUNC('day', NOW() AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'Africa/Johannesburg'
        )
  GROUP BY sa.song_id
  ORDER BY plays_today DESC
  LIMIT p_limit;
$$;
