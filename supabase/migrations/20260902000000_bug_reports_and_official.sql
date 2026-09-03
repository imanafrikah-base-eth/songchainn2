-- Two things: somewhere for "the app is broken" to land, and one account that
-- is unmistakably SONGCHAINN itself.

-- ---------------------------------------------------------------------------
-- Bug reports
--
-- Reporting a PERSON already had a route. Reporting the APP did not, so a dead
-- player or a blank page had nowhere to go and people left instead. The bugs
-- that cost the most users are the ones nobody can tell you about.
-- ---------------------------------------------------------------------------
create table if not exists public.bug_reports (
  id          uuid primary key default gen_random_uuid(),
  -- Nullable: somebody signed out hitting a broken page is exactly who most
  -- needs to be able to report it.
  user_id     uuid references auth.users(id) on delete set null,
  area        text not null,
  detail      text,
  -- Gathered for the reporter rather than asked of them.
  page        text,
  screen_size text,
  user_agent  text,
  status      text not null default 'open' check (status in ('open', 'seen', 'fixed', 'wont_fix')),
  admin_note  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists bug_reports_status_idx  on public.bug_reports(status, created_at desc);
create index if not exists bug_reports_area_idx    on public.bug_reports(area);

alter table public.bug_reports enable row level security;

-- Anybody may file one, signed in or not. A broken app is often broken before
-- you can sign in, and refusing those reports loses the worst bugs.
drop policy if exists bug_reports_insert_anyone on public.bug_reports;
create policy bug_reports_insert_anyone
  on public.bug_reports for insert
  to anon, authenticated
  with check (true);

-- You can read your own back. Nobody reads anybody else's: a report can carry
-- a page path and a browser string, and that is not for other users to browse.
drop policy if exists bug_reports_read_own on public.bug_reports;
create policy bug_reports_read_own
  on public.bug_reports for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant insert on public.bug_reports to anon, authenticated;
grant select on public.bug_reports to authenticated;

-- ---------------------------------------------------------------------------
-- The official account
--
-- A separate mark from the artist tick on purpose. The blue tick says "this is
-- really that artist". This says "this is the platform speaking", which is a
-- different claim and a more dangerous one to counterfeit: an announcement
-- carrying the platform's authority is exactly what somebody would fake.
--
-- It is a column rather than a role so it can never be self-declared, and it is
-- expected to be true for exactly one row.
-- ---------------------------------------------------------------------------
alter table public.audience_profiles
  add column if not exists is_official boolean not null default false;

comment on column public.audience_profiles.is_official is
  'The SONGCHAINN account itself. Distinct from artist verification. Set by hand, never by the app, and true for one row only.';

-- Only one account may ever hold it, enforced rather than trusted.
create unique index if not exists audience_profiles_one_official
  on public.audience_profiles ((is_official))
  where is_official = true;
