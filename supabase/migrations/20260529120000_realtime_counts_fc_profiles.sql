-- Fix get_community_profiles RPC: return all profile fields so avatars and
-- display names resolve correctly instead of falling back to "Listener".
-- Also UNIONs farcaster_profiles so FC mini-app context users appear in community.

-- Step 1: drop old narrow-return function first (cannot change return type in place)
DROP FUNCTION IF EXISTS public.get_community_profiles(integer, integer);

-- Step 2: create farcaster_profiles table (no auth.users FK – FC context users have no real auth row)
CREATE TABLE IF NOT EXISTS public.farcaster_profiles (
  fid          bigint      PRIMARY KEY,
  username     text,
  display_name text,
  pfp_url      text,
  location     text,
  bio          text,
  is_public    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.farcaster_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farcaster_profiles_select_all"
  ON public.farcaster_profiles FOR SELECT USING (true);

CREATE POLICY "farcaster_profiles_insert_anon"
  ON public.farcaster_profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "farcaster_profiles_update_anon"
  ON public.farcaster_profiles FOR UPDATE
  USING (true) WITH CHECK (true);

-- Step 3: add missing tables to realtime publication so postgres_changes listeners fire
-- (user_follows, liked_songs, liked_artists, song_analytics, post_likes, post_comments were missing)
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_follows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.liked_songs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.liked_artists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.song_analytics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.farcaster_profiles;

-- Step 4: recreate get_community_profiles including farcaster_profiles
CREATE FUNCTION public.get_community_profiles(p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid, user_id uuid,
  profile_name text, display_name text, username text,
  bio text,
  profile_picture_url text, avatar_url text, cover_photo_url text,
  location text, is_public boolean,
  created_at timestamp with time zone, updated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  (
    SELECT
      ap.id, ap.user_id,
      ap.profile_name, ap.display_name, ap.username,
      ap.bio,
      ap.profile_picture_url, ap.avatar_url, ap.cover_photo_url,
      ap.location, ap.is_public,
      ap.created_at, ap.updated_at
    FROM public.audience_profiles ap
  )
  UNION ALL
  (
    SELECT
      extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, ('fc-' || fp.fid::text)) AS id,
      extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, ('fc-' || fp.fid::text)) AS user_id,
      fp.display_name AS profile_name,
      fp.display_name,
      fp.username,
      fp.bio,
      fp.pfp_url   AS profile_picture_url,
      fp.pfp_url   AS avatar_url,
      NULL::text   AS cover_photo_url,
      fp.location,
      fp.is_public,
      fp.created_at, fp.updated_at
    FROM public.farcaster_profiles fp
  )
  ORDER BY updated_at DESC NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$$;

-- Step 5: create get_artist_follow_counts RPC (was missing – code called it but got fallback to RLS-restricted query)
CREATE OR REPLACE FUNCTION public.get_artist_follow_counts(artist_ids text[])
RETURNS TABLE(artist_id text, follower_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    la.artist_id,
    COUNT(DISTINCT la.user_id)::bigint AS follower_count
  FROM public.liked_artists la
  WHERE la.artist_id = ANY(artist_ids)
  GROUP BY la.artist_id
$$;

-- Step 6: fix profile_popularity view to match TypeScript ProfilePopularity interface
-- Old view had: user_id, display_name, avatar_url, play_count (wrong field names / missing fields)
-- Interface needs: profile_id, profile_name, profile_picture_url, total_post_likes, view_count, popularity_score
DROP VIEW IF EXISTS public.profile_popularity;

CREATE VIEW public.profile_popularity
WITH (security_invoker = true)
AS
SELECT
  ap.user_id                                              AS profile_id,
  ap.user_id,
  COALESCE(ap.display_name, ap.profile_name, ap.username) AS profile_name,
  COALESCE(ap.avatar_url, ap.profile_picture_url)         AS profile_picture_url,
  ap.bio,
  COALESCE(f.follower_count,    0)::bigint                AS follower_count,
  COALESCE(p.post_count,        0)::bigint                AS post_count,
  COALESCE(pl.total_post_likes, 0)::bigint                AS total_post_likes,
  COALESCE(v.view_count,        0)::bigint                AS view_count,
  (
    COALESCE(f.follower_count,    0) * 3 +
    COALESCE(p.post_count,        0) * 2 +
    COALESCE(pl.total_post_likes, 0) * 1
  )::bigint                                               AS popularity_score
FROM audience_profiles ap
LEFT JOIN (
  SELECT following_id AS user_id, COUNT(*)::integer AS follower_count
  FROM user_follows GROUP BY following_id
) f ON f.user_id = ap.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*)::integer AS post_count
  FROM social_posts GROUP BY user_id
) p ON p.user_id = ap.user_id
LEFT JOIN (
  SELECT sp.user_id, COUNT(pl.id)::integer AS total_post_likes
  FROM post_likes pl
  JOIN social_posts sp ON sp.id = pl.post_id
  GROUP BY sp.user_id
) pl ON pl.user_id = ap.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*)::integer AS view_count
  FROM song_analytics WHERE event_type = 'play'
  GROUP BY user_id
) v ON v.user_id = ap.user_id;
