-- Opening the bell clears the badge, without marking anything read.
--
-- is_read stays what it was: the per-item highlight, cleared one tap at a time.
-- seen_at is new: set for every row the moment the person opens the tray, and
-- the badge is the exact count of rows where it is still null.

alter table public.notifications add column if not exists seen_at timestamptz;

-- Anything already read has obviously been seen.
update public.notifications
   set seen_at = created_at
 where is_read = true
   and seen_at is null;

create index if not exists notifications_unseen_idx
  on public.notifications (user_id)
  where seen_at is null;

create or replace function public.mark_notifications_seen()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n integer := 0;
begin
  if uid is null then
    return 0;
  end if;
  update public.notifications
     set seen_at = now()
   where user_id = uid
     and seen_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.mark_notifications_seen() from public;
revoke all on function public.mark_notifications_seen() from anon;
grant execute on function public.mark_notifications_seen() to authenticated;
grant execute on function public.mark_notifications_seen() to service_role;
