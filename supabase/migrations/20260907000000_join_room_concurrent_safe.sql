-- join_room: entering the room twice at once must not throw.
--
-- The shell (RoomPresenceKeeper) and the Room page both call join_room on
-- mount, so a person's very first entry is two concurrent inserts of the same
-- row. The function upserted on (room_id, user_id), but the table's primary
-- key is user_id on its own. Postgres only resolves a concurrent conflict on
-- the index named in ON CONFLICT; the second insert tripped the primary key
-- instead and the request came back 409 "duplicate key value violates unique
-- constraint room_profiles_pkey". Seen on 6 Sep 2026 for a brand-new account
-- the moment it opened /room.
--
-- The arbiter is now the primary key, which is the real identity of the row:
-- one person, one room profile. A conflict on any other unique index during a
-- race is caught and turned into the same update, so the call is idempotent
-- whatever order the two arrivals land in. Behaviour is otherwise unchanged:
-- the "entered the room" post still fires once per fresh entry.

create or replace function public.join_room(_room_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      -- The other arrival won the race on a secondary unique index. Same
      -- outcome: the row exists, so bring it up to date.
      update public.room_profiles
         set room_id = _room_id, last_seen_at = now(), is_active = true
       where user_id = auth.uid();
  end;

  if _existing_active is null or _existing_active = false or _existing_last_seen < now() - interval '15 minutes' then
    _should_post := true;
  end if;

  if _should_post then
    insert into public.social_posts (user_id, post_type, activity_type, target_type, content, metadata, visibility)
    values (auth.uid(), 'activity', 'room_entered', 'room', 'entered the room', jsonb_build_object('room_id', _room_id), 'public');
  end if;
end;
$function$;
