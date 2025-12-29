CREATE OR REPLACE FUNCTION public.get_artist_follower_count(p_artist_id text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 0::bigint
    ELSE (SELECT COUNT(*)::bigint FROM public.liked_artists WHERE artist_id = p_artist_id)
  END
$$;

REVOKE ALL ON FUNCTION public.get_artist_follower_count(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_artist_follower_count(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_artist_follow_counts(artist_ids text[])
RETURNS TABLE (artist_id text, follower_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT la.artist_id, COUNT(*)::bigint AS follower_count
  FROM public.liked_artists la
  WHERE auth.uid() IS NOT NULL
    AND la.artist_id = ANY(artist_ids)
  GROUP BY la.artist_id
$$;

REVOKE ALL ON FUNCTION public.get_artist_follow_counts(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_artist_follow_counts(text[]) TO authenticated;
