CREATE TABLE IF NOT EXISTS public.room_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  room_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_profiles_room_name_length CHECK (char_length(room_name) BETWEEN 2 AND 20)
);

CREATE TABLE IF NOT EXISTS public.room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  room_name text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_messages_message_length CHECK (char_length(message) BETWEEN 1 AND 280),
  CONSTRAINT room_messages_room_name_length CHECK (char_length(room_name) BETWEEN 2 AND 20)
);

ALTER TABLE public.room_messages
ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.room_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS room_messages_created_at_idx ON public.room_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS room_messages_reply_to_message_id_idx ON public.room_messages (reply_to_message_id);

CREATE UNIQUE INDEX IF NOT EXISTS room_profiles_room_name_unique_idx ON public.room_profiles (lower(room_name));

ALTER TABLE public.room_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room profiles are readable by owner" ON public.room_profiles;
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

ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
