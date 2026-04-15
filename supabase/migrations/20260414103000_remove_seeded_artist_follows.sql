-- Remove auto-seeded "everyone follows all artists" records.
-- This keeps real user-generated follows and clears matrix-like seeded rows.
WITH canonical_artists AS (
  SELECT artist_id
  FROM (
    VALUES ('1'), ('2'), ('3'), ('4'), ('5'), ('6'), ('7'), ('8'), ('9'), ('10')
  ) AS v(artist_id)
),
seeded_users AS (
  SELECT la.user_id
  FROM public.liked_artists la
  GROUP BY la.user_id
  HAVING
    COUNT(*) = (SELECT COUNT(*) FROM canonical_artists)
    AND COUNT(*) = COUNT(CASE WHEN la.artist_id IN (SELECT artist_id FROM canonical_artists) THEN 1 END)
)
DELETE FROM public.liked_artists la
USING seeded_users su
WHERE la.user_id = su.user_id
  AND la.artist_id IN (SELECT artist_id FROM canonical_artists);
