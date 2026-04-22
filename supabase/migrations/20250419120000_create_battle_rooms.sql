-- Create battle_rooms table for real-time audio battles
CREATE TABLE IF NOT EXISTS public.battle_rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id text NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('host', 'co-host', 'speaker', 'audience')),
  display_name text NOT NULL,
  is_muted boolean DEFAULT true,
  is_speaking boolean DEFAULT false,
  requested_to_speak boolean DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  livekit_participant_id text,
  CONSTRAINT battle_rooms_unique UNIQUE (battle_id, user_id)
);

-- Create battle_speaker_requests table for speaker queue management
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

-- Create battle_votes table for real-time voting
CREATE TABLE IF NOT EXISTS public.battle_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id text NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('A', 'B')),
  round integer NOT NULL DEFAULT 1,
  voted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT battle_votes_unique UNIQUE (battle_id, user_id, round)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS battle_rooms_battle_id_idx ON public.battle_rooms(battle_id);
CREATE INDEX IF NOT EXISTS battle_rooms_user_id_idx ON public.battle_rooms(user_id);
CREATE INDEX IF NOT EXISTS battle_rooms_role_idx ON public.battle_rooms(role);
CREATE INDEX IF NOT EXISTS battle_rooms_last_seen_at_idx ON public.battle_rooms(last_seen_at);

CREATE INDEX IF NOT EXISTS battle_speaker_requests_battle_id_idx ON public.battle_speaker_requests(battle_id);
CREATE INDEX IF NOT EXISTS battle_speaker_requests_status_idx ON public.battle_speaker_requests(status);
CREATE INDEX IF NOT EXISTS battle_speaker_requests_requested_at_idx ON public.battle_speaker_requests(requested_at);

CREATE INDEX IF NOT EXISTS battle_votes_battle_id_idx ON public.battle_votes(battle_id);
CREATE INDEX IF NOT EXISTS battle_votes_round_idx ON public.battle_votes(round);

-- Enable Row Level Security
ALTER TABLE public.battle_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_speaker_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for battle_rooms
CREATE POLICY "battle_rooms are readable by authenticated users"
ON public.battle_rooms
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "battle_rooms are insertable by authenticated users"
ON public.battle_rooms
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "battle_rooms are updatable by own user"
ON public.battle_rooms
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "battle_rooms are deletable by own user"
ON public.battle_rooms
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policies for battle_speaker_requests
CREATE POLICY "battle_speaker_requests are readable by authenticated users"
ON public.battle_speaker_requests
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "battle_speaker_requests are insertable by authenticated users"
ON public.battle_speaker_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "battle_speaker_requests are updatable by hosts and co-hosts"
ON public.battle_speaker_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.battle_rooms br
    WHERE br.battle_id = battle_speaker_requests.battle_id
    AND br.user_id = auth.uid()
    AND br.role IN ('host', 'co-host')
  )
);

-- RLS Policies for battle_votes
CREATE POLICY "battle_votes are readable by authenticated users"
ON public.battle_votes
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "battle_votes are insertable by authenticated users"
ON public.battle_votes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename IN ('battle_rooms', 'battle_speaker_requests', 'battle_votes')
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_rooms;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_speaker_requests;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_votes;
  END IF;
END;
$$;
