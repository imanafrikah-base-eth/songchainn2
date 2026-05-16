-- SECURITY DEFINER function so the community page can list all audience_profiles
-- regardless of the per-user SELECT policies (is_public / user_follows checks).
-- This is intentional — the community page is meant to show everyone.

CREATE OR REPLACE FUNCTION public.get_community_profiles(
  p_limit  int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id               uuid,
  user_id          uuid,
  profile_name     text,
  bio              text,
  profile_picture_url text,
  cover_photo_url  text,
  location         text,
  is_public        boolean,
  created_at       timestamptz,
  updated_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    user_id,
    profile_name,
    bio,
    profile_picture_url,
    cover_photo_url,
    location,
    is_public,
    created_at,
    updated_at
  FROM public.audience_profiles
  ORDER BY updated_at DESC NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$$;

REVOKE ALL ON FUNCTION public.get_community_profiles(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_community_profiles(int, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_community_profiles(int, int) TO authenticated;
