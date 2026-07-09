-- Was authored earlier (20260302120000) but never actually applied to the
-- live project -- confirmed via information_schema that room_messages was
-- still missing content/room_id, which meant every chat message send
-- attempted the "full" insert, failed on the missing column, then fell back
-- to a minimal insert: a silent double round-trip on every single message.
-- Re-applied (IF NOT EXISTS-safe) so it actually takes effect.
ALTER TABLE public.room_messages
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS room_id text;

UPDATE public.room_messages
SET content = message
WHERE content IS NULL;
