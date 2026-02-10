ALTER TABLE public.audience_profiles
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;

INSERT INTO public.audience_profiles (
  user_id,
  profile_name,
  bio,
  profile_picture_url,
  cover_photo_url,
  x_profile_link,
  base_profile_link,
  location,
  is_public,
  onboarding_completed,
  created_at,
  updated_at
)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'profile_name', ''),
    NULLIF(u.raw_user_meta_data->>'name', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    u.email,
    'User'
  ),
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'bio', ''),
    NULLIF(u.raw_user_meta_data->>'about', '')
  ),
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'avatar_url', ''),
    NULLIF(u.raw_user_meta_data->>'profile_picture_url', ''),
    NULLIF(u.raw_user_meta_data->>'picture', '')
  ),
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'cover_photo_url', ''),
    NULLIF(u.raw_user_meta_data->>'cover_url', '')
  ),
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'x_profile_link', ''),
    NULLIF(u.raw_user_meta_data->>'twitter_url', ''),
    NULLIF(u.raw_user_meta_data->>'twitter', '')
  ),
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'base_profile_link', ''),
    NULLIF(u.raw_user_meta_data->>'base_link', ''),
    NULLIF(u.raw_user_meta_data->>'wallet_address', ''),
    NULLIF(u.raw_user_meta_data->>'base_wallet_address', '')
  ),
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'location', ''),
    NULLIF(u.raw_user_meta_data->>'city', '')
  ),
  true,
  true,
  now(),
  now()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.audience_profiles p
  WHERE p.user_id = u.id
);

UPDATE public.audience_profiles p
SET
  profile_name = COALESCE(
    NULLIF(p.profile_name, ''),
    COALESCE(
      NULLIF(u.raw_user_meta_data->>'profile_name', ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      u.email,
      'User'
    )
  ),
  bio = COALESCE(
    p.bio,
    NULLIF(u.raw_user_meta_data->>'bio', ''),
    NULLIF(u.raw_user_meta_data->>'about', '')
  ),
  profile_picture_url = COALESCE(
    p.profile_picture_url,
    NULLIF(u.raw_user_meta_data->>'avatar_url', ''),
    NULLIF(u.raw_user_meta_data->>'profile_picture_url', ''),
    NULLIF(u.raw_user_meta_data->>'picture', '')
  ),
  cover_photo_url = COALESCE(
    p.cover_photo_url,
    NULLIF(u.raw_user_meta_data->>'cover_photo_url', ''),
    NULLIF(u.raw_user_meta_data->>'cover_url', '')
  ),
  x_profile_link = COALESCE(
    p.x_profile_link,
    NULLIF(u.raw_user_meta_data->>'x_profile_link', ''),
    NULLIF(u.raw_user_meta_data->>'twitter_url', ''),
    NULLIF(u.raw_user_meta_data->>'twitter', '')
  ),
  base_profile_link = COALESCE(
    p.base_profile_link,
    NULLIF(u.raw_user_meta_data->>'base_profile_link', ''),
    NULLIF(u.raw_user_meta_data->>'base_link', ''),
    NULLIF(u.raw_user_meta_data->>'wallet_address', ''),
    NULLIF(u.raw_user_meta_data->>'base_wallet_address', '')
  ),
  location = COALESCE(
    p.location,
    NULLIF(u.raw_user_meta_data->>'location', ''),
    NULLIF(u.raw_user_meta_data->>'city', '')
  ),
  onboarding_completed = true,
  is_public = COALESCE(p.is_public, true),
  updated_at = now()
FROM auth.users u
WHERE p.user_id = u.id;
