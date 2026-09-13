-- Worlds are for musicians with a song out (founder, 14 Sep 2026).
--
-- "only a musician with a song out on songchainn can and should be able to
-- even begin creating a world. no audience can create a world"
--
-- has_live_song(uid) is true when the person has at least one record that is
-- actually out: status 'published', is_published, and no release time still
-- in the future. The record counts when they own the row, or when it sits on
-- their artist page (artist_accounts.artist_id, which is how the founding
-- catalogue and records added for an artist are keyed).
--
-- Only NEW worlds are gated: the insert policy on worlds. Editing, reading,
-- publishing and deleting a world somebody already has are untouched, so every
-- existing world (the drafts included) keeps working. Nothing else creates a
-- world row (no RPC inserts into worlds); the service role bypasses RLS.
--
-- The function reads songs and artist_accounts as its owner, so it never
-- touches worlds and cannot recurse through the worlds policies.

create or replace function public.has_live_song(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and exists (
    select 1
    from public.songs s
    where s.status = 'published'
      and s.is_published
      and (s.release_at is null or s.release_at <= now())
      and (
        s.owner_id = uid
        or s.artist_id in (
          select aa.artist_id::text from public.artist_accounts aa
          where aa.user_id = uid and aa.artist_id is not null
        )
      )
  );
$$;

revoke all on function public.has_live_song(uuid) from public, anon;
grant execute on function public.has_live_song(uuid) to authenticated;

drop policy if exists "create own world" on public.worlds;
create policy "create own world" on public.worlds
  for insert
  with check (
    owner_id = (select auth.uid())
    and public.has_live_song((select auth.uid()))
  );
