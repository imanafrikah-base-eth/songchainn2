-- social_posts_has_payload_check requires content/media_url/text_content/
-- song_id/playlist_id/artist_id to be non-empty -- the room_entered insert
-- inside join_room() only set post_type/activity_type/target_type/metadata,
-- none of which satisfy that check. Since this insert runs in the same
-- plpgsql function as the room_profiles upsert with no exception handling,
-- EVERY join_room call that reached "should post" (i.e. every first-ever
-- join) violated the check constraint and rolled back the ENTIRE
-- transaction, including the profile upsert itself. Confirmed live:
-- social_posts had zero room_entered rows, ever, for any user. Fix: give
-- the post a real content string so it satisfies the check.
create or replace function public.join_room(_room_id text)
returns void
language plpgsql
security definer
as $$
declare
  _existing_active boolean;
  _existing_last_seen timestamptz;
  _should_post boolean := false;
  _placeholder_name text;
begin
  select is_active, last_seen_at into _existing_active, _existing_last_seen
  from public.room_profiles
  where room_id = _room_id and user_id = auth.uid();

  _placeholder_name := 'guest_' || substr(replace(auth.uid()::text, '-', ''), 1, 12);

  insert into public.room_profiles (
    room_id,
    room_name,
    has_custom_name,
    user_id,
    joined_at,
    last_seen_at,
    is_active
  )
  values (
    _room_id,
    _placeholder_name,
    false,
    auth.uid(),
    now(),
    now(),
    true
  )
  on conflict (room_id, user_id)
  do update set
    last_seen_at = now(),
    is_active = true;

  if _existing_active is null or _existing_active = false or _existing_last_seen < now() - interval '15 minutes' then
    _should_post := true;
  end if;

  if _should_post then
    insert into public.social_posts (user_id, post_type, activity_type, target_type, content, metadata, visibility)
    values (auth.uid(), 'activity', 'room_entered', 'room', 'entered the room', jsonb_build_object('room_id', _room_id), 'public');
  end if;
end;
$$;
