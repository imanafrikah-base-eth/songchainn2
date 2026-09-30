-- Taking a break without leaving. An artist's records, pictures and clips and
-- world go quiet together and come back exactly as they were, on the day they
-- chose or when they say so. Asked for by N3M3SIS on 21 Sep 2026: "go dark",
-- a three month break, "I don't want to delete". Nothing is deleted here.

create table if not exists public.artist_pauses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  artist_id text,
  paused_at timestamptz not null default now(),
  resume_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb
);
alter table public.artist_pauses enable row level security;
drop policy if exists "own pause" on public.artist_pauses;
create policy "own pause" on public.artist_pauses for select to authenticated using (user_id = auth.uid());
grant select on public.artist_pauses to authenticated;

-- Which artists are away right now. Everyone's catalogue reads this to leave
-- their founding records out too, which live in the app, not in songs rows
-- with an owner.
create or replace view public.paused_artists as
  select artist_id, resume_at from public.artist_pauses where artist_id is not null;
grant select on public.paused_artists to anon, authenticated;

create or replace function public.pause_my_music(p_until timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_artist text;
  v_songs text[];
  v_media uuid[];
  v_worlds uuid[];
begin
  if me is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.artist_pauses where user_id = me) then
    return jsonb_build_object('already', true);
  end if;

  select a.artist_id into v_artist from public.artist_accounts a where a.user_id = me order by a.created_at limit 1;
  if v_artist is null then
    select s.artist_id into v_artist from public.songs s where s.owner_id = me and s.artist_id is not null order by s.created_at limit 1;
  end if;

  with h as (
    update public.songs set status = 'held', is_published = false
     where owner_id = me and status = 'published'
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_songs from h;

  with m as (
    update public.artist_media set is_published = false
     where user_id = me and is_published
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_media from m;

  with w as (
    update public.worlds set status = 'quiet', updated_at = now()
     where owner_id = me and status = 'published'
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_worlds from w;

  insert into public.artist_pauses (user_id, artist_id, resume_at, snapshot)
  values (me, v_artist, p_until, jsonb_build_object('songs', to_jsonb(v_songs), 'media', to_jsonb(v_media), 'worlds', to_jsonb(v_worlds)));

  return jsonb_build_object(
    'artist_id', v_artist,
    'songs', coalesce(array_length(v_songs, 1), 0),
    'media', coalesce(array_length(v_media, 1), 0),
    'worlds', coalesce(array_length(v_worlds, 1), 0),
    'resume_at', p_until
  );
end
$$;

-- Everything back as it was. Quiet: the release triggers must not announce
-- an old record as new when it comes back.
create or replace function public._restore_pause(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.artist_pauses%rowtype;
  n_songs integer := 0;
  n_media integer := 0;
  n_worlds integer := 0;
begin
  select * into r from public.artist_pauses where user_id = p_user;
  if r.user_id is null then return jsonb_build_object('nothing', true); end if;

  perform set_config('songchainn.quiet_restore', 'on', true);

  update public.songs set status = 'published', is_published = true
   where owner_id = p_user and status = 'held'
     and id in (select jsonb_array_elements_text(coalesce(r.snapshot->'songs', '[]'::jsonb)));
  get diagnostics n_songs = row_count;

  update public.artist_media set is_published = true
   where user_id = p_user and not is_published
     and id::text in (select jsonb_array_elements_text(coalesce(r.snapshot->'media', '[]'::jsonb)));
  get diagnostics n_media = row_count;

  update public.worlds set status = 'published', updated_at = now()
   where owner_id = p_user and status = 'quiet'
     and id::text in (select jsonb_array_elements_text(coalesce(r.snapshot->'worlds', '[]'::jsonb)));
  get diagnostics n_worlds = row_count;

  delete from public.artist_pauses where user_id = p_user;
  return jsonb_build_object('songs', n_songs, 'media', n_media, 'worlds', n_worlds);
end
$$;
revoke all on function public._restore_pause(uuid) from public, anon, authenticated;

create or replace function public.resume_my_music()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return public._restore_pause(auth.uid());
end
$$;

create or replace function public.resume_expired_pauses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select user_id from public.artist_pauses where resume_at is not null and resume_at <= now() loop
    perform public._restore_pause(r.user_id);
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke all on function public.resume_expired_pauses() from public, anon, authenticated;

revoke all on function public.pause_my_music(timestamptz) from public, anon;
grant execute on function public.pause_my_music(timestamptz) to authenticated;
revoke all on function public.resume_my_music() from public, anon;
grant execute on function public.resume_my_music() to authenticated;

select cron.schedule('resume-expired-pauses', '17 * * * *', 'select public.resume_expired_pauses();');

-- The Room leaves a resting artist's records out, founding and uploaded.
create or replace function public.room_catalog()
returns table(song_id text, lead_key text, artist_keys text[], duration_seconds numeric, length_known boolean)
language sql
stable
security definer
set search_path = public
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
    left join public.room_song_lengths l on l.song_id = e.song_id
   where not exists (
     select 1 from public.artist_pauses pa
      where pa.artist_id is not null and ('id:' || lower(pa.artist_id)) = any (e.artist_keys)
   );
$$;

-- A record going live tells its owner too (they only ever saw an on-screen
-- moment if the app was open), and nothing is announced when a break ends.
create or replace function public.notify_new_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_meta jsonb;
  v_label text;
  v_msg text;
  v_artist text := coalesce(new.artist_name, 'An artist you follow');
begin
  if new.status <> 'published' or (old.status is not distinct from 'published') then return new; end if;
  if new.release_date is not null and new.release_date > current_date then return new; end if;
  if new.release_at is not null and new.release_at > now() then return new; end if;
  if coalesce(current_setting('songchainn.quiet_restore', true), '') = 'on' then return new; end if;

  if new.release_id is not null then
    v_label := public.release_label(new.release_id);
  end if;
  v_msg := v_artist || ' just released ' || coalesce(v_label, new.title, 'a new record');
  v_meta := jsonb_build_object('song_id', new.id, 'artist_id', new.artist_id, 'artist_name', new.artist_name, 'title', new.title)
            || case when new.release_id is not null then jsonb_build_object('release_id', new.release_id) else '{}'::jsonb end;

  if new.owner_id is not null and not (
    new.release_id is not null and exists (
      select 1 from public.notifications n
       where n.user_id = new.owner_id and n.type = 'announcement'
         and n.metadata->>'kind' = 'record_live' and n.metadata->>'release_id' = new.release_id::text
         and n.created_at > now() - interval '1 day'
    )
  ) then
    perform public.write_notification(
      new.owner_id, null, 'announcement', 'Your record is live',
      coalesce(v_label, new.title, 'Your record') || ' is live on SONGCHAINN. Share it and it starts moving.',
      null, v_meta || jsonb_build_object('kind', 'record_live', 'cta_path', '/studio')
    );
  end if;

  for r in
    select distinct u.user_id from (
      select la.user_id from public.liked_artists la where la.artist_id = new.artist_id
      union
      select f.follower_id as user_id from public.user_follows f where new.owner_id is not null and f.following_id = new.owner_id
    ) u
  loop
    if new.release_id is not null then
      update public.notifications n
         set message = v_msg,
             body = v_msg,
             is_read = false
       where n.user_id = r.user_id
         and n.type = 'new_release'
         and n.metadata->>'release_id' = new.release_id::text
         and n.created_at > now() - interval '1 day';
      if found then continue; end if;
    end if;
    perform public.write_notification(r.user_id, new.owner_id, 'new_release', 'New release', v_msg, null, v_meta);
  end loop;
  return new;
end
$$;

create or replace function public.mosha_announce_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mosha  uuid := '0e2f6d3a-8b1c-4f7e-9a5d-3c4b2a1f0e9d';
  v_recent uuid;
  v_count  integer;
  v_artist text;
  v_label  text;
  v_body   text;
begin
  if new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'published' then return new; end if;
  if new.release_date is not null and new.release_date > current_date then return new; end if;
  if new.release_at is not null and new.release_at > now() then return new; end if;
  if new.artist_id is null then return new; end if;
  if coalesce(current_setting('songchainn.quiet_restore', true), '') = 'on' then return new; end if;

  v_artist := coalesce(new.artist_name, 'An artist');
  if new.release_id is not null then
    v_label := public.release_label(new.release_id);
  end if;

  select p.id into v_recent
    from public.social_posts p
   where p.user_id = v_mosha
     and p.post_type = 'song_share'
     and p.artist_id = new.artist_id
     and p.is_deleted = false
     and p.created_at > now() - interval '10 minutes'
   order by p.created_at desc
   limit 1;

  if v_recent is not null then
    v_count := coalesce((select (metadata->>'track_count')::int from public.social_posts where id = v_recent), 1) + 1;
    update public.social_posts
       set content = case
                       when v_label is not null then v_artist || ' just dropped ' || v_label || '. Go and hear it.'
                       else v_artist || ' just put ' || v_count || ' new records up. Go and hear them.'
                     end,
           metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object('track_count', v_count, 'latest_song_id', new.id)
                      || case when new.release_id is not null then jsonb_build_object('release_id', new.release_id) else '{}'::jsonb end,
           updated_at = now()
     where id = v_recent;
    return new;
  end if;

  v_body := v_artist || ' just ' || case when v_label is not null then 'dropped ' || v_label else 'put ' || coalesce(new.title, 'a new record') || ' up' end || '. Go and hear it.';

  insert into public.social_posts (user_id, post_type, content, song_id, artist_id, metadata, visibility)
  values (
    v_mosha, 'song_share', v_body, new.id, new.artist_id,
    jsonb_build_object('announcement', 'new_release', 'track_count', 1, 'latest_song_id', new.id)
      || case when new.release_id is not null then jsonb_build_object('release_id', new.release_id) else '{}'::jsonb end,
    'public'
  );

  return new;
end
$$;
