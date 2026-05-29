-- Fix social_posts schema so song_id can hold the text IDs used throughout the app
-- (the column was uuid type but all song IDs are numeric text strings like '97', '44')

ALTER TABLE public.social_posts ALTER COLUMN song_id TYPE text USING song_id::text;

-- Add artist_id column for artist-follow posts
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS artist_id text;

-- Extend post_type constraint to include song_pulse and artist_follow
ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_post_type_check;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_post_type_check
  CHECK (post_type = ANY (ARRAY[
    'text','song_share','playlist_share','listening','welcome',
    'song_like','song_pulse','artist_follow'
  ]));

-- Fix create_song_like_social_post trigger
-- (was inserting post_type='activity' which is not in the constraint, and song_id type mismatch)
CREATE OR REPLACE FUNCTION public.create_song_like_social_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.social_posts (user_id, post_type, song_id, metadata, visibility)
  VALUES (
    NEW.user_id, 'song_like', NEW.song_id,
    jsonb_build_object('song_id', NEW.song_id, 'action', 'liked'),
    'public'
  );
  RETURN NEW;
END;
$$;

-- Fix create_song_pulse_social_post trigger
CREATE OR REPLACE FUNCTION public.create_song_pulse_social_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.event_type = 'pulse' AND NEW.song_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.social_posts (user_id, post_type, song_id, metadata, visibility)
    VALUES (
      NEW.user_id, 'song_pulse', NEW.song_id,
      jsonb_build_object('song_id', NEW.song_id, 'action', 'pulsed'),
      'public'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create triggers if they don't exist
DROP TRIGGER IF EXISTS trg_song_like_post ON public.liked_songs;
CREATE TRIGGER trg_song_like_post
  AFTER INSERT ON public.liked_songs
  FOR EACH ROW EXECUTE FUNCTION public.create_song_like_social_post();

DROP TRIGGER IF EXISTS trg_song_pulse_post ON public.song_analytics;
CREATE TRIGGER trg_song_pulse_post
  AFTER INSERT ON public.song_analytics
  FOR EACH ROW EXECUTE FUNCTION public.create_song_pulse_social_post();
