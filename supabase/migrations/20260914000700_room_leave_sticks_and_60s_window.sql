-- Leaving the Room takes you off the live count, and it stays that way (founder, 14 Sep 2026).
--
-- Ernest left the Room and "1 live" stayed on Home. heartbeat_room set
-- is_active = true on every beat, so a beat still in flight when leave_room
-- ran (the Room page kept its own heartbeat as well as RoomPresenceKeeper)
-- marked the person active again, and they counted as live until the 90 second
-- window ran out. A heartbeat now only refreshes somebody who is still in;
-- joining is what makes a person active. The live window is 60 seconds, with
-- the app beating every 20.

create or replace function public.heartbeat_room(_room_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.room_profiles
     set last_seen_at = now()
   where room_id = _room_id
     and user_id = auth.uid()
     and is_active = true;
end;
$$;

create or replace view public.room_live_counts as
  select room_id, count(*)::integer as listener_count
    from public.room_profiles
   where is_active = true and last_seen_at > (now() - interval '60 seconds')
   group by room_id;

create or replace view public.room_live_users as
  select room_id, user_id, display_name, avatar_url, joined_at, last_seen_at, is_active, room_name
    from public.room_profiles
   where is_active = true and last_seen_at > (now() - interval '60 seconds');
