-- Applied to the live project 12 Sep 2026 via MCP. Recorded here so a rebuild
-- of the database does not quietly lose it.
--
-- Mo$ha congratulates an artist when their record goes live.
--
-- The greeting is a row, not an event. An artist who uploads from a phone has
-- usually closed the tab long before the audition finishes, so anything fired at
-- the moment of publishing reaches nobody. The row waits until they are looking;
-- the app says it once and marks it shown.
--
-- Only artists whose account was claimed on or after 12 Sep 2026 get the full
-- first-record welcome. Everyone else gets a one line congratulations.
--
-- The app decides WHERE to say it (src/components/VibeAgent.tsx): the first
-- record welcome waits for the artist's own musician page.

create table if not exists public.mosha_greetings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('verified', 'first_song_live', 'song_live')),
  body        text not null,
  suggestions jsonb not null default '[]'::jsonb,
  song_id     text,
  created_at  timestamptz not null default now(),
  shown_at    timestamptz
);

create index if not exists mosha_greetings_pending_idx
  on public.mosha_greetings (user_id, created_at) where shown_at is null;

alter table public.mosha_greetings enable row level security;

drop policy if exists mosha_greetings_read_own on public.mosha_greetings;
create policy mosha_greetings_read_own on public.mosha_greetings
  for select using (auth.uid() = user_id);

drop policy if exists mosha_greetings_mark_own on public.mosha_greetings;
create policy mosha_greetings_mark_own on public.mosha_greetings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.mosha_greet_on_release()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_claimed  timestamptz;
  v_previous integer;
begin
  -- SAFETY. This is an AFTER trigger on songs: if it throws, the publish throws
  -- with it and nobody can release anything. A missed congratulations must
  -- never cost an artist their release, so the whole body swallows its errors.
  begin
    if new.status <> 'published' then return new; end if;
    if tg_op = 'UPDATE' and old.status is not distinct from 'published' then return new; end if;
    if new.owner_id is null then return new; end if;

    select aa.claimed_at into v_claimed
      from public.artist_accounts aa
     where aa.user_id = new.owner_id
     limit 1;
    if not found then return new; end if;

    -- A record dated ahead is not out yet; say nothing until its day.
    if new.release_date is not null and new.release_date > current_date then return new; end if;
    if new.release_at is not null and new.release_at > now() then return new; end if;

    select count(*) into v_previous
      from public.songs s
     where s.owner_id = new.owner_id
       and s.status = 'published'
       and s.id <> new.id;

    if v_previous = 0 and v_claimed >= timestamptz '2026-09-12 00:00:00+00' then
      insert into public.mosha_greetings (user_id, kind, body, suggestions, song_id)
      values (
        new.owner_id, 'first_song_live',
        'Congratulations. ' || coalesce(new.title, 'Your record') ||
          ' is live on SONGCHAINN, and you are a musician here now. Ask me anything, or start with one of these.',
        jsonb_build_array(
          'How do I get paid for my music?',
          'What is an artist coin?',
          'How do I put out my next record?',
          'How do I build my world?',
          'Who can hear my music now?'
        ),
        new.id
      );
    else
      insert into public.mosha_greetings (user_id, kind, body, suggestions, song_id)
      values (
        new.owner_id, 'song_live',
        'Congratulations, ' || coalesce(new.title, 'your song') || ' is live.',
        '[]'::jsonb, new.id
      );
    end if;
  exception when others then
    null;
  end;

  return new;
end
$function$;

drop trigger if exists mosha_greet_on_release_trg on public.songs;
create trigger mosha_greet_on_release_trg
  after insert or update of status on public.songs
  for each row execute function public.mosha_greet_on_release();
