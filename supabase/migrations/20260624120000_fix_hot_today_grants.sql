-- Restore execute grants on get_today_hot_songs that were lost when
-- 20260529130000 dropped and recreated the function (DROP removes all grants).
-- Without these, unauthenticated users get a permission-denied error and the
-- frontend falls back to the direct song_analytics query instead of the RPC.

GRANT EXECUTE ON FUNCTION public.get_today_hot_songs(timestamp with time zone, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_today_hot_songs(timestamp with time zone, integer) TO authenticated;
