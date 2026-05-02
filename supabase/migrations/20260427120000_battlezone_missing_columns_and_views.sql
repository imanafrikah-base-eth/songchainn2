-- Add requested_to_speak to battle_rooms if it was created before the full migration
ALTER TABLE public.battle_rooms
  ADD COLUMN IF NOT EXISTS requested_to_speak boolean NOT NULL DEFAULT false;

-- Ensure battle_speaker_requests exists (may already exist from the base migration)
CREATE TABLE IF NOT EXISTS public.battle_speaker_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id text NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  CONSTRAINT battle_speaker_requests_unique UNIQUE (battle_id, user_id)
);

CREATE INDEX IF NOT EXISTS battle_speaker_requests_battle_id_idx ON public.battle_speaker_requests(battle_id);
CREATE INDEX IF NOT EXISTS battle_speaker_requests_status_idx ON public.battle_speaker_requests(status);

ALTER TABLE public.battle_speaker_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'battle_speaker_requests' AND policyname = 'battle_speaker_requests are readable by authenticated users'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "battle_speaker_requests are readable by authenticated users"
      ON public.battle_speaker_requests FOR SELECT TO authenticated USING (true)
    $policy$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'battle_speaker_requests' AND policyname = 'battle_speaker_requests are insertable by authenticated users'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "battle_speaker_requests are insertable by authenticated users"
      ON public.battle_speaker_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'battle_speaker_requests' AND policyname = 'battle_speaker_requests are updatable by hosts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "battle_speaker_requests are updatable by hosts"
      ON public.battle_speaker_requests FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.battle_rooms br
          WHERE br.battle_id = battle_speaker_requests.battle_id
          AND br.user_id = auth.uid()
          AND br.role IN ('host', 'co-host')
        )
      )
    $policy$;
  END IF;
END;
$$;

-- battle_vote_counts: aggregate view for fast vote queries
CREATE OR REPLACE VIEW public.battle_vote_counts AS
  SELECT battle_id, side, COUNT(*)::integer AS vote_count
  FROM public.battle_votes
  GROUP BY battle_id, side;

-- battle_listener_counts: count active participants per battle
CREATE OR REPLACE VIEW public.battle_listener_counts AS
  SELECT battle_id, COUNT(*)::integer AS listener_count
  FROM public.battle_rooms
  WHERE last_seen_at >= now() - interval '60 seconds'
  GROUP BY battle_id;

-- Add to realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'battle_speaker_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_speaker_requests;
  END IF;
END;
$$;
