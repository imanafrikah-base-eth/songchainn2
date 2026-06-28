-- Fix signup flow: wire the handle_new_user trigger, backfill missing profiles,
-- and repair existing profiles with null profile_name.

-- 1. Replace handle_new_user to also create a stub audience_profiles row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Stub audience profile: profile_name left NULL so Onboarding is required
  INSERT INTO public.audience_profiles (
    id, user_id, display_name, username, onboarding_completed, is_public, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      SPLIT_PART(COALESCE(NEW.email, ''), '@', 1)
    ),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'username', ''),
      SPLIT_PART(COALESCE(NEW.email, ''), '@', 1)
    ),
    false,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Audience role
  INSERT INTO public.user_roles (user_id, role)
  SELECT NEW.id, 'audience'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
  );

  RETURN NEW;
END;
$$;

-- 2. Wire trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill stub profiles for users who signed up before the trigger was wired
INSERT INTO public.audience_profiles (
  id, user_id, display_name, username, onboarding_completed, is_public, created_at, updated_at
)
SELECT
  u.id,
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'display_name', ''),
    NULLIF(u.raw_user_meta_data->>'name', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    SPLIT_PART(COALESCE(u.email, ''), '@', 1)
  ),
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'username', ''),
    SPLIT_PART(COALESCE(u.email, ''), '@', 1)
  ),
  false,
  true,
  NOW(),
  NOW()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.audience_profiles p WHERE p.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- 4. Repair profiles where profile_name is NULL: derive it from username/display_name
--    Sets onboarding_completed = true so these users aren't bounced back to Onboarding.
UPDATE public.audience_profiles
SET
  profile_name = CASE
    WHEN username IS NOT NULL AND TRIM(username) != '' THEN TRIM(username)
    WHEN display_name IS NOT NULL AND display_name NOT LIKE '%@%' AND TRIM(display_name) != '' THEN TRIM(display_name)
    WHEN display_name IS NOT NULL AND display_name LIKE '%@%' THEN SPLIT_PART(display_name, '@', 1)
    ELSE 'User'
  END,
  onboarding_completed = true
WHERE profile_name IS NULL OR TRIM(profile_name) = '';
