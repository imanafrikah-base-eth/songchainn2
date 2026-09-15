-- An artist can stop a release (founder, 15 Sep 2026).
--
-- N3M3SIS scheduled "Mind of a menace." for 08:10, asked Mo$ha at 06:15 to push
-- it to 11pm, and nothing in the app could: it went out on time and thirty
-- followers were told. Songs had no way back from 'published'.
--
-- 'held' is that way back. A held record is hidden everywhere public
-- (songs_sync_published makes is_published false, and every public read and
-- catalogue function asks for 'published'), stays in the artist's Studio with
-- its audio, artwork, details and release grouping, and goes out again when the
-- artist says, now or at a time they pick.
--
-- Status changes are locked to the audition (songs_guard_pipeline), so both
-- moves are security-definer functions that check the caller owns the record.
-- A record somebody has bought, or whose coin has been minted, is not held:
-- people own a piece of it and it stays where they can find it.

alter table public.songs drop constraint if exists songs_status_check;
alter table public.songs add constraint songs_status_check
  check (status = any (array['uploading', 'auditioning', 'published', 'workshop', 'held']));

-- The pipeline guard refuses any status change a person makes by hand. These two
-- functions are the only other door, and they mark the transaction so the
-- guard lets their own update through. set_config is not reachable through the
-- API, so nobody can set the mark from the app.
create or replace function public.songs_guard_pipeline()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if coalesce(current_setting('songchainn.release_action', true), '') = 'on'
     and old.owner_id is not distinct from new.owner_id
     and old.audition is not distinct from new.audition then
    return new;
  end if;
  if exists (
    select 1 from public.user_roles ur
     where ur.user_id = auth.uid() and ur.role = 'admin'::app_role
  ) then
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'status is set by the audition, not by hand';
  end if;
  if new.audition is distinct from old.audition then
    raise exception 'audition results are written by $HIKULU and NAKULU only';
  end if;
  if new.owner_id is distinct from old.owner_id then
    raise exception 'ownership cannot be reassigned';
  end if;
  return new;
end $$;

create or replace function public.stop_release(p_song_ids text[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_ids text[];
  v_blocked text;
  v_count integer;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;

  select array_agg(s.id) into v_ids
    from public.songs s
   where s.id = any (coalesce(p_song_ids, '{}'::text[]))
     and s.status = 'published'
     and (s.owner_id = me or exists (
       select 1 from public.artist_accounts a where a.user_id = me and a.artist_id = s.artist_id
     ));

  if v_ids is null then
    raise exception 'None of those are live or scheduled records of yours.';
  end if;

  select s.title into v_blocked
    from public.songs s
   where s.id = any (v_ids)
     and (exists (select 1 from public.song_purchases p where p.song_id = s.id)
          or exists (select 1 from public.song_coins c where c.song_id = s.id and c.mint_status = 'minted'))
   limit 1;
  if v_blocked is not null then
    raise exception '"%" has been bought or has a live coin, so people own a piece of it and it cannot be taken down from here.', v_blocked;
  end if;

  perform set_config('songchainn.release_action', 'on', true);
  update public.songs set status = 'held' where id = any (v_ids);
  get diagnostics v_count = row_count;
  perform set_config('songchainn.release_action', '', true);

  -- Nobody should be sent to a record that is not out.
  delete from public.notifications
   where type = 'new_release' and metadata->>'song_id' = any (v_ids);
  update public.social_posts
     set is_deleted = true
   where song_id = any (v_ids)
     and post_type = 'song_share'
     and user_id = public._mosha_user_id();

  return v_count;
end;
$$;

-- Put held records back out. p_release_at null or in the past means now; a time
-- ahead schedules them, and announce_scheduled_releases tells followers then.
create or replace function public.release_held(p_song_ids text[], p_release_at timestamptz default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_at timestamptz := case when p_release_at is null or p_release_at <= now() then null else p_release_at end;
  v_count integer;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;

  perform set_config('songchainn.release_action', 'on', true);
  update public.songs s
     set status = 'published',
         release_at = v_at,
         release_date = case when v_at is null then current_date else (v_at at time zone 'utc')::date end
   where s.id = any (coalesce(p_song_ids, '{}'::text[]))
     and s.status = 'held'
     and (s.owner_id = me or exists (
       select 1 from public.artist_accounts a where a.user_id = me and a.artist_id = s.artist_id
     ));
  get diagnostics v_count = row_count;
  perform set_config('songchainn.release_action', '', true);

  if v_count = 0 then
    raise exception 'None of those are held records of yours.';
  end if;
  return v_count;
end;
$$;

revoke all on function public.stop_release(text[]) from public, anon;
revoke all on function public.release_held(text[], timestamptz) from public, anon;
grant execute on function public.stop_release(text[]) to authenticated;
grant execute on function public.release_held(text[], timestamptz) to authenticated;
