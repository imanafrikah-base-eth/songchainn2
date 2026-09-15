-- The Room plays one song for everybody (founder, 15 Sep 2026).
--
-- Until now each listener's phone ran its own copy of the shuffle, lined up by
-- the clock only at the moment they walked in. Songs are not three minutes long,
-- so after a song or two nobody was hearing the same thing, and a request only
-- reached the person who made it straight away.
--
-- Now the server keeps the Room's schedule: which song starts when, using the
-- song's real length. Every player seeks to it, so somebody who walks in halfway
-- through a song joins it halfway through. A request goes into that one schedule
-- and plays next for the whole room.
--
-- Rules:
--   * every song plays once before any song plays again (a cycle), and never the
--     same artist back to back where the catalogue allows it;
--   * a request needs 100 SONGCHAINN points, one waiting request per person, and
--     cannot be a song that is playing, coming up, waiting, or played in the last
--     hour; the line holds 12 and a person gets 6 an hour;
--   * a requested song counts as played for the cycle, so the shuffle does not
--     bring it straight back.

-- ── The founding catalogue ────────────────────────────────────────────────────
-- The founding records live in src/data/musicData.ts, not in `songs`, so the
-- server keeps its own copy of what it needs: who made each record and how long
-- it is. Adding a founding song means adding its row here too.
create table if not exists public.room_founding_songs (
  song_id text primary key,
  lead_key text not null,
  artist_keys text[] not null,
  duration_seconds numeric check (duration_seconds is null or duration_seconds between 10 and 1800)
);
alter table public.room_founding_songs enable row level security;
revoke all on public.room_founding_songs from anon, authenticated;

-- A length the first player to load a record measured, for a record whose
-- length the server did not have.
create table if not exists public.room_song_lengths (
  song_id text primary key,
  seconds numeric not null check (seconds between 20 and 1200),
  reported_by uuid,
  reported_at timestamptz not null default now()
);
alter table public.room_song_lengths enable row level security;
revoke all on public.room_song_lengths from anon, authenticated;

create table if not exists public.room_state (
  room_id text primary key,
  cycle_started_at timestamptz not null default now()
);
alter table public.room_state enable row level security;
revoke all on public.room_state from anon, authenticated;

-- ── Requests move onto the schedule ──────────────────────────────────────────
alter table public.room_song_requests alter column slot drop not null;
drop index if exists public.room_song_requests_one_per_slot;
alter table public.room_song_requests drop constraint if exists room_song_requests_status_check;
alter table public.room_song_requests
  add constraint room_song_requests_status_check
  check (status in ('queued', 'scheduled', 'cancelled', 'expired'));
create index if not exists room_song_requests_waiting
  on public.room_song_requests (room_id, status, created_at);

-- Requests made under the old per-phone line never reached the room. They are
-- closed rather than all landing on the new schedule at once.
update public.room_song_requests set status = 'expired' where status = 'queued';

-- ── The schedule ─────────────────────────────────────────────────────────────
create table if not exists public.room_timeline (
  id bigint generated always as identity primary key,
  room_id text not null default 'global',
  song_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_seconds numeric not null,
  length_known boolean not null default true,
  request_id uuid references public.room_song_requests(id) on delete set null,
  requested_by uuid,
  requester_name text,
  created_at timestamptz not null default now()
);
create index if not exists room_timeline_by_start on public.room_timeline (room_id, starts_at desc);
create index if not exists room_timeline_by_end on public.room_timeline (room_id, ends_at);
create index if not exists room_timeline_by_song on public.room_timeline (room_id, song_id, ends_at desc);
create index if not exists room_timeline_by_request on public.room_timeline (request_id) where request_id is not null;

alter table public.room_timeline enable row level security;
drop policy if exists "the room reads its schedule" on public.room_timeline;
create policy "the room reads its schedule"
  on public.room_timeline for select
  to authenticated
  using (true);
revoke insert, update, delete on public.room_timeline from anon, authenticated;
grant select on public.room_timeline to authenticated;

-- ── What the Room can play ───────────────────────────────────────────────────
-- The founding records plus every published upload a listener can see, with
-- everyone behind each record (same keys as artistKeysOf in src/lib/roomOrder.ts)
-- and its length. 240 seconds stands in for a length nobody has measured yet.
create or replace function public.room_catalog()
returns table (song_id text, lead_key text, artist_keys text[], duration_seconds numeric, length_known boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  with uploads as (
    select
      s.id as song_id,
      'id:' || lower(s.artist_id) as lead_key,
      array(
        select distinct k from (
          select 'id:' || lower(s.artist_id) as k
          union all
          select 'id:' || lower(f->>'artistId')
            from jsonb_array_elements(case when jsonb_typeof(s.featured) = 'array' then s.featured else '[]'::jsonb end) f
           where f->>'collab' = 'true' and coalesce(trim(f->>'artistId'), '') <> ''
          union all
          select 'name:' || lower(trim(p))
            from regexp_split_to_table(coalesce(s.artist_name, ''), '\s*(?:&|,|\mx\M|\mft\.?|\mfeat\.?|\mfeaturing\M)\s*', 'i') p
           where trim(p) <> ''
        ) keys
      ) as artist_keys,
      s.duration_seconds
    from public.songs s
    where s.is_published
      and s.artist_id is not null
      and s.audio_url is not null
      and coalesce(trim(s.title), '') <> ''
      and coalesce(trim(s.artist_name), '') <> ''
      and (s.release_date is null or s.release_date <= current_date)
      and (s.release_at is null or s.release_at <= now())
      and not exists (select 1 from public.room_founding_songs f where f.song_id = s.id)
  ), everything as (
    select f.song_id, f.lead_key, f.artist_keys, f.duration_seconds from public.room_founding_songs f
    union all
    select u.song_id, u.lead_key, u.artist_keys, u.duration_seconds from uploads u
  )
  select e.song_id, e.lead_key, e.artist_keys,
         coalesce(e.duration_seconds, l.seconds, 240),
         (e.duration_seconds is not null or l.seconds is not null)
    from everything e
    left join public.room_song_lengths l on l.song_id = e.song_id;
$$;

-- ── Filling the schedule ─────────────────────────────────────────────────────
-- Keeps a song on now and one after it. The next song is the oldest waiting
-- request, otherwise a shuffle pick: a record not yet played this cycle, not by
-- anyone behind the previous record, and from the artist with most records left
-- when leaving them any longer would force two of theirs back to back.
create or replace function public.room_extend(p_room text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_last public.room_timeline%rowtype;
  v_start timestamptz;
  v_req public.room_song_requests%rowtype;
  v_cycle timestamptz;
  v_prev_keys text[];
  v_song text;
  v_dur numeric;
  v_known boolean;
  v_guard integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('room_timeline:' || p_room));

  loop
    v_guard := v_guard + 1;
    exit when v_guard > 4;
    exit when (select count(*) from public.room_timeline t where t.room_id = p_room and t.ends_at > now()) >= 2;

    select * into v_last from public.room_timeline t where t.room_id = p_room order by t.starts_at desc limit 1;
    -- A room nobody kept going starts fresh now; a short gap closes up.
    if v_last.id is null or v_last.ends_at < now() - interval '20 seconds' then
      v_start := now();
    else
      v_start := v_last.ends_at;
    end if;

    -- A waiting request goes first.
    select r.* into v_req
      from public.room_song_requests r
     where r.room_id = p_room and r.status = 'queued'
     order by r.created_at
     limit 1
     for update;

    if v_req.id is not null then
      select c.duration_seconds, c.length_known into v_dur, v_known
        from public.room_catalog() c where c.song_id = v_req.song_id;
      if v_dur is null then
        -- The record left the catalogue while it waited.
        update public.room_song_requests set status = 'expired' where id = v_req.id;
        continue;
      end if;
      insert into public.room_timeline (room_id, song_id, starts_at, ends_at, duration_seconds, length_known, request_id, requested_by, requester_name)
      values (p_room, v_req.song_id, v_start, v_start + make_interval(secs => v_dur), v_dur, v_known, v_req.id, v_req.requested_by, v_req.requester_name);
      update public.room_song_requests set status = 'scheduled' where id = v_req.id;
      continue;
    end if;

    -- Otherwise the shuffle.
    select s.cycle_started_at into v_cycle from public.room_state s where s.room_id = p_room;
    if v_cycle is null then
      insert into public.room_state (room_id) values (p_room)
      on conflict (room_id) do nothing;
      select s.cycle_started_at into v_cycle from public.room_state s where s.room_id = p_room;
    end if;

    v_prev_keys := coalesce((select c.artist_keys from public.room_catalog() c where c.song_id = v_last.song_id), '{}'::text[]);

    v_song := null;
    for attempt in 1..2 loop
      with pool as (
        select c.*
          from public.room_catalog() c
         where not exists (
                 select 1 from public.room_timeline t
                  where t.room_id = p_room and t.song_id = c.song_id
                    and (t.starts_at >= v_cycle or t.ends_at > now())
               )
           and not exists (
                 select 1 from public.room_song_requests r
                  where r.room_id = p_room and r.status = 'queued' and r.song_id = c.song_id
               )
      ),
      groups as (select p.lead_key, count(*) as n from pool p group by p.lead_key),
      dominant as (
        select g.lead_key from groups g
         where g.n * 2 > (select count(*) from pool) + 1
      ),
      ranked as (
        select p.song_id, p.duration_seconds, p.length_known,
               case
                 when p.artist_keys && v_prev_keys then 2
                 when exists (select 1 from dominant) and p.lead_key not in (select d.lead_key from dominant d) then 1
                 else 0
               end as rank
          from pool p
      )
      select r.song_id, r.duration_seconds, r.length_known into v_song, v_dur, v_known
        from ranked r
       order by r.rank, random()
       limit 1;

      exit when v_song is not null;
      -- Every record has played this cycle: a new cycle begins.
      update public.room_state set cycle_started_at = now() where room_id = p_room;
      v_cycle := now();
    end loop;

    exit when v_song is null; -- nothing to play at all

    insert into public.room_timeline (room_id, song_id, starts_at, ends_at, duration_seconds, length_known)
    values (p_room, v_song, v_start, v_start + make_interval(secs => v_dur), v_dur, v_known);
  end loop;

  -- The schedule only needs recent history (a cycle is under a day of play).
  if random() < 0.02 then
    delete from public.room_timeline t where t.room_id = p_room and t.ends_at < now() - interval '7 days';
    delete from public.room_song_requests r where r.created_at < now() - interval '7 days';
  end if;
end;
$$;

-- ── What a listener reads ────────────────────────────────────────────────────
create or replace function public.room_now()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_room text := 'global';
begin
  if auth.uid() is null then
    raise exception 'Sign in to join the Room.';
  end if;

  if (select count(*) from public.room_timeline t where t.room_id = v_room and t.ends_at > now()) < 2 then
    perform public.room_extend(v_room);
  end if;

  return jsonb_build_object(
    'now', clock_timestamp(),
    'entries', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.starts_at)
        from (
          select t.id, t.song_id, t.starts_at, t.ends_at, t.duration_seconds, t.length_known,
                 t.request_id, t.requested_by, t.requester_name
            from public.room_timeline t
           where t.room_id = v_room and t.ends_at > now()
           order by t.starts_at
           limit 4
        ) e
    ), '[]'::jsonb),
    'waiting', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.created_at)
        from (
          select r.id, r.song_id, r.requested_by, r.requester_name, r.created_at
            from public.room_song_requests r
           where r.room_id = v_room and r.status = 'queued'
           order by r.created_at
           limit 24
        ) w
    ), '[]'::jsonb)
  );
end;
$$;

-- ── Asking for a song ────────────────────────────────────────────────────────
drop function if exists public.request_room_song(text, text);
create function public.request_room_song(p_song_id text, p_name text default null)
returns table (request_id uuid, ahead integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_room text := 'global';
  v_points bigint;
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

  select coalesce(p.points, 0) into v_points from public.user_points p where p.user_id = me;
  if coalesce(v_points, 0) < 100 then
    raise exception 'Song requests open at 100 SONGCHAINN points. You have %.', coalesce(v_points, 0);
  end if;

  if not exists (select 1 from public.room_catalog() c where c.song_id = p_song_id) then
    raise exception 'That song is not in the Room.';
  end if;

  -- The same lock as the schedule, so a request and a schedule fill never cross.
  perform pg_advisory_xact_lock(hashtext('room_timeline:' || v_room));

  if exists (
    select 1 from public.room_song_requests r
     where r.room_id = v_room and r.requested_by = me
       and (r.status = 'queued'
            or (r.status = 'scheduled' and exists (
                  select 1 from public.room_timeline t where t.request_id = r.id and t.starts_at > now())))
  ) then
    raise exception 'You already have a song in the line. It plays before you can ask for another.';
  end if;

  if exists (
    select 1 from public.room_timeline t
     where t.room_id = v_room and t.song_id = p_song_id and t.ends_at > now()
  ) then
    raise exception 'That song is playing now or already coming up.';
  end if;

  if exists (
    select 1 from public.room_song_requests r
     where r.room_id = v_room and r.status = 'queued' and r.song_id = p_song_id
  ) then
    raise exception 'That song is already in the line.';
  end if;

  if exists (
    select 1 from public.room_timeline t
     where t.room_id = v_room and t.song_id = p_song_id and t.ends_at > now() - interval '1 hour'
  ) then
    raise exception 'That song played in the last hour. Pick another one.';
  end if;

  if (select count(*) from public.room_song_requests r
       where r.requested_by = me and r.status <> 'expired' and r.created_at > now() - interval '1 hour') >= 6 then
    raise exception 'That is six requests this hour. Give the room a moment and ask again.';
  end if;

  select count(*) into v_ahead
    from public.room_song_requests r
   where r.room_id = v_room
     and (r.status = 'queued'
          or (r.status = 'scheduled' and exists (
                select 1 from public.room_timeline t where t.request_id = r.id and t.starts_at > now())));
  if v_ahead >= 12 then
    raise exception 'The request line is full. Try again in a few minutes.';
  end if;

  v_name := nullif(left(trim(coalesce(p_name, '')), 40), '');
  if v_name is null then
    select coalesce(nullif(trim(a.display_name), ''), nullif(trim(a.profile_name), ''))
      into v_name
      from public.audience_profiles a
     where a.user_id = me
     limit 1;
  end if;

  insert into public.room_song_requests (room_id, song_id, requested_by, requester_name)
  values (v_room, p_song_id, me, coalesce(v_name, 'A listener'))
  returning id into v_id;

  -- Requests jump the shuffle: a shuffle pick that has not started yet gives
  -- way, unless it is about to start.
  delete from public.room_timeline t
   where t.room_id = v_room and t.request_id is null and t.starts_at > now() + interval '5 seconds';
  perform public.room_extend(v_room);

  return query select v_id, v_ahead;
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
  v_room text := 'global';
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;

  perform pg_advisory_xact_lock(hashtext('room_timeline:' || v_room));

  update public.room_song_requests r
     set status = 'cancelled'
   where r.id = p_request_id and r.requested_by = me
     and (r.status = 'queued'
          or (r.status = 'scheduled' and exists (
                select 1 from public.room_timeline t where t.request_id = r.id and t.starts_at > now())));
  if not found then
    raise exception 'That request is not yours, or it is already playing.';
  end if;

  delete from public.room_timeline t where t.request_id = p_request_id and t.starts_at > now();
  perform public.room_extend(v_room);
end;
$$;

-- ── A length the server did not have ─────────────────────────────────────────
-- The first player to load a record with no known length reports it. The entry
-- is corrected and whatever was lined up after it is lined up again from its
-- real end.
create or replace function public.room_report_length(p_entry_id bigint, p_seconds numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_entry public.room_timeline%rowtype;
  v_seconds numeric;
begin
  if me is null or p_seconds is null or p_seconds < 20 or p_seconds > 1200 then
    return;
  end if;

  select * into v_entry from public.room_timeline t where t.id = p_entry_id;
  if v_entry.id is null or v_entry.length_known or v_entry.ends_at < now() - interval '1 minute' then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('room_timeline:' || v_entry.room_id));

  insert into public.room_song_lengths (song_id, seconds, reported_by)
  values (v_entry.song_id, round(p_seconds, 2), me)
  on conflict (song_id) do nothing;
  select l.seconds into v_seconds from public.room_song_lengths l where l.song_id = v_entry.song_id;

  update public.room_timeline
     set duration_seconds = v_seconds,
         ends_at = starts_at + make_interval(secs => v_seconds),
         length_known = true
   where id = v_entry.id and not length_known;
  if not found then
    return;
  end if;

  update public.room_song_requests r
     set status = 'queued'
    from public.room_timeline t
   where t.request_id = r.id and t.room_id = v_entry.room_id and t.starts_at > v_entry.starts_at
     and r.status = 'scheduled';
  delete from public.room_timeline t
   where t.room_id = v_entry.room_id and t.starts_at > v_entry.starts_at;

  perform public.room_extend(v_entry.room_id);
end;
$$;

revoke all on function public.room_catalog() from public, anon, authenticated;
revoke all on function public.room_extend(text) from public, anon, authenticated;
revoke all on function public.room_now() from public, anon;
revoke all on function public.request_room_song(text, text) from public, anon;
revoke all on function public.cancel_room_request(uuid) from public, anon;
revoke all on function public.room_report_length(bigint, numeric) from public, anon;
grant execute on function public.room_now() to authenticated;
grant execute on function public.request_room_song(text, text) to authenticated;
grant execute on function public.cancel_room_request(uuid) to authenticated;
grant execute on function public.room_report_length(bigint, numeric) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_timeline'
  ) then
    alter publication supabase_realtime add table public.room_timeline;
  end if;
end $$;

-- ── Seed: the founding catalogue, lengths measured from the audio files ──────
-- Left out: 40 (Sanchy, No Apology: the audio file returns 404) and 213 (N3M3SIS,
-- Vib3: the audio file is under two seconds long).
insert into public.room_founding_songs (song_id, lead_key, artist_keys, duration_seconds) values
  ('1', 'id:1', array['id:1', 'name:7roo7h']::text[], 179.44),
  ('8', 'id:1', array['id:1', 'name:7roo7h']::text[], 169.82),
  ('10', 'id:1', array['id:1', 'name:7roo7h']::text[], 146.96),
  ('11', 'id:1', array['id:1', 'name:7roo7h']::text[], 194.84),
  ('12', 'id:1', array['id:1', 'name:7roo7h']::text[], 183.04),
  ('13', 'id:1', array['id:1', 'name:7roo7h']::text[], 198.68),
  ('49', 'id:1', array['id:1', 'name:7roo7h']::text[], 179.44),
  ('2', 'id:2', array['id:2', 'name:denajah']::text[], 194.96),
  ('9', 'id:2', array['id:2', 'name:denajah']::text[], 156.6),
  ('14', 'id:2', array['id:2', 'name:denajah']::text[], 184.92),
  ('15', 'id:2', array['id:2', 'name:denajah']::text[], 143),
  ('16', 'id:2', array['id:2', 'name:denajah']::text[], 155.96),
  ('17', 'id:2', array['id:2', 'name:denajah']::text[], 152.56),
  ('18', 'id:2', array['id:2', 'name:denajah']::text[], 199.96),
  ('3', 'id:3', array['id:3', 'name:iman afrikah']::text[], 156.72),
  ('31', 'id:3', array['id:3', 'name:iman afrikah']::text[], 128.48),
  ('32', 'id:3', array['id:3', 'name:iman afrikah']::text[], 115.36),
  ('33', 'id:3', array['id:3', 'name:iman afrikah']::text[], 144.92),
  ('34', 'id:3', array['id:3', 'name:iman afrikah']::text[], 152),
  ('35', 'id:3', array['id:3', 'name:iman afrikah']::text[], 109.92),
  ('36', 'id:3', array['id:3', 'name:iman afrikah']::text[], 108.48),
  ('4', 'id:4', array['id:4', 'name:nda']::text[], 122.24),
  ('19', 'id:4', array['id:4', 'name:nda']::text[], 128.64),
  ('20', 'id:4', array['id:4', 'name:nda']::text[], 152.6),
  ('21', 'id:4', array['id:4', 'name:nda']::text[], 187.84),
  ('22', 'id:4', array['id:4', 'name:nda']::text[], 139.88),
  ('23', 'id:4', array['id:4', 'name:nda']::text[], 150.96),
  ('24', 'id:4', array['id:4', 'name:nda']::text[], 127.28),
  ('5', 'id:5', array['id:5', 'name:prp']::text[], 124.88),
  ('25', 'id:5', array['id:5', 'name:prp']::text[], 157.72),
  ('26', 'id:5', array['id:5', 'name:prp']::text[], 123.21),
  ('27', 'id:5', array['id:5', 'name:prp']::text[], 126.37),
  ('28', 'id:5', array['id:5', 'name:prp']::text[], 121.64),
  ('29', 'id:5', array['id:5', 'name:prp']::text[], 179.96),
  ('30', 'id:5', array['id:5', 'name:prp']::text[], 130.6),
  ('6', 'id:6', array['id:6', 'name:sanchy']::text[], 164.04),
  ('37', 'id:6', array['id:6', 'name:sanchy']::text[], 176.28),
  ('38', 'id:6', array['id:6', 'name:sanchy']::text[], 104.52),
  ('39', 'id:6', array['id:6', 'name:sanchy']::text[], 140.68),
  ('41', 'id:6', array['id:6', 'name:sanchy']::text[], 178.56),
  ('42', 'id:6', array['id:6', 'name:sanchy']::text[], 139.56),
  ('7', 'id:7', array['id:7', 'name:santana']::text[], 171.52),
  ('43', 'id:7', array['id:7', 'name:santana']::text[], 139.96),
  ('44', 'id:7', array['id:7', 'name:santana']::text[], 153.76),
  ('45', 'id:7', array['id:7', 'name:santana']::text[], 154),
  ('46', 'id:7', array['id:7', 'name:santana']::text[], 158.08),
  ('47', 'id:7', array['id:7', 'name:santana']::text[], 121.6),
  ('48', 'id:7', array['id:7', 'name:santana']::text[], 149.96),
  ('50', 'id:8', array['id:8', 'name:faith']::text[], 104.28),
  ('51', 'id:8', array['id:8', 'name:faith']::text[], 174.32),
  ('52', 'id:8', array['id:8', 'name:faith']::text[], 142.56),
  ('53', 'id:8', array['id:8', 'name:faith']::text[], 164.32),
  ('54', 'id:8', array['id:8', 'name:faith']::text[], 164.28),
  ('55', 'id:8', array['id:8', 'name:faith']::text[], 184.16),
  ('56', 'id:8', array['id:8', 'name:faith']::text[], 223.92),
  ('85', 'id:5', array['id:5', 'name:prp']::text[], 155.92),
  ('86', 'id:5', array['id:5', 'name:prp']::text[], 179.47),
  ('87', 'id:5', array['id:5', 'name:prp']::text[], 213),
  ('88', 'id:5', array['id:5', 'name:prp']::text[], 147.08),
  ('89', 'id:5', array['id:5', 'name:prp']::text[], 176.32),
  ('90', 'id:5', array['id:5', 'name:prp']::text[], 134.6),
  ('91', 'id:5', array['id:5', 'name:prp']::text[], 171.72),
  ('92', 'id:9', array['id:9', 'name:jmn']::text[], 104.88),
  ('93', 'id:9', array['id:9', 'name:jmn']::text[], 184.68),
  ('94', 'id:9', array['id:9', 'name:jmn']::text[], 113.8),
  ('95', 'id:10', array['id:10', 'name:sammie']::text[], 147.16),
  ('96', 'id:10', array['id:10', 'name:sammie']::text[], 159.84),
  ('97', 'id:10', array['id:10', 'name:sammie']::text[], 157.24),
  ('98', 'id:10', array['id:10', 'name:sammie']::text[], 209.02),
  ('99', 'id:10', array['id:10', 'name:sammie']::text[], 156.9),
  ('78', 'id:4', array['id:4', 'name:nda']::text[], 167.48),
  ('79', 'id:4', array['id:4', 'name:nda']::text[], 77.92),
  ('80', 'id:4', array['id:4', 'name:nda']::text[], 164.8),
  ('81', 'id:4', array['id:4', 'name:nda']::text[], 164.8),
  ('82', 'id:4', array['id:4', 'name:nda']::text[], 164.76),
  ('83', 'id:4', array['id:4', 'name:nda']::text[], 118.48),
  ('84', 'id:4', array['id:4', 'name:nda']::text[], 127.93),
  ('64', 'id:3', array['id:3', 'name:iman afrikah']::text[], 146.2),
  ('65', 'id:3', array['id:3', 'name:iman afrikah']::text[], 151.36),
  ('66', 'id:3', array['id:3', 'name:iman afrikah']::text[], 162.2),
  ('67', 'id:3', array['id:3', 'name:iman afrikah']::text[], 119.92),
  ('68', 'id:3', array['id:3', 'name:iman afrikah']::text[], 161.72),
  ('69', 'id:3', array['id:3', 'name:iman afrikah']::text[], 153.48),
  ('70', 'id:3', array['id:3', 'name:iman afrikah']::text[], 150.8),
  ('71', 'id:3', array['id:3', 'name:iman afrikah']::text[], 149.96),
  ('72', 'id:3', array['id:3', 'name:iman afrikah']::text[], 204.4),
  ('73', 'id:3', array['id:3', 'name:iman afrikah']::text[], 350.29),
  ('74', 'id:3', array['id:3', 'name:iman afrikah']::text[], 221.16),
  ('75', 'id:3', array['id:3', 'name:iman afrikah']::text[], 218.21),
  ('76', 'id:3', array['id:3', 'name:iman afrikah']::text[], 267.72),
  ('77', 'id:3', array['id:3', 'name:iman afrikah']::text[], 258.04),
  ('100', 'id:3', array['id:3', 'name:iman afrikah']::text[], 167.96),
  ('101', 'id:3', array['id:3', 'name:iman afrikah']::text[], 158),
  ('102', 'id:3', array['id:3', 'name:iman afrikah']::text[], 135.28),
  ('103', 'id:3', array['id:3', 'name:iman afrikah']::text[], 166.96),
  ('104', 'id:3', array['id:3', 'name:iman afrikah']::text[], 197.56),
  ('105', 'id:3', array['id:3', 'name:iman afrikah']::text[], 152.24),
  ('106', 'id:3', array['id:3', 'name:iman afrikah']::text[], 135.72),
  ('57', 'id:1', array['id:1', 'name:7roo7h']::text[], 197.52),
  ('58', 'id:1', array['id:1', 'name:7roo7h']::text[], 114.52),
  ('59', 'id:1', array['id:1', 'name:7roo7h']::text[], 359.88),
  ('60', 'id:1', array['id:1', 'name:7roo7h']::text[], 134.94),
  ('61', 'id:1', array['id:1', 'name:7roo7h']::text[], 105.18),
  ('62', 'id:1', array['id:1', 'name:7roo7h']::text[], 131.16),
  ('63', 'id:1', array['id:1', 'name:7roo7h']::text[], 147.92),
  ('107', 'id:1', array['id:1', 'name:7roo7h']::text[], 87.22),
  ('108', 'id:1', array['id:1', 'name:7roo7h']::text[], 79.95),
  ('109', 'id:1', array['id:1', 'name:7roo7h']::text[], 101.38),
  ('110', 'id:1', array['id:1', 'name:7roo7h']::text[], 203.26),
  ('111', 'id:1', array['id:1', 'name:7roo7h']::text[], 156.54),
  ('112', 'id:1', array['id:1', 'name:7roo7h']::text[], 128.07),
  ('113', 'id:1', array['id:1', 'name:7roo7h']::text[], 219.83),
  ('114', 'id:1', array['id:1', 'name:7roo7h']::text[], 23.22),
  ('115', 'id:1', array['id:1', 'name:7roo7h']::text[], 195.07),
  ('116', 'id:1', array['id:1', 'name:7roo7h']::text[], 133.98),
  ('117', 'id:1', array['id:1', 'name:7roo7h']::text[], 114.99),
  ('118', 'id:1', array['id:1', 'name:7roo7h']::text[], 169.95),
  ('119', 'id:1', array['id:1', 'name:7roo7h']::text[], 186.23),
  ('204', 'id:1', array['id:1', 'name:7roo7h']::text[], 146.18),
  ('120', 'id:1', array['id:1', 'name:7roo7h']::text[], 138.3),
  ('121', 'id:1', array['id:1', 'name:7roo7h']::text[], 124.9),
  ('122', 'id:1', array['id:1', 'name:7roo7h']::text[], 127.35),
  ('123', 'id:1', array['id:1', 'name:7roo7h']::text[], 122.26),
  ('124', 'id:1', array['id:1', 'name:7roo7h']::text[], 109.71),
  ('125', 'id:1', array['id:1', 'name:7roo7h']::text[], 133.11),
  ('126', 'id:1', array['id:1', 'name:7roo7h']::text[], 79.98),
  ('127', 'id:3', array['id:3', 'name:iman afrikah']::text[], 152.27),
  ('128', 'id:3', array['id:3', 'name:iman afrikah']::text[], 149.59),
  ('129', 'id:3', array['id:3', 'name:iman afrikah']::text[], 150.03),
  ('130', 'id:3', array['id:3', 'name:iman afrikah']::text[], 152.69),
  ('131', 'id:3', array['id:3', 'name:iman afrikah']::text[], 161),
  ('132', 'id:3', array['id:3', 'name:iman afrikah']::text[], 139.33),
  ('133', 'id:3', array['id:3', 'name:iman afrikah']::text[], 218.22),
  ('134', 'id:3', array['id:3', 'name:iman afrikah']::text[], 173.57),
  ('135', 'id:3', array['id:3', 'name:iman afrikah']::text[], 166.16),
  ('136', 'id:3', array['id:3', 'name:iman afrikah']::text[], 152.49),
  ('137', 'id:3', array['id:3', 'name:iman afrikah']::text[], 102.76),
  ('138', 'id:3', array['id:3', 'name:iman afrikah']::text[], 151.18),
  ('139', 'id:3', array['id:3', 'name:iman afrikah']::text[], 169.27),
  ('140', 'id:3', array['id:3', 'name:iman afrikah']::text[], 141.38),
  ('141', 'id:3', array['id:3', 'name:iman afrikah']::text[], 162.43),
  ('142', 'id:3', array['id:3', 'name:iman afrikah']::text[], 160.04),
  ('143', 'id:3', array['id:3', 'name:iman afrikah']::text[], 168.06),
  ('144', 'id:3', array['id:3', 'name:iman afrikah']::text[], 153.4),
  ('145', 'id:3', array['id:3', 'name:iman afrikah']::text[], 131.75),
  ('146', 'id:3', array['id:3', 'name:iman afrikah']::text[], 122.38),
  ('147', 'id:3', array['id:3', 'name:iman afrikah']::text[], 127.88),
  ('148', 'id:4', array['id:4', 'name:nda']::text[], 96.57),
  ('149', 'id:4', array['id:4', 'name:nda']::text[], 90.73),
  ('150', 'id:4', array['id:4', 'name:nda']::text[], 152.57),
  ('151', 'id:4', array['id:4', 'name:nda']::text[], 116.23),
  ('152', 'id:4', array['id:4', 'name:nda']::text[], 150.23),
  ('153', 'id:4', array['id:4', 'name:nda']::text[], 82.67),
  ('154', 'id:4', array['id:4', 'name:nda']::text[], 165),
  ('155', 'id:4', array['id:4', 'name:nda']::text[], 150.23),
  ('156', 'id:4', array['id:4', 'name:nda']::text[], 134.83),
  ('157', 'id:4', array['id:4', 'name:nda']::text[], 213.47),
  ('158', 'id:4', array['id:4', 'name:nda']::text[], 183.13),
  ('159', 'id:4', array['id:4', 'name:nda']::text[], 143),
  ('160', 'id:4', array['id:4', 'name:nda']::text[], 196.9),
  ('161', 'id:4', array['id:4', 'name:nda']::text[], 127.37),
  ('162', 'id:4', array['id:4', 'name:nda']::text[], 115),
  ('163', 'id:4', array['id:4', 'name:nda']::text[], 140.2),
  ('164', 'id:4', array['id:4', 'name:nda']::text[], 102.4),
  ('165', 'id:4', array['id:4', 'name:nda']::text[], 73.03),
  ('166', 'id:4', array['id:4', 'name:nda']::text[], 144.63),
  ('167', 'id:4', array['id:4', 'name:nda']::text[], 132.03),
  ('168', 'id:4', array['id:4', 'name:nda']::text[], 110.1),
  ('169', 'id:4', array['id:4', 'name:nda']::text[], 96.8),
  ('170', 'id:4', array['id:4', 'name:nda']::text[], 86.53),
  ('171', 'id:4', array['id:4', 'name:nda']::text[], 162.83),
  ('172', 'id:4', array['id:4', 'name:nda']::text[], 186.87),
  ('173', 'id:4', array['id:4', 'name:nda']::text[], 130.17),
  ('174', 'id:4', array['id:4', 'name:nda']::text[], 122.7),
  ('175', 'id:4', array['id:4', 'name:nda']::text[], 156.3),
  ('176', 'id:3', array['id:3', 'name:iman afrikah']::text[], 182.44),
  ('177', 'id:3', array['id:3', 'name:iman afrikah']::text[], 253.78),
  ('178', 'id:3', array['id:3', 'name:iman afrikah']::text[], 206.73),
  ('179', 'id:3', array['id:3', 'name:iman afrikah']::text[], 183.51),
  ('180', 'id:3', array['id:3', 'name:iman afrikah']::text[], 214.18),
  ('181', 'id:3', array['id:3', 'name:iman afrikah', 'name:santana']::text[], 176.07),
  ('182', 'id:3', array['id:3', 'name:iman afrikah']::text[], 395.44),
  ('183', 'id:7', array['id:7', 'name:santana']::text[], 165.22),
  ('184', 'id:7', array['id:7', 'name:santana']::text[], 207.83),
  ('185', 'id:7', array['id:7', 'name:santana']::text[], 187.27),
  ('186', 'id:7', array['id:7', 'name:santana']::text[], 192.81),
  ('187', 'id:7', array['id:7', 'name:santana']::text[], 218.2),
  ('188', 'id:7', array['id:7', 'name:santana']::text[], 303.2),
  ('189', 'id:7', array['id:7', 'name:santana']::text[], 202.76),
  ('205', 'id:7', array['id:7', 'name:santana']::text[], 80.07),
  ('206', 'id:7', array['id:7', 'name:santana']::text[], 202.45),
  ('207', 'id:7', array['id:7', 'name:santana']::text[], 208.04),
  ('208', 'id:7', array['id:7', 'name:santana']::text[], 121.23),
  ('209', 'id:7', array['id:7', 'name:santana']::text[], 164),
  ('210', 'id:7', array['id:7', 'name:santana']::text[], 207.57),
  ('211', 'id:7', array['id:7', 'name:santana']::text[], 223.79),
  ('212', 'id:11', array['id:11', 'name:n3m3sis']::text[], 120.61),
  ('214', 'id:11', array['id:11', 'name:n3m3sis']::text[], 138.92),
  ('190', 'id:3', array['id:3', 'name:iman afrikah']::text[], 202.03),
  ('191', 'id:3', array['id:3', 'name:iman afrikah']::text[], 206.73),
  ('192', 'id:3', array['id:3', 'name:iman afrikah']::text[], 184.19),
  ('193', 'id:3', array['id:3', 'name:iman afrikah']::text[], 206.6),
  ('194', 'id:3', array['id:3', 'name:iman afrikah']::text[], 144.04),
  ('195', 'id:3', array['id:3', 'name:iman afrikah']::text[], 140.17),
  ('196', 'id:3', array['id:3', 'name:iman afrikah']::text[], 191.48),
  ('197', 'id:3', array['id:3', 'name:iman afrikah']::text[], 105.35),
  ('198', 'id:3', array['id:3', 'name:iman afrikah']::text[], 167.92),
  ('199', 'id:3', array['id:3', 'name:iman afrikah']::text[], 147.88),
  ('200', 'id:3', array['id:3', 'name:iman afrikah']::text[], 173.48),
  ('201', 'id:3', array['id:3', 'name:iman afrikah']::text[], 173.58),
  ('202', 'id:3', array['id:3', 'name:iman afrikah']::text[], 199.29),
  ('203', 'id:3', array['id:3', 'name:iman afrikah']::text[], 151.59),
  ('215', 'id:3', array['id:3', 'name:iman afrikah']::text[], 168.62),
  ('216', 'id:3', array['id:3', 'name:iman afrikah']::text[], 167),
  ('217', 'id:3', array['id:3', 'name:iman afrikah']::text[], 183.07),
  ('218', 'id:3', array['id:3', 'name:iman afrikah']::text[], 160.73),
  ('219', 'id:3', array['id:3', 'name:iman afrikah']::text[], 236.85),
  ('220', 'id:3', array['id:3', 'name:iman afrikah']::text[], 214.86),
  ('221', 'id:3', array['id:3', 'name:iman afrikah']::text[], 241.03),
  ('222', 'id:3', array['id:3', 'name:iman afrikah', 'name:rvssian']::text[], 158.85),
  ('223', 'id:7', array['id:7', 'name:santana', 'name:rvssian']::text[], 157.28),
  ('224', 'id:3', array['id:3', 'name:iman afrikah']::text[], 104.02),
  ('225', 'id:3', array['id:3', 'name:iman afrikah']::text[], 122.02),
  ('226', 'id:3', array['id:3', 'name:iman afrikah']::text[], 181.58),
  ('227', 'id:3', array['id:3', 'name:iman afrikah']::text[], 123.87),
  ('228', 'id:3', array['id:3', 'name:iman afrikah']::text[], 189.47),
  ('229', 'id:3', array['id:3', 'name:iman afrikah']::text[], 186.28),
  ('230', 'id:3', array['id:3', 'name:iman afrikah']::text[], 172.85),
  ('231', 'id:3', array['id:3', 'name:iman afrikah']::text[], 151.69),
  ('232', 'id:11', array['id:11', 'name:n3m3sis']::text[], 138.71),
  ('233', 'id:11', array['id:11', 'name:n3m3sis']::text[], 278.91),
  ('234', 'id:11', array['id:11', 'name:n3m3sis']::text[], 278.91)
on conflict (song_id) do update set lead_key = excluded.lead_key, artist_keys = excluded.artist_keys, duration_seconds = coalesce(excluded.duration_seconds, public.room_founding_songs.duration_seconds);
