-- song_analytics had no INSERT policy — RLS was blocking every play/pulse/share insert silently.
-- Also grant table-level INSERT so the roles can actually write rows.

-- Authenticated users can insert their own events (or events with no user_id for guest plays)
CREATE POLICY "song_analytics_insert_authenticated"
  ON public.song_analytics
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Anonymous (guest) users can insert events with no user_id
CREATE POLICY "song_analytics_insert_anon"
  ON public.song_analytics
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- Ensure roles have table-level INSERT privilege
GRANT INSERT ON public.song_analytics TO authenticated;
GRANT INSERT ON public.song_analytics TO anon;
