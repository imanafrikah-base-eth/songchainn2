-- A tag in the battle chat reaches anybody it names, not only people who
-- happen to be in the room at that moment. The artists in the battle, the
-- people a host most wants to tag, were never reachable (N3M3SIS, 21 Sep
-- 2026: "@faith" while FAITH was not in the room, nothing sent). The sender
-- must still be in the room, and at most five people are told per message.
create or replace function public.notify_battle_mentions(p_battle_id uuid, p_user_ids uuid[], p_message text)
returns integer
language plpgsql
security definer
set search_path = public
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
    select distinct p.user_id
      from public.audience_profiles p
     where p.user_id = any (coalesce(p_user_ids, '{}'::uuid[]))
       and p.user_id <> me
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
