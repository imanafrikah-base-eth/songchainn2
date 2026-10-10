-- Two guards from the 10 Oct 2026 security pass.
--
-- 1. room_roll_notification(_user_id, _kind, _from) was executable by anyone,
--    signed out included, and trusted _from. Anybody could put "3 mentions in
--    The Room" in any person's bell, credited to any other person. The Room
--    calls it for @mentions (src/pages/Room.tsx) and the reaction trigger
--    calls it with the reactor, who row level security already pins to
--    auth.uid(). So: guests cannot call it, and a signed-in caller can only
--    send as themselves. Nothing else about it changes.
--
-- 2. mosha_career goals are typed by the artist and go into Mo$ha's prompt
--    and the Monday note. The app clips them to 120 characters; the table
--    now refuses anything over 200 too. No current row is longer.

create or replace function public.room_roll_notification(_user_id uuid, _kind text, _from uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.notifications%rowtype;
  v_mentions integer := 0;
  v_reactions integer := 0;
  v_line text;
begin
  -- A signed-in caller speaks only for themselves.
  if auth.uid() is not null and _from is distinct from auth.uid() then
    raise exception 'You can only send your own mentions';
  end if;
  if _user_id is null or _user_id = coalesce(_from, '00000000-0000-0000-0000-000000000000'::uuid) then
    return;
  end if;
  if _kind not in ('mention', 'reaction') then
    return;
  end if;

  select * into v_row
    from public.notifications
   where user_id = _user_id
     and type = 'room_activity'
     and is_read = false
   order by created_at desc
   limit 1;

  if found then
    v_mentions := coalesce((v_row.metadata ->> 'mentions')::integer, 0);
    v_reactions := coalesce((v_row.metadata ->> 'reactions')::integer, 0);
  end if;

  if _kind = 'mention' then
    v_mentions := v_mentions + 1;
  else
    v_reactions := v_reactions + 1;
  end if;

  -- Said the way a person would say it.
  v_line := trim(both ' ' from concat_ws(' and ',
    case when v_mentions > 0 then v_mentions || case when v_mentions = 1 then ' mention' else ' mentions' end end,
    case when v_reactions > 0 then v_reactions || case when v_reactions = 1 then ' reaction' else ' reactions' end end
  ));

  if found then
    update public.notifications
       set message = v_line || ' in The Room',
           body = v_line || ' in The Room',
           metadata = coalesce(v_row.metadata, '{}'::jsonb) || jsonb_build_object('mentions', v_mentions, 'reactions', v_reactions),
           created_at = now(),
           from_user_id = coalesce(_from, v_row.from_user_id)
     where id = v_row.id;
  else
    insert into public.notifications (user_id, type, title, message, body, metadata, is_read, from_user_id)
    values (
      _user_id,
      'room_activity',
      'The Room',
      v_line || ' in The Room',
      v_line || ' in The Room',
      jsonb_build_object('mentions', v_mentions, 'reactions', v_reactions, 'link', '/room'),
      false,
      _from
    );
  end if;
end;
$function$;

revoke execute on function public.room_roll_notification(uuid, text, uuid) from public, anon;
grant execute on function public.room_roll_notification(uuid, text, uuid) to authenticated;

create or replace function public.mosha_career_goals_ok(_goals text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(bool_and(length(g) <= 200), true) from unnest(_goals) g;
$$;

alter table public.mosha_career
  add constraint mosha_career_goal_len check (public.mosha_career_goals_ok(goals));
