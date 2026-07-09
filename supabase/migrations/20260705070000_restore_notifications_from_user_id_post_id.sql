-- Restores from_user_id/post_id on notifications -- these were in the original
-- 20251220110001 migration but got dropped from the live table at some point
-- without a corresponding local migration, silently breaking every client-side
-- INSERT that includes them (follow notifications, room mentions, battle-live
-- broadcasts, comment-like notifications all reference these columns).

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS from_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS post_id uuid REFERENCES public.social_posts(id) ON DELETE CASCADE;
