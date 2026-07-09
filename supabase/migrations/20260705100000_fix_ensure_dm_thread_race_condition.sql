-- ensure_dm_thread did select-then-insert-if-null, which isn't atomic: two
-- concurrent calls (e.g. React effects double-firing, two tabs) can both see
-- "no thread yet" and both try to insert, and the second hits
-- dm_threads_user_id_key (unique on user_id) and 409s. Make it a single
-- atomic upsert instead.
create or replace function public.ensure_dm_thread(_user_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  _thread_id uuid;
begin
  insert into public.dm_threads (user_id, title)
  values (_user_id, 'Mo$ha')
  on conflict (user_id) do update set updated_at = dm_threads.updated_at
  returning id into _thread_id;

  return _thread_id;
end;
$$;
