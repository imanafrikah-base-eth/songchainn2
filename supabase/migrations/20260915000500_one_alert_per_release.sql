-- One alert per release, not one per track.
--
-- Releasing N3M3SIS's TSUNAMIS EP (7 tracks, 15 Sep 2026) sent every follower
-- seven "New release" notifications in the same second, and Mo$ha's post said
-- "7 new records" instead of naming the EP. A track that belongs to a release
-- now folds into that release's single alert, which names the release and
-- counts its tracks. Singles with no release row behave as before.

create or replace function public.release_label(p_release uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.title
         || case
              when n.c > 1 then ', a ' || n.c || ' track ' || case r.kind when 'ep' then 'EP' when 'album' then 'album' else 'release' end
              else ''
            end
    from public.releases r
    cross join lateral (
      select count(*)::int as c from public.songs s where s.release_id = r.id and s.status = 'published'
    ) n
   where r.id = p_release;
$$;

create or replace function public.notify_new_release()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if new.release_id is not null then
    v_label := public.release_label(new.release_id);
  end if;
  v_msg := v_artist || ' just released ' || coalesce(v_label, new.title, 'a new record');
  v_meta := jsonb_build_object('song_id', new.id, 'artist_id', new.artist_id, 'artist_name', new.artist_name, 'title', new.title)
            || case when new.release_id is not null then jsonb_build_object('release_id', new.release_id) else '{}'::jsonb end;

  for r in
    select distinct u.user_id from (
      select la.user_id from public.liked_artists la where la.artist_id = new.artist_id
      union
      select f.follower_id as user_id from public.user_follows f where new.owner_id is not null and f.following_id = new.owner_id
    ) u
  loop
    if new.release_id is not null then
      -- Another track of the same release already told this person: update that one alert.
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
$function$;

create or replace function public.mosha_announce_release()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mosha  uuid := '0e2f6d3a-8b1c-4f7e-9a5d-3c4b2a1f0e9d';
  v_recent uuid;
  v_count  integer;
  v_artist text;
  v_label  text;
  v_body   text;
begin
  -- Only the moment a record becomes live, and never twice for the same one.
  if new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'published' then return new; end if;

  -- Not yet out. Say nothing until the day it is.
  if new.release_date is not null and new.release_date > current_date then return new; end if;
  if new.release_at is not null and new.release_at > now() then return new; end if;

  -- A record with no artist page cannot be opened from a post.
  if new.artist_id is null then return new; end if;

  v_artist := coalesce(new.artist_name, 'An artist');
  if new.release_id is not null then
    v_label := public.release_label(new.release_id);
  end if;

  -- Did Mo$ha already speak for this artist (or this release) in the last ten minutes?
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
$function$;

-- Putting a held release out dates the release itself, not only its tracks.
create or replace function public.release_held(p_song_ids text[], p_release_at timestamp with time zone default null::timestamp with time zone)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  v_at timestamptz := case when p_release_at is null or p_release_at <= now() then null else p_release_at end;
  v_count integer;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;

  perform set_config('songchainn.release_action', 'on', true);
  update public.songs s
     set status = 'published',
         release_at = v_at,
         release_date = case when v_at is null then current_date else (v_at at time zone 'utc')::date end
   where s.id = any (coalesce(p_song_ids, '{}'::text[]))
     and s.status = 'held'
     and (s.owner_id = me or exists (
       select 1 from public.artist_accounts a where a.user_id = me and a.artist_id = s.artist_id
     ));
  get diagnostics v_count = row_count;
  perform set_config('songchainn.release_action', '', true);

  if v_count = 0 then
    raise exception 'None of those are held records of yours.';
  end if;

  update public.releases r
     set release_date = case when v_at is null then current_date else (v_at at time zone 'utc')::date end,
         updated_at = now()
   where r.id in (select s.release_id from public.songs s where s.id = any (p_song_ids) and s.release_id is not null);

  return v_count;
end;
$function$;

revoke all on function public.release_label(uuid) from public, anon;
grant execute on function public.release_label(uuid) to authenticated, service_role;
