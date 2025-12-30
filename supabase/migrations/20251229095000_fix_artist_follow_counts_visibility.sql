CREATE OR REPLACE FUNCTION public.get_artist_follower_count(p_artist_id text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.liked_artists
  WHERE artist_id = p_artist_id
$$;

REVOKE ALL ON FUNCTION public.get_artist_follower_count(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_artist_follower_count(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_artist_follow_counts(artist_ids text[])
RETURNS TABLE (artist_id text, follower_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT unnest(artist_ids)::text AS artist_id
  ),
  counts AS (
    SELECT la.artist_id, COUNT(*)::bigint AS follower_count
    FROM public.liked_artists la
    WHERE la.artist_id = ANY(artist_ids)
    GROUP BY la.artist_id
  )
  SELECT ids.artist_id, COALESCE(counts.follower_count, 0::bigint) AS follower_count
  FROM ids
  LEFT JOIN counts ON counts.artist_id = ids.artist_id
$$;

REVOKE ALL ON FUNCTION public.get_artist_follow_counts(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_artist_follow_counts(text[]) TO anon, authenticated;
