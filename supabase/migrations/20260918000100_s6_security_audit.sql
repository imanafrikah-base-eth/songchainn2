-- S6 Security seat, 18 September 2026. Three holes proved live against production.
-- The migration history has drifted from the live database, so apply this by hand
-- (Supabase MCP or the SQL editor) and treat this file as the record of what ran.

-- 1. claim_legacy_points: the amount came from the caller's own browser. Closed.
--    Anyone signed in could call it once with _amount = 50000 and walk in as
--    Platinum with the OG badge. Nobody had (largest balance on the day: 1,539).
CREATE OR REPLACE FUNCTION public.claim_legacy_points(_amount integer)
 RETURNS TABLE(points bigint, lifetime_points bigint, tier text, is_og boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required to claim points';
  END IF;
  -- The legacy localStorage import closed on 18 September 2026. Points come
  -- only from the server-side ledger now. This marks the account migrated and
  -- awards nothing, whatever number the caller sends.
  INSERT INTO public.user_points (user_id, points, lifetime_points, is_og, legacy_claimed, updated_at)
  VALUES (_uid, 0, 0, false, true, now())
  ON CONFLICT (user_id) DO UPDATE
    SET legacy_claimed = true,
        updated_at = now();
  RETURN QUERY
    SELECT up.points, up.lifetime_points, public.points_tier(up.lifetime_points), up.is_og
    FROM public.user_points up WHERE up.user_id = _uid;
END;
$function$;

-- 2. Cached Farcaster and Facebook profiles were writable with the bare anon
--    key (using(true) / with_check(true) for public) and shown to everyone on
--    the Community page. Nothing in the app writes them from a browser any more.
drop policy if exists farcaster_profiles_insert_anon on public.farcaster_profiles;
drop policy if exists farcaster_profiles_update_anon on public.farcaster_profiles;
drop policy if exists facebook_profiles_insert_anon on public.facebook_profiles;
drop policy if exists facebook_profiles_update_anon on public.facebook_profiles;
revoke insert, update, delete, truncate, references, trigger on public.farcaster_profiles from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.facebook_profiles from anon, authenticated;

-- 3. Covers and avatars: any signed-in listener could write any path in the
--    public covers bucket, including a real artist's cover by its public URL.
--    The avaters bucket had an owner-folder policy AND a bucket-only one, and
--    permissive policies OR together, so the owner check was decoration.
--    Now: your own folder, or an admin anywhere. Public read stays.
drop policy if exists "covers upload" on storage.objects;
drop policy if exists "covers update" on storage.objects;
drop policy if exists "avaters upload" on storage.objects;
create policy "covers upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid())));
create policy "covers update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid())))
  with check (bucket_id = 'covers' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid())));
