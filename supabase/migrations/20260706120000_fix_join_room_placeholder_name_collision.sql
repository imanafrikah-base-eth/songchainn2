-- room_profiles_room_name_unique_idx enforces a GLOBAL unique room_name
-- (case-insensitive) -- intentional, so two chatters can't collide on the
-- same display name. But join_room's placeholder insert (previous
-- migration) used the literal room_id string ('global') as room_name for
-- EVERY user -- so only the very first-ever join could succeed; every
-- other user's join_room call has been silently failing the unique
-- constraint ever since (supabase-js .rpc() doesn't throw on a returned
-- error, and the caller never checked it, so this had zero visible
-- symptoms besides room presence/entry posts quietly never being created
-- for anyone but that first user). Confirmed live via get_logs: repeated
-- "duplicate key value violates unique constraint
-- room_profiles_room_name_unique_idx" on every join_room call after the
-- first. Fix: give each user a placeholder name that can't collide,
-- instead of a shared constant. has_custom_name stays false so the client
-- still knows to prompt for a real name.
create or replace function public.join_room(_room_id text)
returns void
language plpgsql
security definer
as $$
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
    _placeholder_name,
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
