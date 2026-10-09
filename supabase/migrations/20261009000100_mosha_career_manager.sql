-- Mo$ha manages a musician's career, when they want it.
--
-- An artist opts in by asking Mo$ha (or tapping yes when Mo$ha offers once).
-- From then on Mo$ha talks to them as their manager: their goals, the one
-- move that matters this week, and a Monday check-in with their real numbers.
-- Nothing happens to anyone who did not ask, and saying stop ends it.
--
--   mosha_career         one row per person: on or off, their goals, and when
--                        Mo$ha last checked in.
--   career_checkins()    the Monday note, written into their Mo$ha history
--                        (send_mosha_message, source 'notice'). Skips anyone
--                        who is on a break (artist_pauses).

create table if not exists public.mosha_career (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active boolean not null default true,
  goals text[] not null default '{}',
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  last_checkin_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint mosha_career_goals_cap check (cardinality(goals) <= 5)
);

alter table public.mosha_career enable row level security;

create policy "mosha_career_own_select" on public.mosha_career
  for select to authenticated using (user_id = (select auth.uid()));
create policy "mosha_career_own_insert" on public.mosha_career
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "mosha_career_own_update" on public.mosha_career
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "mosha_career_own_delete" on public.mosha_career
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.mosha_career to authenticated;

create index if not exists mosha_career_active_idx on public.mosha_career (last_checkin_at) where active;

-- The Monday note. Plays are counted the way the artist's page counts them:
-- a shared listen (one group_key) once.
create or replace function public.career_checkins()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  _sent integer := 0;
  _this bigint;
  _last bigint;
  _fans bigint;
  _top text;
  _last_release timestamptz;
  _next_release timestamptz;
  _days integer;
  _msg text;
  _move text;
begin
  for r in
    select c.user_id, c.goals, a.artist_id
      from public.mosha_career c
      join public.artist_accounts a on a.user_id = c.user_id
     where c.active
       and (c.last_checkin_at is null or c.last_checkin_at < now() - interval '6 days 12 hours')
       and not exists (select 1 from public.artist_pauses p where p.user_id = c.user_id)
  loop
    with mine as (
      select s.id, s.title from public.songs s
       where s.is_published and (s.artist_id = r.artist_id or s.owner_id = r.user_id)
    ),
    plays as (
      select distinct on (coalesce(p.group_key, p.id::text)) p.song_id, p.created_at
        from public.song_analytics p
        join mine on mine.id = p.song_id
       where p.event_type = 'play' and p.created_at > now() - interval '14 days'
       order by coalesce(p.group_key, p.id::text), p.created_at
    )
    select
      count(*) filter (where created_at > now() - interval '7 days'),
      count(*) filter (where created_at <= now() - interval '7 days'),
      (select m.title from plays p2 join mine m on m.id = p2.song_id
        where p2.created_at > now() - interval '7 days'
        group by m.title order by count(*) desc limit 1)
      into _this, _last, _top
      from plays;

    select count(*) into _fans from public.liked_artists
     where artist_id = r.artist_id and created_at > now() - interval '7 days';

    select max(coalesce(s.release_at, s.published_at, s.created_at)) into _last_release
      from public.songs s
     where s.is_published and (s.owner_id = r.user_id or s.artist_id = r.artist_id)
       and coalesce(s.release_at, s.published_at, s.created_at) <= now();
    select min(s.release_at) into _next_release
      from public.songs s
     where s.owner_id = r.user_id and s.release_at > now();
    _days := case when _last_release is null then null else (now()::date - _last_release::date) end;

    _move := case
      when _next_release is not null then
        'Your next release is set for ' || to_char(_next_release at time zone 'utc', 'Dy DD Mon') || '. Tell your Day Ones it is coming.'
      when _days is null then
        'Get your first record out this week. Everything else opens from it.'
      when _days > 28 then
        'It has been ' || _days || ' days since your last release. Time to put the next one out.'
      when _top is not null then
        '"' || _top || '" is carrying you. Share it and thank the people playing it.'
      else
        'Share your newest record with your people this week.'
    end;

    _msg := 'Monday check-in. This week: ' || coalesce(_this, 0) || ' stream' || case when coalesce(_this, 0) = 1 then '' else 's' end
      || case
           when coalesce(_last, 0) = 0 then ''
           when _this > _last then ', up from ' || _last
           when _this < _last then ', down from ' || _last
           else ', same as last week'
         end
      || ', ' || coalesce(_fans, 0) || ' new follower' || case when coalesce(_fans, 0) = 1 then '' else 's' end || '. '
      || _move
      || case when cardinality(r.goals) > 0 then ' Your goal: ' || r.goals[1] || '.' else '' end
      || ' Ask me for this week''s plan.';

    perform public.send_mosha_message(r.user_id, _msg);
    update public.mosha_career set last_checkin_at = now() where user_id = r.user_id;
    _sent := _sent + 1;
  end loop;
  return _sent;
end;
$$;

revoke all on function public.career_checkins() from public, anon, authenticated;

-- Mondays 07:00 UTC (09:00 in Lusaka and Johannesburg).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mosha-career-checkins') then
    perform cron.unschedule('mosha-career-checkins');
  end if;
  perform cron.schedule('mosha-career-checkins', '0 7 * * 1', 'select public.career_checkins()');
end;
$$;
