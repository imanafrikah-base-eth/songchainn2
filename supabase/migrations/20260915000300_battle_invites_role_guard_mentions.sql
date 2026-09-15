-- Battle rooms: the host invites people up to speak, nobody promotes themselves,
-- and an @name in the chat reaches the person named (founder, 15 Sep 2026).

-- 1. An invitation to speak. The host sets it by long-pressing a name; the
--    person accepts (becomes a speaker) or declines (clears it).
alter table public.battle_rooms
  add column if not exists invited_to_speak_at timestamptz;

-- 2. Who may change a role, and who may invite.
--
-- "battle rooms update own" lets a person update their own row with no column
-- restriction, so the role column needs a guard of its own (the older one is
-- replaced in step 4). Roles change only when:
--   - the host or a co-host of that battle changes them,
--   - somebody steps themselves down to audience, or
--   - somebody accepts an invitation the host sent in the last ten minutes.
-- Only the host or a co-host can send an invitation; anybody can clear their own.
create or replace function public.battle_rooms_guard_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  runs_room boolean;
begin
  -- The service role (judges, server jobs) is not a person in the room.
  if me is null then
    return new;
  end if;

  runs_room := exists (
    select 1 from public.battles b where b.id = new.battle_id and b.host_user_id = me
  ) or exists (
    select 1 from public.battle_rooms r
     where r.battle_id = new.battle_id and r.user_id = me and r.role in ('host', 'co-host')
  );

  if new.invited_to_speak_at is distinct from old.invited_to_speak_at
     and new.invited_to_speak_at is not null
     and not runs_room then
    raise exception 'Only the host can invite people up to speak';
  end if;

  if new.role is distinct from old.role and not runs_room then
    if me = old.user_id and new.role = 'audience' then
      null;
    elsif me = old.user_id and new.role = 'speaker'
          and old.invited_to_speak_at is not null
          and old.invited_to_speak_at > now() - interval '10 minutes' then
      new.invited_to_speak_at := null;
      new.requested_to_speak := false;
    else
      raise exception 'Only the host can change who is on stage';
    end if;
  end if;

  -- Joining the stage in any way settles an open invitation.
  if new.role in ('speaker', 'co-host', 'host') and new.role is distinct from old.role then
    new.invited_to_speak_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists battle_rooms_guard_role on public.battle_rooms;
create trigger battle_rooms_guard_role
  before update on public.battle_rooms
  for each row execute function public.battle_rooms_guard_role();

-- 3. @name in a battle chat. The sender's app works out who was named from the
--    people in the room and asks for them to be told; this only tells people
--    who are really in that room, at most five per message, never the sender.
create or replace function public.notify_battle_mentions(p_battle_id uuid, p_user_ids uuid[], p_message text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_title text;
  v_count integer := 0;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from public.battle_rooms r where r.battle_id = p_battle_id and r.user_id = me) then
    raise exception 'You are not in this battle room';
  end if;

  select title into v_title from public.battles where id = p_battle_id;

  with targets as (
    select distinct r.user_id
      from public.battle_rooms r
     where r.battle_id = p_battle_id
       and r.user_id = any (coalesce(p_user_ids, '{}'::uuid[]))
       and r.user_id <> me
     limit 5
  ),
  sent as (
    insert into public.notifications (user_id, type, from_user_id, message, title, metadata)
    select t.user_id, 'mention', me, left(coalesce(nullif(trim(p_message), ''), 'Tagged you'), 140),
           'Tagged you in ' || coalesce(nullif(trim(v_title), ''), 'a battle'),
           jsonb_build_object('cta_path', '/wavewarz-africa/room/' || p_battle_id::text, 'battle_id', p_battle_id)
      from targets t
    returning 1
  )
  select count(*) into v_count from sent;
  return v_count;
end;
$$;

revoke all on function public.notify_battle_mentions(uuid, uuid[], text) from public, anon;
grant execute on function public.notify_battle_mentions(uuid, uuid[], text) to authenticated;

-- 4. The older guard (enforce_battle_room_role_change, applied live but never in
--    this repo) already stopped self-promotion, but it also refused a speaker
--    stepping back down and would refuse accepting an invitation. The guard
--    above covers everything it did (host, co-host, service role) plus those
--    two, so it replaces it.
drop trigger if exists trg_battle_rooms_enforce_role_change on public.battle_rooms;
