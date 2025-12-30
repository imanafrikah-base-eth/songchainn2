ALTER TABLE public.artist_accounts
  ADD COLUMN IF NOT EXISTS profile_theme text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "artist_accounts_insert" ON public.artist_accounts;
CREATE POLICY "artist_accounts_insert"
ON public.artist_accounts
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    (auth.jwt() -> 'user_metadata' ->> 'artist_id') = artist_id
    OR (auth.jwt() ->> 'email') ILIKE ('artist+' || artist_id || '@%')
  )
);

DROP POLICY IF EXISTS "artist_accounts_update" ON public.artist_accounts;
CREATE POLICY "artist_accounts_update"
ON public.artist_accounts
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND (
    (auth.jwt() -> 'user_metadata' ->> 'artist_id') = artist_id
    OR (auth.jwt() ->> 'email') ILIKE ('artist+' || artist_id || '@%')
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND (
    (auth.jwt() -> 'user_metadata' ->> 'artist_id') = artist_id
    OR (auth.jwt() ->> 'email') ILIKE ('artist+' || artist_id || '@%')
  )
);

