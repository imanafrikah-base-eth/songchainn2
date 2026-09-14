-- The Room showed 0 live with people in it (founder, 14 Sep 2026).
--
-- The app's join and heartbeat were never sent at all (a lazy query builder
-- nobody awaited), which is fixed in RoomPresenceKeeper. Two things here make
-- the count hold up once they are:
--
-- 1. heartbeat_room says whether it found this person still in. When it did
--    not (their leave from another tab landed, or the row was switched off),
--    the app joins again, but only while it is really still in the Room. A
--    heartbeat still never switches anybody back on by itself, so leaving
--    sticks.
-- 2. The live window goes back to 90 seconds. A phone with the screen off
--    runs page timers about once a minute, so a 60 second window dropped
--    listeners who were still there.

drop function if exists public.heartbeat_room(text);

create function public.heartbeat_room(_room_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _found boolean;
begin
  update public.room_profiles
     set last_seen_at = now()
   where room_id = _room_id
     and user_id = auth.uid()
     and is_active = true;
  _found := found;
  return _found;
end;
$$;

revoke all on function public.heartbeat_room(text) from public, anon;
grant execute on function public.heartbeat_room(text) to authenticated, service_role;

create or replace view public.room_live_counts as
  select room_id, count(*)::integer as listener_count
    from public.room_profiles
   where is_active = true and last_seen_at > (now() - interval '90 seconds')
   group by room_id;

create or replace view public.room_live_users as
  select room_id, user_id, display_name, avatar_url, joined_at, last_seen_at, is_active, room_name
    from public.room_profiles
   where is_active = true and last_seen_at > (now() - interval '90 seconds');
