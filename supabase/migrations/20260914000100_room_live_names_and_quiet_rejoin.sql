-- The Room counts only who is really in it (founder, 14 Sep 2026).
--
-- 1. room_live_users gains room_name. The Room page reads names from this
--    view, which never had the column, so everybody in the roster showed as
--    "Guest". Added at the end, so every existing column keeps its place and
--    the grants stay as they are.
-- 2. The app now leaves the room when the tab is closed or reloaded (a
--    keepalive leave_room from RoomPresenceKeeper), so a reload is a leave and
--    a join a second apart. join_room posted "entered the room" to the feed
--    whenever the row was inactive, which would have posted on every reload.
--    It now posts only when the person has not been seen for 15 minutes.

create or replace view public.room_live_users as
 select room_id,
    user_id,
    display_name,
    avatar_url,
    joined_at,
    last_seen_at,
    is_active,
    room_name
   from public.room_profiles
  where is_active = true and last_seen_at > (now() - '00:01:30'::interval);

create or replace function public.join_room(_room_id text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _existing_last_seen timestamptz;
  _should_post boolean := false;
  _placeholder_name text;
begin
  select last_seen_at into _existing_last_seen
  from public.room_profiles
  where room_id = _room_id and user_id = auth.uid();

  _placeholder_name := 'guest_' || substr(replace(auth.uid()::text, '-', ''), 1, 12);

  begin
    insert into public.room_profiles (
      room_id, room_name, has_custom_name, user_id, joined_at, last_seen_at, is_active
    )
    values (
      _room_id, _placeholder_name, false, auth.uid(), now(), now(), true
    )
    on conflict (user_id)
    do update set
      room_id = excluded.room_id,
      last_seen_at = now(),
      is_active = true;
  exception
    when unique_violation then
      update public.room_profiles
         set room_id = _room_id, last_seen_at = now(), is_active = true
       where user_id = auth.uid();
  end;

  if _existing_last_seen is null or _existing_last_seen < now() - interval '15 minutes' then
    _should_post := true;
  end if;

  if _should_post then
    insert into public.social_posts (user_id, post_type, activity_type, target_type, content, metadata, visibility)
    values (auth.uid(), 'activity', 'room_entered', 'room', 'entered the room', jsonb_build_object('room_id', _room_id), 'public');
  end if;
end;
$function$;
