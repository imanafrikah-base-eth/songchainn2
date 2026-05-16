-- Allow song_pulse post type so pulse events can create feed posts.
-- Previous constraint omitted it, causing silent INSERT failures.

ALTER TABLE public.social_posts
DROP CONSTRAINT IF EXISTS social_posts_post_type_check;

ALTER TABLE public.social_posts
ADD CONSTRAINT social_posts_post_type_check
CHECK (post_type IN (
  'text',
  'song_share',
  'playlist_share',
  'listening',
  'welcome',
  'song_like',
  'song_pulse'
));
