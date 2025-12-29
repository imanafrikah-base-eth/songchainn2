ALTER TABLE public.room_messages
ADD COLUMN IF NOT EXISTS reply_to_message_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'room_messages_reply_to_message_id_fkey'
  ) THEN
    ALTER TABLE public.room_messages
    ADD CONSTRAINT room_messages_reply_to_message_id_fkey
    FOREIGN KEY (reply_to_message_id)
    REFERENCES public.room_messages (id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS room_messages_reply_to_message_id_idx
ON public.room_messages (reply_to_message_id);

ALTER TABLE public.room_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room profiles are readable by owner" ON public.room_profiles;
DROP POLICY IF EXISTS "Room profiles are readable by authenticated users" ON public.room_profiles;

CREATE POLICY "Room profiles are readable by authenticated users"
ON public.room_profiles
FOR SELECT
TO authenticated
USING (true);

