-- A direct message lands in ONE place: the inbox, with the message icon's badge.
--
-- send_direct_message and mosha_dm_founder also wrote every message into
-- notifications as a 'mention' pointing at /inbox?c=..., so the same message
-- showed up on the message icon AND in the bell. The bell is for activity
-- (follows, likes, comments, releases, payments); messages stay in the inbox.
--
-- The functions are rewritten in place from their live definitions so nothing
-- else in them changes, and the migration fails loudly if the insert is not
-- where it is expected.

do $mig$
declare
  d text;
  n text;
begin
  d := pg_get_functiondef('public.send_direct_message(uuid,text,text,uuid,jsonb)'::regprocedure);
  n := regexp_replace(
    d,
    'if _other is not null then\s*insert into public\.notifications[^;]*;\s*end if;',
    '',
    'i'
  );
  if n = d or n ilike '%notifications%' then
    raise exception 'send_direct_message: notification insert not found';
  end if;
  execute n;

  d := pg_get_functiondef('public.mosha_dm_founder(text,jsonb)'::regprocedure);
  n := regexp_replace(d, 'insert into public\.notifications[^;]*;', '', 'i');
  if n = d or n ilike '%notifications%' then
    raise exception 'mosha_dm_founder: notification insert not found';
  end if;
  execute n;
end
$mig$;

-- The copies already sitting in people's bells.
delete from public.notifications
where metadata->>'cta_path' like '/inbox%';

-- The message icon clears its number when tapped, the way the bell does.
-- Conversations keep their own unread marks until each is opened; only the
-- badge forgets what has already been seen.
create table if not exists public.dm_inbox_seen (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.dm_inbox_seen enable row level security;
revoke all on public.dm_inbox_seen from anon, authenticated;

create or replace function public.inbox_badge_count()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (select auth.uid() as uid),
  seen as (
    select coalesce((select s.seen_at from public.dm_inbox_seen s, me where s.user_id = me.uid), '-infinity'::timestamptz) as at
  )
  select (
    coalesce((
      select count(*)::integer
      from public.dm_participants p
      join public.dm_messages m on m.conversation_id = p.conversation_id
      cross join me cross join seen
      where p.user_id = me.uid
        and not p.is_archived
        and m.sender_user_id <> me.uid
        and not m.is_deleted
        and m.created_at > greatest(p.last_read_at, seen.at)
    ), 0)
    +
    coalesce((
      select sum(t.unread_count)::integer
      from public.dm_threads t
      cross join me cross join seen
      where t.user_id = me.uid
        and not coalesce(t.is_archived, false)
        and coalesce(t.last_message_at, t.updated_at) > seen.at
    ), 0)
  );
$$;

create or replace function public.mark_inbox_seen()
returns void
language sql
volatile
security definer
set search_path to 'public'
as $$
  insert into public.dm_inbox_seen (user_id, seen_at)
  select auth.uid(), now()
  where auth.uid() is not null
  on conflict (user_id) do update set seen_at = excluded.seen_at;
$$;

revoke all on function public.inbox_badge_count() from public, anon;
revoke all on function public.mark_inbox_seen() from public, anon;
grant execute on function public.inbox_badge_count() to authenticated;
grant execute on function public.mark_inbox_seen() to authenticated;
