-- Song requests in the Room (founder, 15 Sep 2026: "build the song requests for the room").
--
-- Anyone in the Room can ask for a record. Requests queue in the order they were
-- asked, and every listener's player plays the line before going back to the
-- shared shuffle. The line lives here so everybody sees the same one.
--
-- Rules, enforced here and not in the browser:
--   * signed in only;
--   * one waiting request per person at a time;
--   * the same record cannot be in the line twice;
--   * the line holds at most 12 records ahead;
--   * at most 6 requests an hour per person.
--
-- `slot` is the Room's three minute segment the request was lined up for
-- (floor(epoch / 180)). It orders the line and lets a listener who walks in later
-- skip what the room has already heard.

create table if not exists public.room_song_requests (
  id uuid primary key default gen_random_uuid(),
  room_id text not null default 'global',
  song_id text not null check (length(song_id) between 1 and 200),
  slot bigint not null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  requester_name text,
  status text not null default 'queued' check (status in ('queued', 'cancelled')),
  created_at timestamptz not null default now()
);

create unique index if not exists room_song_requests_one_per_slot
  on public.room_song_requests (room_id, slot) where status = 'queued';
create index if not exists room_song_requests_line
  on public.room_song_requests (room_id, status, slot);
create index if not exists room_song_requests_by_person
  on public.room_song_requests (requested_by, created_at desc);

alter table public.room_song_requests enable row level security;

drop policy if exists "the room reads the request line" on public.room_song_requests;
create policy "the room reads the request line"
  on public.room_song_requests for select
  to authenticated
  using (true);

-- No insert, update or delete policies: only the functions below write.
revoke insert, update, delete on public.room_song_requests from anon, authenticated;
grant select on public.room_song_requests to authenticated;

create or replace function public.request_room_song(p_song_id text, p_name text default null)
returns table (request_id uuid, slot bigint, ahead integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_room text := 'global';
  v_now bigint := floor(extract(epoch from now()) / 180)::bigint;
  v_slot bigint;
  v_ahead integer;
  v_name text;
  v_id uuid;
begin
  if me is null then
    raise exception 'Sign in to request a song.';
  end if;
  if p_song_id is null or length(trim(p_song_id)) = 0 then
    raise exception 'Pick a song first.';
  end if;

  -- One request line at a time: take the lock so two taps cannot share a slot.
  perform pg_advisory_xact_lock(hashtext('room_song_requests:' || v_room));

  if exists (
    select 1 from public.room_song_requests r
     where r.room_id = v_room and r.status = 'queued' and r.requested_by = me and r.slot > v_now
  ) then
    raise exception 'You already have a song in the line. It plays before you can ask for another.';
  end if;

  if exists (
    select 1 from public.room_song_requests r
     where r.room_id = v_room and r.status = 'queued' and r.song_id = p_song_id and r.slot > v_now
  ) then
    raise exception 'That song is already in the line.';
  end if;

  if (select count(*) from public.room_song_requests r
       where r.requested_by = me and r.created_at > now() - interval '1 hour') >= 6 then
    raise exception 'That is six requests this hour. Give the room a moment and ask again.';
  end if;

  select count(*) into v_ahead
    from public.room_song_requests r
   where r.room_id = v_room and r.status = 'queued' and r.slot > v_now;
  if v_ahead >= 12 then
    raise exception 'The request line is full. Try again in a few minutes.';
  end if;

  select greatest(v_now + 1, coalesce(max(r.slot) + 1, v_now + 1)) into v_slot
    from public.room_song_requests r
   where r.room_id = v_room and r.status = 'queued' and r.slot > v_now;

  v_name := nullif(left(trim(coalesce(p_name, '')), 40), '');
  if v_name is null then
    select coalesce(nullif(trim(a.display_name), ''), nullif(trim(a.profile_name), ''))
      into v_name
      from public.audience_profiles a
     where a.user_id = me
     limit 1;
  end if;

  insert into public.room_song_requests (room_id, song_id, slot, requested_by, requester_name)
  values (v_room, p_song_id, v_slot, me, coalesce(v_name, 'A listener'))
  returning id into v_id;

  -- The line only ever needs today.
  delete from public.room_song_requests r where r.created_at < now() - interval '2 days';

  return query select v_id, v_slot, v_ahead;
end;
$$;

create or replace function public.cancel_room_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;
  update public.room_song_requests
     set status = 'cancelled'
   where id = p_request_id and requested_by = me and status = 'queued';
  if not found then
    raise exception 'That request is not yours, or it has already played.';
  end if;
end;
$$;

revoke all on function public.request_room_song(text, text) from public, anon;
revoke all on function public.cancel_room_request(uuid) from public, anon;
grant execute on function public.request_room_song(text, text) to authenticated;
grant execute on function public.cancel_room_request(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_song_requests'
  ) then
    alter publication supabase_realtime add table public.room_song_requests;
  end if;
end $$;
