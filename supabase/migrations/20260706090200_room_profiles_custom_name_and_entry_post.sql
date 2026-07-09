-- Bug: join_room's INSERT sets room_name = _room_id ('global') as a NOT NULL
-- placeholder. Room.tsx independently SELECTs room_profiles.room_name in a
-- separate effect to decide whether to show the "choose your Room name"
-- prompt -- if join_room's insert lands first (a real, observed race), that
-- select sees the truthy placeholder 'global' and silently skips the prompt,
-- leaving the user named "global" in chat. Fix: track whether the name was
-- ever explicitly chosen, independent of the NOT NULL placeholder value.
--
-- Also adds: "user just entered the room" feed posting, only on a genuinely
-- fresh entry (never joined, or stale/inactive for 15+ minutes) so repeated
-- remounts/heartbeats don't spam the feed.
alter table public.room_profiles add column if not exists has_custom_name boolean not null default false;

create or replace function public.join_room(_room_id text)
returns void
language plpgsql
security definer
as $$
declare
  _existing_active boolean;
  _existing_last_seen timestamptz;
  _should_post boolean := false;
begin
  select is_active, last_seen_at into _existing_active, _existing_last_seen
  from public.room_profiles
  where room_id = _room_id and user_id = auth.uid();

  insert into public.room_profiles (
    room_id,
    room_name,
    has_custom_name,
    user_id,
    joined_at,
    last_seen_at,
    is_active
  )
  values (
    _room_id,
    _room_id,
    false,
    auth.uid(),
    now(),
    now(),
    true
  )
  on conflict (room_id, user_id)
  do update set
    last_seen_at = now(),
    is_active = true;

  if _existing_active is null or _existing_active = false or _existing_last_seen < now() - interval '15 minutes' then
    _should_post := true;
  end if;

  if _should_post then
    insert into public.social_posts (user_id, post_type, activity_type, target_type, metadata, visibility)
    values (auth.uid(), 'activity', 'room_entered', 'room', jsonb_build_object('room_id', _room_id), 'public');
  end if;
end;
$$;
