ALTER TABLE public.room_messages
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS room_id text;

UPDATE public.room_messages
SET content = message
WHERE content IS NULL;

