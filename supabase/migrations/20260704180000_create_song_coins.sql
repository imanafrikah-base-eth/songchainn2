-- Tracks Zora Content Coin minting status per song, keyed by the same song id
-- used in src/data/musicData.ts. Scoped only to token/mint tracking -- does not
-- duplicate the unrelated public.songs table (used solely by api/song-og.ts).

CREATE TABLE IF NOT EXISTS public.song_coins (
  song_id text PRIMARY KEY,
  zora_coin_address text,
  payout_recipient text NOT NULL,
  mint_status text NOT NULL DEFAULT 'unminted' CHECK (mint_status IN ('unminted','pending','minted','failed')),
  mint_tx_hash text,
  minted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.song_coins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "song_coins_select" ON public.song_coins;
CREATE POLICY "song_coins_select"
ON public.song_coins
FOR SELECT
USING (true);

CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_song_coins_updated_at ON public.song_coins;
CREATE TRIGGER set_song_coins_updated_at
BEFORE UPDATE ON public.song_coins
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();
