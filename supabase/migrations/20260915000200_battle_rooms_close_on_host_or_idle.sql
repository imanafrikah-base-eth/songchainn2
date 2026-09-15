-- A battle room closes in two ways only (founder, 15 Sep 2026):
--   1. the host closes it, or
--   2. nobody has been in it for ten minutes.
--
-- Before this, the host's phone ended the battle the moment the clock ran out,
-- and that fired again whenever the host's room screen opened after the clock,
-- so a host who pressed back by accident and came in again found the battle
-- over. A phone clock running fast ended it early too ("Let's Get it", 14 Sep,
-- 85 seconds before its clock). And end_stranded_battles ended every live
-- battle ten minutes after its clock whether the host was still there or not.
-- The clock now only closes the poll (in the app); the server ends a battle
-- for inactivity alone.

-- Presence runs on the server's clock. The heartbeat used to write the phone's
-- own time, so one wrong clock could keep a room alive or let it die.
create or replace function public.battle_rooms_seen_now()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.last_seen_at := now();
  elsif new.last_seen_at is distinct from old.last_seen_at then
    new.last_seen_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists battle_rooms_seen_now on public.battle_rooms;
create trigger battle_rooms_seen_now
  before insert or update on public.battle_rooms
  for each row execute function public.battle_rooms_seen_now();

-- Ten minutes with nobody in the room: the battle ends if it is still going,
-- and the room closes. Activity is the latest heartbeat of anyone still in the
-- room, or the battle itself changing (a round, the poll, the host's buttons).
create or replace function public.end_stranded_battles()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  with idle as (
    select b.id
      from public.battles b
     where (b.status = 'live' or (b.status = 'ended' and b.room_closed_at is null))
       and greatest(
             b.updated_at,
             b.created_at,
             coalesce((
               select max(r.last_seen_at)
                 from public.battle_rooms r
                where r.battle_id = b.id and r.is_active
             ), b.created_at)
           ) < now() - interval '10 minutes'
  ),
  done as (
    update public.battles b
       set status = 'ended',
           voting_open = false,
           ended_at = coalesce(b.ended_at, now()),
           ended_time = coalesce(b.ended_time, now()),
           room_closed_at = now()
      from idle
     where b.id = idle.id
    returning 1
  )
  select count(*) into v_count from done;
  return v_count;
end;
$$;

revoke all on function public.end_stranded_battles() from public, anon, authenticated;
