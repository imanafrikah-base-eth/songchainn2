-- Photos, video, audio and files between people in direct messages, and
-- reactions on messages (founder, 14 Sep 2026).
--
-- Listeners still cannot post media to the timeline or a page; that rule is
-- untouched. In a private conversation everyone can send media.
--
-- 1. dm_messages.attachments: a jsonb array (at most 10) of
--    {id, kind: image|video|audio|file, name, mime, size, path, width?, height?, durationSec?}.
--    Only send_direct_message writes it, and it keeps only files that really sit
--    under <conversation id>/<sender id>/ in the dm-media bucket.
-- 2. A PRIVATE bucket dm-media (50 MB a file). Objects live at
--    <conversation id>/<uploader id>/<id>.<ext>. Only the people in that
--    conversation can read them; only the uploader can write or delete their own.
-- 3. send_direct_message takes _attachments, and a message that is only files
--    previews as Photo, Video, Audio, File, or "3 photos".
-- 4. dm_message_reactions: one row per person per emoji per message, readable
--    by the people in the conversation, added and taken back by the reactor.

alter table public.dm_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.dm_messages drop constraint if exists dm_messages_attachments_check;
alter table public.dm_messages
  add constraint dm_messages_attachments_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dm-media', 'dm-media', false, 52428800, null)
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = null;

-- The conversation an object belongs to, from the first folder of its path.
create or replace function public.dm_media_conversation(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
  end
$$;

drop policy if exists dm_media_participants_read on storage.objects;
create policy dm_media_participants_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dm-media'
    and public.is_dm_participant(public.dm_media_conversation(name), (select auth.uid()))
  );

drop policy if exists dm_media_own_insert on storage.objects;
create policy dm_media_own_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dm-media'
    and split_part(name, '/', 2) = (select auth.uid())::text
    and public.is_dm_participant(public.dm_media_conversation(name), (select auth.uid()))
  );

drop policy if exists dm_media_own_delete on storage.objects;
create policy dm_media_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'dm-media' and split_part(name, '/', 2) = (select auth.uid())::text);

-- send_direct_message, now with files.
drop function if exists public.send_direct_message(uuid, text, text, uuid);

create or replace function public.send_direct_message(
  _conversation_id uuid,
  _body text default null,
  _song_id text default null,
  _playlist_id uuid default null,
  _attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  _me uuid := auth.uid();
  _other uuid;
  _id uuid;
  _clean text := nullif(trim(coalesce(_body, '')), '');
  _files jsonb := '[]'::jsonb;
  _n integer := 0;
  _kinds integer := 0;
  _kind text;
  _media text;
  _preview text;
begin
  if _me is null then raise exception 'Not signed in'; end if;
  if not public.is_dm_participant(_conversation_id, _me) then
    raise exception 'That conversation is not yours';
  end if;

  -- Only files this person uploaded into this conversation, and that are really there.
  if _attachments is not null and jsonb_typeof(_attachments) = 'array' then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'id', left(coalesce(e.a->>'id', gen_random_uuid()::text), 64),
             'kind', e.a->>'kind',
             'name', left(coalesce(nullif(e.a->>'name', ''), 'file'), 200),
             'mime', left(coalesce(nullif(e.a->>'mime', ''), 'application/octet-stream'), 100),
             'size', case when (e.a->>'size') ~ '^[0-9]{1,12}$' then (e.a->>'size')::bigint else 0 end,
             'path', e.a->>'path',
             'width', case when (e.a->>'width') ~ '^[0-9]{1,5}$' then (e.a->>'width')::integer end,
             'height', case when (e.a->>'height') ~ '^[0-9]{1,5}$' then (e.a->>'height')::integer end,
             'durationSec', case when (e.a->>'durationSec') ~ '^[0-9]{1,6}(\.[0-9]+)?$'
                                 then round((e.a->>'durationSec')::numeric, 1) end
           )) order by e.i), '[]'::jsonb)
      into _files
      from (
        select a, i from jsonb_array_elements(_attachments) with ordinality as x(a, i)
        order by i
        limit 10
      ) e
     where jsonb_typeof(e.a) = 'object'
       and e.a->>'kind' in ('image', 'video', 'audio', 'file')
       and coalesce(e.a->>'path', '') like (_conversation_id::text || '/' || _me::text || '/%')
       and position('..' in (e.a->>'path')) = 0
       and exists (
         select 1 from storage.objects o
          where o.bucket_id = 'dm-media' and o.name = e.a->>'path'
       );
  end if;
  _n := jsonb_array_length(_files);

  if _clean is null and _song_id is null and _playlist_id is null and _n = 0 then
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

  insert into public.dm_messages (conversation_id, sender_user_id, body, song_id, playlist_id, attachments)
  values (_conversation_id, _me, left(_clean, 2000), _song_id, _playlist_id, _files)
  returning id into _id;

  if _n > 0 then
    select count(distinct f->>'kind'), min(f->>'kind') into _kinds, _kind
      from jsonb_array_elements(_files) f;
    _media := case
      when _kinds = 1 and _n = 1 then
        case _kind when 'image' then 'Photo' when 'video' then 'Video' when 'audio' then 'Audio' else 'File' end
      when _kinds = 1 then
        _n::text || ' ' || case _kind when 'image' then 'photos' when 'video' then 'videos' when 'audio' then 'audio files' else 'files' end
      else _n::text || ' files'
    end;
  end if;

  _preview := coalesce(
    _clean,
    _media,
    case when _song_id is not null then 'Sent a song' else 'Sent a playlist' end
  );

  update public.dm_conversations
  set last_message_at = now(),
      last_message_preview = left(_preview, 140),
      last_sender_id = _me
  where id = _conversation_id;

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

grant execute on function public.send_direct_message(uuid, text, text, uuid, jsonb) to authenticated;

-- Reactions.
create table if not exists public.dm_message_reactions (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  conversation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists dm_message_reactions_conversation_idx on public.dm_message_reactions (conversation_id);
create index if not exists dm_message_reactions_user_idx on public.dm_message_reactions (user_id);

-- The conversation is copied from the message, never taken from the client.
create or replace function public.dm_reaction_fill_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select m.conversation_id into new.conversation_id
    from public.dm_messages m
   where m.id = new.message_id and not m.is_deleted;
  if new.conversation_id is null then
    raise exception 'That message is gone';
  end if;
  return new;
end
$$;

drop trigger if exists dm_reaction_fill_conversation on public.dm_message_reactions;
create trigger dm_reaction_fill_conversation
  before insert on public.dm_message_reactions
  for each row execute function public.dm_reaction_fill_conversation();

-- Somebody may react when they are in the conversation and neither side has blocked the other.
create or replace function public.dm_can_react(_conversation_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_dm_participant(_conversation_id, _user_id)
    and not exists (
      select 1
        from public.dm_participants o
        join public.user_blocks b
          on (b.blocker_id = o.user_id and b.blocked_id = _user_id)
          or (b.blocker_id = _user_id and b.blocked_id = o.user_id)
       where o.conversation_id = _conversation_id and o.user_id <> _user_id
    )
$$;

revoke all on function public.dm_can_react(uuid, uuid) from public, anon;
grant execute on function public.dm_can_react(uuid, uuid) to authenticated;

alter table public.dm_message_reactions enable row level security;
alter table public.dm_message_reactions replica identity full;

drop policy if exists dm_reactions_participants_read on public.dm_message_reactions;
create policy dm_reactions_participants_read on public.dm_message_reactions
  for select to authenticated
  using (public.is_dm_participant(conversation_id, (select auth.uid())));

drop policy if exists dm_reactions_own_insert on public.dm_message_reactions;
create policy dm_reactions_own_insert on public.dm_message_reactions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.dm_can_react(conversation_id, (select auth.uid())));

drop policy if exists dm_reactions_own_delete on public.dm_message_reactions;
create policy dm_reactions_own_delete on public.dm_message_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.dm_message_reactions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dm_message_reactions'
  ) then
    execute 'alter publication supabase_realtime add table public.dm_message_reactions';
  end if;
end
$$;
