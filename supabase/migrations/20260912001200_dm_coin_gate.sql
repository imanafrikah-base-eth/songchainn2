-- Fans must hold a musician's artist coin to message them.
--
-- The founder's rule, literally: people can text each other, but a fan reaches
-- a musician only while holding that musician's artist coin. Holdings are read
-- off Base by the artist-dm-gate edge function (verified wallets only) and
-- written here with a timestamp; the DM RPCs trust a check for 15 minutes.
--
-- Exempt: messaging a non-artist, an artist or admin messaging anyone, and a fan
-- in a thread where the artist has already written to them (a reply unlocks it).
-- An artist with no coin cannot be messaged by fans at all.

create table if not exists public.dm_coin_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  artist_user_id uuid not null references auth.users(id) on delete cascade,
  coin_address text,
  wallet text,
  balance numeric not null default 0,
  checked_at timestamptz not null default now(),
  primary key (user_id, artist_user_id)
);

alter table public.dm_coin_access enable row level security;

revoke all on table public.dm_coin_access from anon, authenticated;
grant select on table public.dm_coin_access to authenticated;

drop policy if exists "dm_coin_access_select_own" on public.dm_coin_access;
create policy "dm_coin_access_select_own" on public.dm_coin_access
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.can_dm_artist(_me uuid, _other uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    _me is not null and _other is not null and (
      not public.is_artist(_other)
      or public.is_artist(_me)
      or public.is_admin(_me)
      or exists (
        select 1
        from public.dm_messages m
        join public.dm_participants p
          on p.conversation_id = m.conversation_id and p.user_id = _me
        where m.sender_user_id = _other
      )
      or exists (
        select 1 from public.dm_coin_access a
        where a.user_id = _me
          and a.artist_user_id = _other
          and a.balance > 0
          and a.checked_at > now() - interval '15 minutes'
      )
    );
$function$;

revoke all on function public.can_dm_artist(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_dm_artist(uuid, uuid) to service_role;

create or replace function public.open_conversation(_other_user_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _me uuid := auth.uid();
  _id uuid;
begin
  if _me is null then raise exception 'Not signed in'; end if;
  if _other_user_id is null or _other_user_id = _me then
    raise exception 'Pick somebody else to message';
  end if;

  -- A block stops the conversation from opening at all, in either direction, so
  -- a blocked person never even sees a thread to type into.
  if exists (
    select 1 from public.user_blocks
    where (blocker_id = _other_user_id and blocked_id = _me)
       or (blocker_id = _me and blocked_id = _other_user_id)
  ) then
    raise exception 'You cannot message this person';
  end if;

  -- A musician is reached through their coin. The prefix is machine readable
  -- so the client can re-check holdings and explain, without showing it.
  if not public.can_dm_artist(_me, _other_user_id) then
    raise exception 'COIN_REQUIRED: Hold this artist''s coin to message them';
  end if;

  select c.id into _id
  from public.dm_conversations c
  join public.dm_participants a on a.conversation_id = c.id and a.user_id = _me
  join public.dm_participants b on b.conversation_id = c.id and b.user_id = _other_user_id
  where (select count(*) from public.dm_participants p where p.conversation_id = c.id) = 2
  limit 1;

  if _id is not null then return _id; end if;

  insert into public.dm_conversations default values returning id into _id;
  insert into public.dm_participants (conversation_id, user_id)
  values (_id, _me), (_id, _other_user_id);

  return _id;
end;
$function$;

create or replace function public.send_direct_message(_conversation_id uuid, _body text default null::text, _song_id text default null::text, _playlist_id uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _me uuid := auth.uid();
  _other uuid;
  _id uuid;
  _clean text := nullif(trim(coalesce(_body, '')), '');
  _preview text;
begin
  if _me is null then raise exception 'Not signed in'; end if;
  if not public.is_dm_participant(_conversation_id, _me) then
    raise exception 'That conversation is not yours';
  end if;
  if _clean is null and _song_id is null and _playlist_id is null then
    raise exception 'Nothing to send';
  end if;

  select user_id into _other from public.dm_participants
  where conversation_id = _conversation_id and user_id <> _me limit 1;

  if _other is not null and exists (
    select 1 from public.user_blocks
    where (blocker_id = _other and blocked_id = _me)
       or (blocker_id = _me and blocked_id = _other)
  ) then
    raise exception 'You cannot message this person';
  end if;

  -- Gated on every send, not only on open, so the rule keeps holding after a
  -- fan sells. The holdings check is fresh for 15 minutes.
  if _other is not null and not public.can_dm_artist(_me, _other) then
    raise exception 'COIN_REQUIRED: Hold this artist''s coin to message them';
  end if;

  insert into public.dm_messages (conversation_id, sender_user_id, body, song_id, playlist_id)
  values (_conversation_id, _me, left(_clean, 2000), _song_id, _playlist_id)
  returning id into _id;

  _preview := coalesce(
    _clean,
    case when _song_id is not null then 'Sent a song' else 'Sent a playlist' end
  );

  update public.dm_conversations
  set last_message_at = now(),
      last_message_preview = left(_preview, 140),
      last_sender_id = _me
  where id = _conversation_id;

  -- The other person hears about it. Their own thread stays unarchived so a
  -- reply to an archived conversation brings it back rather than vanishing.
  update public.dm_participants
  set is_archived = false
  where conversation_id = _conversation_id and user_id = _other;

  if _other is not null then
    insert into public.notifications (user_id, type, from_user_id, message, title, metadata)
    values (
      _other, 'mention', _me, left(_preview, 140), 'New message',
      jsonb_build_object('cta_path', '/inbox?c=' || _conversation_id::text)
    );
  end if;

  return _id;
end;
$function$;
