-- Applied to the live project 12 Sep 2026 via MCP.
--
-- Forty trigger functions carried EXECUTE for anon and authenticated.
--
-- This is not an exposure: PostgREST never publishes a function that returns
-- trigger as an RPC, and Postgres checks EXECUTE when a trigger is CREATED, not
-- each time it fires, so the grants did nothing in either direction. They were
-- noise, and noise is not harmless: it was 26 of the 169 function findings in
-- the advisor, and a report that is mostly false positives is a report nobody
-- reads carefully enough to spot the one real thing in it.
--
-- A FIRST ATTEMPT AT THIS WAS A NO-OP AND SAID NOTHING ABOUT IT. It revoked
-- from anon and authenticated only. Neither role ever held a direct grant: the
-- ACL reads {=X/postgres, postgres=X/postgres, service_role=X/postgres}, and
-- that leading "=X" is the grant to PUBLIC that Postgres puts on every function
-- by default. The roles reach EXECUTE through PUBLIC, so revoking a grant they
-- did not have changed nothing while has_function_privilege kept answering
-- true. The flagged count was 26 before and 26 after. It is 0 now.
--
-- postgres owns these and service_role holds an explicit grant, so both keep
-- EXECUTE. Done as a loop over the catalogue rather than typed names, so it
-- cannot drift from what is actually there.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end
$$;
