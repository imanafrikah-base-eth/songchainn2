ALTER TABLE public.room_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room profiles are readable by authenticated users" ON public.room_profiles;
DROP POLICY IF EXISTS "Room profiles are insertable by owner" ON public.room_profiles;
DROP POLICY IF EXISTS "Room profiles are updatable by owner" ON public.room_profiles;

CREATE POLICY "Room profiles are readable by authenticated users"
ON public.room_profiles
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Room profiles are insertable by owner"
ON public.room_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Room profiles are updatable by owner"
ON public.room_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Room messages are readable by authenticated users" ON public.room_messages;
DROP POLICY IF EXISTS "Room messages are insertable by authenticated users" ON public.room_messages;

CREATE POLICY "Room messages are readable by authenticated users"
ON public.room_messages
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Room messages are insertable by authenticated users"
ON public.room_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.room_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'room_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_room_messages_older_than_24h()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.room_messages
  WHERE created_at < now() - interval '24 hours';
$$;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN;
  END;

  BEGIN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'room_messages_ttl_24h';
    PERFORM cron.schedule(
      'room_messages_ttl_24h',
      '0 * * * *',
      $$SELECT public.delete_room_messages_older_than_24h();$$
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN;
  END;
END;
$$;
