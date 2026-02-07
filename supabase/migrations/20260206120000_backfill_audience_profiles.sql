insert into public.audience_profiles (
  user_id,
  profile_name,
  profile_picture_url,
  created_at,
  updated_at,
  is_public,
  onboarding_completed
)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'profile_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(u.raw_user_meta_data->>'full_name', ''),
    u.email,
    'User'
  ),
  nullif(u.raw_user_meta_data->>'avatar_url', ''),
  now(),
  now(),
  true,
  true
from auth.users u
where not exists (
  select 1
  from public.audience_profiles p
  where p.user_id = u.id
);
