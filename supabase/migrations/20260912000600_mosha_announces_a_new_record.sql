-- Applied to the live project 12 Sep 2026 via MCP.
--
-- Mo$ha says something when a record goes live.
--
-- A release used to reach the feed as nothing at all: followers got a
-- notification each, and anybody else had to stumble on it. Mo$ha already has
-- an account here, so he can simply say it out loud where everybody is looking.
--
-- WHY THIS BATCHES, and why that matters. Ernest asked for a post whenever a
-- song goes up. Taken literally, an artist dropping a ten track volume would
-- push ten near identical posts into one feed in the same second, which reads
-- as spam and buries every other artist that hour. So a second record by the
-- same artist inside ten minutes UPDATES Mo$ha's existing post instead of
-- adding another. One drop, one post, and it counts up as the tracks land.
--
-- Scheduled releases are left alone until their day arrives, matching
-- notify_new_release, so a record dated next week is not announced today.
--
-- SAFETY NOTE, checked before this shipped: this is an AFTER trigger on songs,
-- so if it ever throws, the publish throws with it and nobody can release
-- anything. Mo$ha is a real auth.users row and social_posts has no foreign key
-- on user_id, so the insert cannot fail on a missing reference. If this
-- function is ever edited, re-check that property first.

create or replace function public.mosha_announce_release()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mosha  uuid := '0e2f6d3a-8b1c-4f7e-9a5d-3c4b2a1f0e9d';
  v_recent uuid;
  v_count  integer;
  v_artist text;
  v_body   text;
begin
  -- Only the moment a record becomes live, and never twice for the same one.
  if new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'published' then return new; end if;

  -- Not yet out. Say nothing until the day it is.
  if new.release_date is not null and new.release_date > current_date then return new; end if;
  if new.release_at is not null and new.release_at > now() then return new; end if;

  -- A record with no artist page cannot be opened from a post, so there is
  -- nothing useful to announce yet.
  if new.artist_id is null then return new; end if;

  v_artist := coalesce(new.artist_name, 'An artist');

  -- Did Mo$ha already speak for this artist in the last ten minutes?
  select p.id into v_recent
    from public.social_posts p
   where p.user_id = v_mosha
     and p.post_type = 'song_share'
     and p.artist_id = new.artist_id
     and p.is_deleted = false
     and p.created_at > now() - interval '10 minutes'
   order by p.created_at desc
   limit 1;

  if v_recent is not null then
    v_count := coalesce((select (metadata->>'track_count')::int from public.social_posts where id = v_recent), 1) + 1;
    update public.social_posts
       set content = v_artist || ' just put ' || v_count || ' new records up. Go and hear them.',
           metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object('track_count', v_count, 'latest_song_id', new.id),
           updated_at = now()
     where id = v_recent;
    return new;
  end if;

  v_body := v_artist || ' just put ' || coalesce(new.title, 'a new record') || ' up. Go and hear it.';

  insert into public.social_posts (user_id, post_type, content, song_id, artist_id, metadata, visibility)
  values (
    v_mosha, 'song_share', v_body, new.id, new.artist_id,
    jsonb_build_object('announcement', 'new_release', 'track_count', 1, 'latest_song_id', new.id),
    'public'
  );

  return new;
end
$function$;

comment on function public.mosha_announce_release() is
  'Mo$ha posts to the feed when a record goes live. Batches within ten minutes so a whole volume is one post that counts up, not one post per track.';

-- Both INSERT and UPDATE: a record can arrive already live (an admin upload) or
-- be moved to live by the audition, and either way it deserves the same post.
drop trigger if exists mosha_announce_release_trg on public.songs;
create trigger mosha_announce_release_trg
after insert or update of status on public.songs
for each row execute function public.mosha_announce_release();
