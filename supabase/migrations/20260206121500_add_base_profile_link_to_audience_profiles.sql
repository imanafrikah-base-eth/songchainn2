ALTER TABLE public.audience_profiles
ADD COLUMN IF NOT EXISTS base_profile_link TEXT;
