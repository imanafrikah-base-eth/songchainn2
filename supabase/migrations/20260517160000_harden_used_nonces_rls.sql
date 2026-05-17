-- Defense-in-depth lockdown for the SIWE nonce table.
--
-- Background: only edge functions running with the service-role key should
-- ever read or write used_nonces. A FOR ALL ... USING(false) policy exists
-- (migration 20251222064131) and service-role bypasses RLS so edge functions
-- continue to work. This migration tightens that further:
--   1. Force RLS so even the table owner respects policies.
--   2. Replace the omnibus FOR ALL policy with explicit SELECT / INSERT /
--      UPDATE / DELETE policies, each setting both USING and WITH CHECK to
--      false so the intent is unambiguous in pg_policies.
--   3. Revoke any inherited PostgREST grants from anon / authenticated.

ALTER TABLE public.used_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.used_nonces FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow nonce operations" ON public.used_nonces;
DROP POLICY IF EXISTS "Deny all user access to nonces" ON public.used_nonces;

CREATE POLICY "used_nonces_deny_select"
  ON public.used_nonces FOR SELECT
  USING (false);

CREATE POLICY "used_nonces_deny_insert"
  ON public.used_nonces FOR INSERT
  WITH CHECK (false);

CREATE POLICY "used_nonces_deny_update"
  ON public.used_nonces FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "used_nonces_deny_delete"
  ON public.used_nonces FOR DELETE
  USING (false);

REVOKE ALL ON public.used_nonces FROM anon, authenticated;
