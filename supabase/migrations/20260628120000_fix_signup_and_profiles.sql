-- Fix signup flow: wire the handle_new_user trigger, backfill missing profiles,
-- repair existing profiles with null profile_name, and fix missing SELECT grant.

-- 1. Replace handle_new_user to also create a stub audience_profiles row.
--    Bugs fixed vs original:
--      - ON CONFLICT (user_id) → ON CONFLICT (id): user_id has no unique constraint, id is the PK
--      - username omitted from stub: username has UNIQUE constraint; leave NULL (nullable) for user to set in Onboarding
--      - role 'audience' → 'user': 'audience' is not a valid app_role enum value
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
BEGIN
  INSERT INTO public.audience_profiles (
    id, user_id, display_name, onboarding_completed, is_public, created_at, updated_at
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
    false,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  SELECT NEW.id, 'user'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
  );

  RETURN NEW;
END;
$func$;

-- 2. Wire trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Restore missing SELECT grant (anon + authenticated had INSERT/UPDATE/DELETE but no SELECT)
GRANT SELECT ON public.audience_profiles TO anon, authenticated;

-- 4. Backfill stub profiles for users who signed up before the trigger was wired
INSERT INTO public.audience_profiles (
  id, user_id, display_name, onboarding_completed, is_public, created_at, updated_at
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
  false,
  true,
  NOW(),
  NOW()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.audience_profiles p WHERE p.user_id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- 5. Repair profiles where profile_name is NULL: derive from username/display_name.
--    Sets onboarding_completed = true so existing users aren't bounced back to Onboarding.
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
