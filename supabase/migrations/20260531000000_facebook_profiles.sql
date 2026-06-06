-- facebook_profiles: community visibility for Facebook OAuth users.
-- Mirrors farcaster_profiles — stores FB profiles even when Supabase auth fails
-- so users appear in get_community_profiles() regardless of auth path.

CREATE TABLE IF NOT EXISTS public.facebook_profiles (
  facebook_id  text        PRIMARY KEY,
  name         text,
  email        text,
  picture_url  text,
  location     text,
  bio          text,
  is_public    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.facebook_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_profiles REPLICA IDENTITY FULL;

CREATE POLICY "facebook_profiles_select_all"
  ON public.facebook_profiles FOR SELECT USING (true);

CREATE POLICY "facebook_profiles_insert_anon"
  ON public.facebook_profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "facebook_profiles_update_anon"
  ON public.facebook_profiles FOR UPDATE USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.facebook_profiles;

-- Rebuild get_community_profiles() to include Facebook profiles in the union.
-- Must drop first — Postgres cannot change a function's return type in place.
DROP FUNCTION IF EXISTS public.get_community_profiles(integer, integer);

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
  UNION ALL
  (
    SELECT
      extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, ('fb-' || fbp.facebook_id)) AS id,
      extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, ('fb-' || fbp.facebook_id)) AS user_id,
      fbp.name        AS profile_name,
      fbp.name        AS display_name,
      NULL::text      AS username,
      fbp.bio,
      fbp.picture_url AS profile_picture_url,
      fbp.picture_url AS avatar_url,
      NULL::text      AS cover_photo_url,
      fbp.location,
      fbp.is_public,
      fbp.created_at, fbp.updated_at
    FROM public.facebook_profiles fbp
  )
  ORDER BY updated_at DESC NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$$;
