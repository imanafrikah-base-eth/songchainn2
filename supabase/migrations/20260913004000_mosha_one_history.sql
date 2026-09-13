-- One conversation with Mo$ha per person (founder decision, 13 Sep 2026).
--
-- Until now the same person had two histories: mosha_messages (the chat
-- window, written by the mosha-chat function, read back for memory) and
-- direct_messages in a dm_threads "Mo$ha" thread (the Inbox). mosha_messages is
-- now the one store. The Inbox reads it and sends through mosha-chat like the
-- chat window does. send_mosha_message (welcome notes, Zabal Gamez counters,
-- any system notice) writes into it as source 'notice'. dm_threads stays as the
-- per person summary: a trigger on mosha_messages keeps its preview, time and
-- unread count, so nothing that reads dm_threads breaks.
--
-- direct_messages is NOT dropped and no row is deleted. Its 66 rows (all Mo$ha
-- notices, no person ever wrote a line there) are copied in with created_at
-- kept and legacy_dm_id pointing back, so the copy is idempotent. They are
-- marked read: they are weeks old or were already on screen when written.
--
-- Also fixed on the way: mark_dm_thread_read marked messages read on ANY thread
-- id without checking the caller owned it. And the insert policy on
-- mosha_messages let a person write "assistant" rows into their own history
-- (nothing in the app does that; Mo$ha's words come only from the function).
--
-- Tested first in a rolled back block: 66 backfilled, notice adds 1 unread and
-- dedupes, chat rows update the preview without unread, mark read resets, a
-- signed in person sees only their own rows and cannot spoof, fake or write
-- into another person's history.

alter table public.mosha_messages add column if not exists source text not null default 'chat';
alter table public.mosha_messages drop constraint if exists mosha_messages_source_check;
alter table public.mosha_messages add constraint mosha_messages_source_check check (source in ('chat', 'inbox', 'notice'));
alter table public.mosha_messages add column if not exists read_at timestamptz;
alter table public.mosha_messages add column if not exists legacy_dm_id uuid;
create unique index if not exists mosha_messages_legacy_dm_id_key on public.mosha_messages (legacy_dm_id) where legacy_dm_id is not null;

-- Keep the dm_threads summary in step with the one history.
create or replace function public.mosha_message_to_thread()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if new.legacy_dm_id is not null then
    return new;
  end if;
  begin
    insert into public.dm_threads as t (user_id, title, last_message_preview, last_message_at, unread_count)
    values (new.user_id, 'Mo' || chr(36) || 'ha', left(new.content, 120), new.created_at,
            case when new.role = 'assistant' and new.source = 'notice' then 1 else 0 end)
    on conflict (user_id) do update set
      last_message_preview = case when excluded.last_message_at >= coalesce(t.last_message_at, '-infinity'::timestamptz)
                                  then excluded.last_message_preview else t.last_message_preview end,
      last_message_at = greatest(t.last_message_at, excluded.last_message_at),
      unread_count = t.unread_count + excluded.unread_count;
  exception when others then
    -- A summary that fails must never lose the message itself.
    null;
  end;
  return new;
end;
$fn$;
revoke all on function public.mosha_message_to_thread() from public, anon, authenticated;

drop trigger if exists trg_mosha_message_to_thread on public.mosha_messages;
create trigger trg_mosha_message_to_thread after insert on public.mosha_messages
for each row execute function public.mosha_message_to_thread();

-- System notices land in the one history. Same signature and guard as before,
-- so track-zabal-download and submit-zabal-entry need no change. The 5 minute
-- dedupe covers an older build that still saves the reply mosha-chat has
-- already written.
create or replace function public.send_mosha_message(_user_id uuid, _message_text text)
returns uuid language plpgsql security definer set search_path to 'public'
as $fn$
declare
  _clean text := left(nullif(trim(coalesce(_message_text, '')), ''), 4000);
  _id uuid;
begin
  if auth.uid() is not null and auth.uid() <> _user_id then
    raise exception 'You can only message your own thread';
  end if;
  if _clean is null then
    raise exception 'Nothing to send';
  end if;
  select m.id into _id from public.mosha_messages m
   where m.user_id = _user_id and m.role = 'assistant' and m.content = _clean
     and m.created_at > now() - interval '5 minutes'
   order by m.created_at desc limit 1;
  if _id is not null then
    return _id;
  end if;
  insert into public.mosha_messages (user_id, role, content, source)
  values (_user_id, 'assistant', _clean, 'notice')
  returning id into _id;
  return _id;
end;
$fn$;

-- The caller's own line to Mo$ha is read, wherever they opened it.
create or replace function public.mark_mosha_read()
returns void language plpgsql security definer set search_path to 'public'
as $fn$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    return;
  end if;
  update public.mosha_messages set read_at = now()
   where user_id = _uid and role = 'assistant' and read_at is null;
  update public.dm_threads set unread_count = 0
   where user_id = _uid and unread_count <> 0;
  update public.direct_messages d set is_read = true
    from public.dm_threads t
   where t.id = d.thread_id and t.user_id = _uid and not d.is_read;
end;
$fn$;
revoke all on function public.mark_mosha_read() from public, anon;
grant execute on function public.mark_mosha_read() to authenticated, service_role;

-- Kept for any caller by thread id, now only for the caller's own thread.
create or replace function public.mark_dm_thread_read(_thread_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if not exists (select 1 from public.dm_threads where id = _thread_id and user_id = auth.uid()) then
    return;
  end if;
  perform public.mark_mosha_read();
end;
$fn$;

drop policy if exists mosha_messages_own_insert on public.mosha_messages;
create policy mosha_messages_own_insert on public.mosha_messages for insert to authenticated
with check (user_id = (select auth.uid()) and role = 'user' and source in ('chat', 'inbox')
            and read_at is null and legacy_dm_id is null);

-- The Inbox history, copied in once.
insert into public.mosha_messages (user_id, role, content, source, created_at, read_at, legacy_dm_id)
select t.user_id,
       case when d.sender_type = 'user' then 'user' else 'assistant' end,
       left(d.message_text, 4000),
       case when d.sender_type = 'user' then 'inbox' else 'notice' end,
       d.created_at, d.created_at, d.id
  from public.direct_messages d
  join public.dm_threads t on t.id = d.thread_id
 where nullif(trim(d.message_text), '') is not null
   and not exists (select 1 from public.mosha_messages m where m.legacy_dm_id = d.id)
   and not exists (
     select 1 from public.mosha_messages m
      where m.user_id = t.user_id
        and m.role = case when d.sender_type = 'user' then 'user' else 'assistant' end
        and m.content = d.message_text
        and abs(extract(epoch from (m.created_at - d.created_at))) < 300);

-- The old counts were never cleared (nothing called mark_dm_thread_read), so
-- they described nothing a person had missed.
update public.dm_threads set unread_count = 0 where unread_count <> 0;
