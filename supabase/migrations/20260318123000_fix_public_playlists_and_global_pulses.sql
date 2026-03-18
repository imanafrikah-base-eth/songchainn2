ALTER TABLE public.playlists
ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Users can view their own playlists" ON public.playlists;
DROP POLICY IF EXISTS "playlists_public_or_owner_select" ON public.playlists;

CREATE POLICY "playlists_public_or_owner_select"
ON public.playlists
FOR SELECT
TO authenticated, anon
USING (
  is_public = true
  OR auth.uid() = user_id
);

DROP POLICY IF EXISTS "Users can only view own analytics" ON public.song_analytics;
DROP POLICY IF EXISTS "song_analytics_owner_or_pulse_select" ON public.song_analytics;
DROP POLICY IF EXISTS "Authenticated users can view all song analytics" ON public.song_analytics;

CREATE POLICY "song_analytics_owner_or_pulse_select"
ON public.song_analytics
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR event_type = 'pulse'
);
