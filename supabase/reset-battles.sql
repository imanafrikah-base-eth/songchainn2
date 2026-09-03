-- Empty BattleZone back to zero, ready for the first battle to be hosted.
--
-- Run this in the Supabase SQL editor for project wsjhbfmzbonxmxaaassu, or with
-- the CLI once it is linked to that project. It is destructive and there is no
-- undo, so take a snapshot of `battles` first if any past battle is worth keeping.
--
-- Children are deleted before parents so foreign keys never block the delete.
-- The count views (battle_vote_counts, battle_live_counts, battle_listener_counts)
-- derive from these tables and empty themselves.

begin;

-- Take a copy before anything is destroyed. Drop this table once you are happy.
create table if not exists battles_archive_20260901 as
  select * from battles;

delete from battle_room_messages;
delete from battle_speaker_requests;
delete from battle_votes;
delete from battle_live_users;
delete from battle_rooms;
delete from battles;

commit;

-- Confirm zero across the board.
select 'battles'                as table_name, count(*) from battles
union all select 'battle_votes',            count(*) from battle_votes
union all select 'battle_rooms',            count(*) from battle_rooms
union all select 'battle_room_messages',    count(*) from battle_room_messages
union all select 'battle_speaker_requests', count(*) from battle_speaker_requests
union all select 'battle_live_users',       count(*) from battle_live_users;
