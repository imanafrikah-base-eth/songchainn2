CREATE TABLE IF NOT EXISTS public.artist_accounts (
  artist_id text PRIMARY KEY,
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.artist_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_accounts_select" ON public.artist_accounts;
CREATE POLICY "artist_accounts_select"
ON public.artist_accounts
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "artist_accounts_insert" ON public.artist_accounts;
CREATE POLICY "artist_accounts_insert"
ON public.artist_accounts
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (auth.jwt() -> 'user_metadata' ->> 'artist_id') = artist_id
);

DROP POLICY IF EXISTS "artist_accounts_update" ON public.artist_accounts;
CREATE POLICY "artist_accounts_update"
ON public.artist_accounts
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND (auth.jwt() -> 'user_metadata' ->> 'artist_id') = artist_id
)
WITH CHECK (
  user_id = auth.uid()
  AND (auth.jwt() -> 'user_metadata' ->> 'artist_id') = artist_id
);

DROP POLICY IF EXISTS "artist_accounts_delete" ON public.artist_accounts;
CREATE POLICY "artist_accounts_delete"
ON public.artist_accounts
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND (auth.jwt() -> 'user_metadata' ->> 'artist_id') = artist_id
);

CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_artist_accounts_updated_at ON public.artist_accounts;
CREATE TRIGGER set_artist_accounts_updated_at
BEFORE UPDATE ON public.artist_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();
