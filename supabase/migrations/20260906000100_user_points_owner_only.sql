-- user_points: your points are yours to read, and nobody else's.
--
-- The live table answered a plain anon REST request with every row: every
-- user_id and every total. The select policy that allowed it is not in any
-- tracked migration (the original, 20251220114152, only ever let a person
-- read their own row), so it was added by hand at some point, probably to
-- feed a leaderboard. Whatever its name, it goes: this block drops EVERY
-- select policy on the table, then puts back the one that should be there.
--
-- The public leaderboard must use the get_points_leaderboard() RPC (see
-- src/hooks/useUserPoints.ts), which returns ranked totals without opening
-- the table. Nothing on the client should read user_points for anyone but
-- the signed-in person.
--
-- Insert and update policies are left exactly as they are.

do $$
declare
  v_policy text;
begin
  if to_regclass('public.user_points') is null then
    raise notice 'user_points does not exist, skipping';
    return;
  end if;

  for v_policy in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = 'user_points'
       and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.user_points', v_policy);
    raise notice 'user_points: dropped select policy %', v_policy;
  end loop;

  execute 'create policy "Users read their own points" on public.user_points for select using (auth.uid() = user_id)';

  execute 'alter table public.user_points enable row level security';
end
$$;
