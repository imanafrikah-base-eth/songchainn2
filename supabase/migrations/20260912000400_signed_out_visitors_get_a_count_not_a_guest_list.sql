-- Applied to the live project 12 Sep 2026 via MCP.
--
-- Signed out visitors may see how many people are in a room. They may not see
-- who, and they do not get into the room.
--
-- WHERE THE LEAK ACTUALLY WAS. The advisor points at ten SECURITY DEFINER
-- views, and the two returning per-person rows look like the problem. They are
-- not. battle_rooms and room_profiles are TABLES with `using (true)` select
-- policies and an anon grant, so an anonymous visitor could read every row of
-- them directly, no view required: user_id, display_name, avatar, role, mute
-- state, for everyone in any room. Worse, /wavewarz-africa/room/:roomId is a
-- public route, and LiveRoom prints those names on screen to whoever opens it.
-- Tightening the views alone would have read like a fix and changed nothing.
--
-- So the tables are closed to anon, and the per-person views with them.
--
-- WHAT STAYS OPEN, AND WHY IT STILL WORKS. The count views are SECURITY DEFINER,
-- which means they run as their owner and are not blocked by the policies below.
-- That is exactly what makes "a count, but not a guest list" expressible at all:
--   room_live_counts, battle_live_counts, battle_listener_counts  KEEP anon.
-- battle_listener_counts especially: the whole public battle tree reads it
-- through useBattles, and revoking it would empty every listener figure on the
-- site for signed out visitors.
--
-- The matching app change is RequireSignIn on the entry, room and host control
-- routes, so nobody is walked into a room that would then show them nothing.

/* ---------------------------------------------------- battle_rooms (table) */
-- Three separate select policies had accumulated, all `using (true)` and all
-- reaching anon. Dropped rather than edited, so nothing is left behind that
-- quietly re-opens it.
drop policy if exists "Anyone can view room participants" on public.battle_rooms;
drop policy if exists "battle rooms read all authenticated" on public.battle_rooms;
drop policy if exists br_select on public.battle_rooms;

create policy battle_rooms_read_signed_in
  on public.battle_rooms
  for select
  to authenticated
  using (true);

revoke select on public.battle_rooms from anon;

/* --------------------------------------------------- room_profiles (table) */
drop policy if exists "Room profiles readable" on public.room_profiles;
drop policy if exists room_profiles_read_all on public.room_profiles;

create policy room_profiles_read_signed_in
  on public.room_profiles
  for select
  to authenticated
  using (true);

revoke select on public.room_profiles from anon;

/* ------------------------------------------- the per person views, closed */
revoke select on public.battle_live_users from anon;
revoke select on public.room_live_users from anon;

/* ------------------------------------------------- the counts, left alone */
-- Stated explicitly so a future sweep does not "tidy" these away: they carry no
-- person, and they are the whole of what a signed out visitor is meant to see.
grant select on public.room_live_counts to anon;
grant select on public.battle_live_counts to anon;
grant select on public.battle_listener_counts to anon;
