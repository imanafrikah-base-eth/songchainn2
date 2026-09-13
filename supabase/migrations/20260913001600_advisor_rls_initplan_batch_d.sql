-- Performance advisor: auth_rls_initplan, batch D (mosha_* and notifications).
-- Covers the tables held back from batches A-C while other agents worked there.
-- Wraps auth.uid()/auth.jwt()/auth.role()/auth.email() in a scalar subselect so
-- Postgres evaluates them once per statement instead of once per row.
-- ALTER POLICY changes only USING / WITH CHECK: name, roles, command and
-- PERMISSIVE/RESTRICTIVE are untouched. No function bodies or grants change.
-- The block self-verifies inside the transaction and raises (rolling everything
-- back) unless every policy on the batch, once the wrapping is normalised away,
-- reads exactly as before.
do $mig$
declare
  tbls text[] := array['mosha_greetings','mosha_memory','mosha_messages','notifications'];
  r record; nq text; nw text; stmt text; bad int; n_altered int := 0;
begin
  create temp table _pol_before on commit drop as
    select tablename, policyname, cmd, permissive, roles, qual, with_check
    from pg_policies where schemaname = 'public' and tablename = any(tbls);

  for r in select * from _pol_before
           where coalesce(qual,'') || coalesce(with_check,'') ~ 'auth\.(uid|jwt|role|email)\(\)' loop
    -- normalise any already-wrapped call back to bare, then wrap every call once
    nq := replace(replace(replace(replace(
            replace(replace(replace(replace(r.qual,
              '( SELECT auth.uid() AS uid)','auth.uid()'),'( SELECT auth.jwt() AS jwt)','auth.jwt()'),
              '( SELECT auth.role() AS role)','auth.role()'),'( SELECT auth.email() AS email)','auth.email()'),
            'auth.uid()','( SELECT auth.uid() AS uid)'),'auth.jwt()','( SELECT auth.jwt() AS jwt)'),
            'auth.role()','( SELECT auth.role() AS role)'),'auth.email()','( SELECT auth.email() AS email)');
    nw := replace(replace(replace(replace(
            replace(replace(replace(replace(r.with_check,
              '( SELECT auth.uid() AS uid)','auth.uid()'),'( SELECT auth.jwt() AS jwt)','auth.jwt()'),
              '( SELECT auth.role() AS role)','auth.role()'),'( SELECT auth.email() AS email)','auth.email()'),
            'auth.uid()','( SELECT auth.uid() AS uid)'),'auth.jwt()','( SELECT auth.jwt() AS jwt)'),
            'auth.role()','( SELECT auth.role() AS role)'),'auth.email()','( SELECT auth.email() AS email)');
    if nq is not distinct from r.qual and nw is not distinct from r.with_check then continue; end if;
    stmt := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if nq is not null then stmt := stmt || format(' using (%s)', nq); end if;
    if nw is not null then stmt := stmt || format(' with check (%s)', nw); end if;
    execute stmt;
    n_altered := n_altered + 1;
  end loop;

  -- verification: same policy set, same cmd/permissive/roles, same logic modulo wrapping
  select count(*) into bad from (
    select b.tablename, b.policyname from _pol_before b
    full join (select * from pg_policies where schemaname='public' and tablename = any(tbls)) a
      on a.tablename = b.tablename and a.policyname = b.policyname
    where a.policyname is null or b.policyname is null
       or a.cmd <> b.cmd or a.permissive <> b.permissive or a.roles <> b.roles
       or replace(replace(replace(replace(a.qual,'( SELECT auth.uid() AS uid)','auth.uid()'),'( SELECT auth.jwt() AS jwt)','auth.jwt()'),'( SELECT auth.role() AS role)','auth.role()'),'( SELECT auth.email() AS email)','auth.email()')
          is distinct from
          replace(replace(replace(replace(b.qual,'( SELECT auth.uid() AS uid)','auth.uid()'),'( SELECT auth.jwt() AS jwt)','auth.jwt()'),'( SELECT auth.role() AS role)','auth.role()'),'( SELECT auth.email() AS email)','auth.email()')
       or replace(replace(replace(replace(a.with_check,'( SELECT auth.uid() AS uid)','auth.uid()'),'( SELECT auth.jwt() AS jwt)','auth.jwt()'),'( SELECT auth.role() AS role)','auth.role()'),'( SELECT auth.email() AS email)','auth.email()')
          is distinct from
          replace(replace(replace(replace(b.with_check,'( SELECT auth.uid() AS uid)','auth.uid()'),'( SELECT auth.jwt() AS jwt)','auth.jwt()'),'( SELECT auth.role() AS role)','auth.role()'),'( SELECT auth.email() AS email)','auth.email()')
       or regexp_replace(coalesce(a.qual,'') || ' ' || coalesce(a.with_check,''), '\( SELECT auth\.(uid|jwt|role|email)\(\) AS \w+\)', '', 'g') ~ 'auth\.(uid|jwt|role|email)\(\)'
  ) x;
  if bad > 0 then
    raise exception 'initplan rewrite verification failed on % policies; rolled back', bad;
  end if;
  raise notice 'initplan batch altered % policies, verified', n_altered;
end
$mig$;
