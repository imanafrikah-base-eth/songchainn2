-- become_artist: a person who makes music opens their own Studio themselves.
-- Applied to the live project 9 Sep 2026 (MCP apply_migration: become_artist_self_serve).
--
-- Until 9 Sep 2026 every artist account was written by an admin from
-- Admin > Claims, and a new musician's only door was a "New here?" request
-- that sat waiting for review. That is the right gate for claiming an
-- EXISTING artist's page (impersonation is the risk there, and
-- approve_artist_claim keeps that job). It is the wrong gate for a page of
-- your own: nobody can impersonate a page that did not exist a second ago.
--
-- So: any signed-in account can call this once and get artist_accounts row
-- 'u-<uid>', unverified. The Studio, launcher, world builder and visual
-- uploads open on the next role refresh. Listeners who never ask never see
-- any of it; the audience still never holds an artist's tools.
create or replace function public.become_artist()
returns public.artist_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id text;
  v_account public.artist_accounts;
begin
  if v_uid is null then
    raise exception 'sign in first';
  end if;

  -- Already an artist (granted, claimed, or from an earlier tap): hand back
  -- what they have. Never a second page.
  select * into v_account from public.artist_accounts where user_id = v_uid limit 1;
  if v_account.artist_id is not null then
    return v_account;
  end if;

  v_id := 'u-' || v_uid::text;
  insert into public.artist_accounts (artist_id, user_id, is_verified, claimed_at)
  values (v_id, v_uid, false, now())
  on conflict (artist_id) do update
    set user_id = excluded.user_id, updated_at = now()
  returning * into v_account;

  -- A "New here?" request filed before this existed is answered by it.
  update public.artist_claims
     set status = 'approved', reviewed_at = now()
   where user_id = v_uid and artist_id = v_id and status = 'pending';

  begin
    perform public.write_notification(
      v_uid, null, 'artist_claim',
      'Your Studio is open',
      'Send a record and it goes live the same minute. Your world, your drops and the launcher are open too.',
      null, jsonb_build_object('status', 'approved', 'artist_id', v_id));
  exception when others then
    -- The row is what matters; a missed notification must not undo it.
    null;
  end;

  return v_account;
end
$$;

revoke all on function public.become_artist() from public;
revoke all on function public.become_artist() from anon;
grant execute on function public.become_artist() to authenticated;
