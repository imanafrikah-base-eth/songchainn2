-- The small things a store that distributes to itself has to have.
--
--   1. is_artist() written down. Two earlier migrations call it and none
--      defined it, so a fresh database could not be built from this folder.
--   2. Releases: an EP or album is a real row, songs carry a release_id and a
--      track_number, and an uploading artist is no longer forced to "Single".
--   3. A release date in the future keeps a published song out of the public
--      catalog until that day. The artist still sees it in the Studio.
--   4. Links that belong on an artist page: Spotify, Instagram, YouTube,
--      TikTok, SoundCloud, Apple Music and a booking email.
--   5. Notifications that fire for the things people actually do: a follow, a
--      like, a comment, a record going live from an artist you follow, and a
--      claim being approved or rejected. Until now none of these wrote a row.

-- ------------------------------------------------------------ is_artist ---

create or replace function public.is_artist(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.artist_accounts a where a.user_id = uid);
$$;

-- ------------------------------------------------------------- releases ---

create table if not exists public.releases (
  id            uuid primary key default gen_random_uuid(),
  artist_id     text not null,
  owner_id      uuid references auth.users(id) on delete set null,
  title         text not null,
  kind          text not null default 'ep' check (kind in ('single', 'ep', 'album')),
  cover_art_url text,
  release_date  date,
  upc           text,
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists releases_artist_id_idx on public.releases (artist_id);
create index if not exists releases_owner_id_idx  on public.releases (owner_id);

alter table public.songs add column if not exists release_id   uuid references public.releases(id) on delete set null;
alter table public.songs add column if not exists track_number integer check (track_number is null or track_number > 0);
create index if not exists songs_release_id_idx on public.songs (release_id);

alter table public.releases enable row level security;

drop policy if exists "Anyone can read releases" on public.releases;
create policy "Anyone can read releases"
  on public.releases for select
  using (true);

-- The same rule the songs table uses: the row's owner, or whoever holds the
-- artist page the release belongs to.
drop policy if exists "Artists manage own releases" on public.releases;
create policy "Artists manage own releases"
  on public.releases for all
  to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (select 1 from public.artist_accounts a
                where a.user_id = (select auth.uid()) and a.artist_id = releases.artist_id)
  )
  with check (
    (owner_id = (select auth.uid()) or owner_id is null)
    and exists (select 1 from public.artist_accounts a
                 where a.user_id = (select auth.uid()) and a.artist_id = releases.artist_id)
  );

create or replace function public.releases_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists releases_touch_trg on public.releases;
create trigger releases_touch_trg
  before update on public.releases
  for each row execute function public.releases_touch();

-- ---------------------------------------------------- scheduled release ---

-- A published song with a release date still ahead is the artist's to see
-- and nobody else's. The day arrives, the row simply starts matching.
drop policy if exists "Public can read published songs" on public.songs;
create policy "Public can read published songs"
  on public.songs for select
  using (is_published = true and (release_date is null or release_date <= current_date));

-- --------------------------------------------------------- artist links ---

alter table public.audience_profiles add column if not exists spotify_url     text;
alter table public.audience_profiles add column if not exists instagram_url   text;
alter table public.audience_profiles add column if not exists youtube_url     text;
alter table public.audience_profiles add column if not exists tiktok_url      text;
alter table public.audience_profiles add column if not exists soundcloud_url  text;
alter table public.audience_profiles add column if not exists apple_music_url text;
alter table public.audience_profiles add column if not exists booking_email   text;

-- -------------------------------------------------------- notifications ---

-- One writer for every social notification, so the rules live in one place:
-- never notify yourself, never notify across a block, and never write the
-- same follow twice in a day.
create or replace function public.write_notification(
  p_user uuid,
  p_from uuid,
  p_type text,
  p_title text,
  p_message text,
  p_post uuid default null,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or p_user = p_from then return; end if;
  if p_from is not null and exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = p_user and b.blocked_id = p_from)
        or (b.blocker_id = p_from and b.blocked_id = p_user)
  ) then return; end if;
  if p_type = 'follow' and exists (
    select 1 from public.notifications n
     where n.user_id = p_user and n.from_user_id = p_from and n.type = 'follow'
       and n.created_at > now() - interval '1 day'
  ) then return; end if;

  insert into public.notifications (user_id, from_user_id, type, title, message, body, post_id, metadata, is_read)
  values (p_user, p_from, p_type, p_title, p_message, p_message, p_post, coalesce(p_meta, '{}'::jsonb), false);
end $$;

revoke execute on function public.write_notification(uuid, uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.display_name_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- Never an email address: some accounts carry their login as a username,
  -- and a follow notification must not hand that to a stranger.
  select coalesce(
    nullif(case when p.display_name like '%@%' then null else nullif(p.display_name, '') end, ''),
    nullif(case when p.profile_name like '%@%' then null else nullif(p.profile_name, '') end, ''),
    nullif(case when p.username     like '%@%' then null else nullif(p.username, '')     end, ''),
    'Someone'
  )
    from public.audience_profiles p
   where p.user_id = p_user
   limit 1;
$$;

create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.write_notification(
    new.following_id, new.follower_id, 'follow',
    'New follower',
    coalesce(public.display_name_of(new.follower_id), 'Someone') || ' started following you',
    null, '{}'::jsonb
  );
  return new;
end $$;

drop trigger if exists notify_new_follower_trg on public.user_follows;
create trigger notify_new_follower_trg
  after insert on public.user_follows
  for each row execute function public.notify_new_follower();

create or replace function public.notify_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.social_posts where id = new.post_id;
  perform public.write_notification(
    v_owner, new.user_id, 'like',
    'New like',
    coalesce(public.display_name_of(new.user_id), 'Someone') || ' liked your post',
    new.post_id, '{}'::jsonb
  );
  return new;
end $$;

drop trigger if exists notify_post_like_trg on public.post_likes;
create trigger notify_post_like_trg
  after insert on public.post_likes
  for each row execute function public.notify_post_like();

create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.social_posts where id = new.post_id;
  perform public.write_notification(
    v_owner, new.user_id, 'comment',
    'New comment',
    coalesce(public.display_name_of(new.user_id), 'Someone') || ' commented: ' || left(coalesce(new.content, ''), 80),
    new.post_id, jsonb_build_object('comment_id', new.id)
  );
  return new;
end $$;

drop trigger if exists notify_post_comment_trg on public.post_comments;
create trigger notify_post_comment_trg
  after insert on public.post_comments
  for each row execute function public.notify_post_comment();

-- A record going live reaches everyone who follows the artist page and
-- everyone who follows the person behind it. A scheduled record waits for
-- its day and is announced then by the same rule, so nobody hears about a
-- song they cannot yet play.
create or replace function public.notify_new_release()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_meta jsonb;
begin
  if new.status <> 'published' or (old.status is not distinct from 'published') then return new; end if;
  if new.release_date is not null and new.release_date > current_date then return new; end if;
  v_meta := jsonb_build_object('song_id', new.id, 'artist_id', new.artist_id, 'artist_name', new.artist_name, 'title', new.title);
  for r in
    select distinct u.user_id from (
      select la.user_id from public.liked_artists la where la.artist_id = new.artist_id
      union
      select f.follower_id as user_id from public.user_follows f where new.owner_id is not null and f.following_id = new.owner_id
    ) u
  loop
    perform public.write_notification(
      r.user_id, new.owner_id, 'new_release',
      'New release',
      coalesce(new.artist_name, 'An artist you follow') || ' just released ' || coalesce(new.title, 'a new record'),
      null, v_meta
    );
  end loop;
  return new;
end $$;

drop trigger if exists notify_new_release_trg on public.songs;
create trigger notify_new_release_trg
  after update of status on public.songs
  for each row execute function public.notify_new_release();

-- Scheduled records: announce them on the day. pg_cron runs this at 00:05 UTC
-- when the extension is present; without it the songs simply appear and the
-- announcement is skipped.
create or replace function public.announce_scheduled_releases()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  f record;
  n integer := 0;
begin
  for s in
    select * from public.songs
     where status = 'published' and release_date = current_date
  loop
    for f in
      select distinct u.user_id from (
        select la.user_id from public.liked_artists la where la.artist_id = s.artist_id
        union
        select fo.follower_id from public.user_follows fo where s.owner_id is not null and fo.following_id = s.owner_id
      ) u
    loop
      if not exists (
        select 1 from public.notifications x
         where x.user_id = f.user_id and x.type = 'new_release' and x.metadata->>'song_id' = s.id
      ) then
        perform public.write_notification(
          f.user_id, s.owner_id, 'new_release', 'New release',
          coalesce(s.artist_name, 'An artist you follow') || ' just released ' || coalesce(s.title, 'a new record'),
          null, jsonb_build_object('song_id', s.id, 'artist_id', s.artist_id, 'artist_name', s.artist_name, 'title', s.title)
        );
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;

revoke execute on function public.announce_scheduled_releases() from public, anon, authenticated;

create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'announce_scheduled_releases';
  perform cron.schedule('announce_scheduled_releases', '5 0 * * *', 'select public.announce_scheduled_releases()');
end $$;

-- ------------------------------------------------- claim notifications ---

create or replace function public.approve_artist_claim(p_claim_id uuid, p_verify boolean default true)
returns public.artist_accounts
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_claim public.artist_claims;
  v_account public.artist_accounts;
  v_loser record;
begin
  if not exists (
    select 1 from public.user_roles ur
     where ur.user_id = auth.uid() and ur.role = 'admin'::app_role
  ) then
    raise exception 'only an admin can hand over an artist page';
  end if;

  select * into v_claim from public.artist_claims where id = p_claim_id for update;
  if v_claim.id is null then raise exception 'claim not found'; end if;
  if v_claim.status <> 'pending' then raise exception 'that claim was already reviewed'; end if;

  insert into public.artist_accounts (artist_id, user_id, is_verified, claimed_at)
  values (v_claim.artist_id, v_claim.user_id, coalesce(p_verify, true), now())
  on conflict (artist_id) do update
    set user_id     = excluded.user_id,
        is_verified = excluded.is_verified,
        claimed_at  = excluded.claimed_at,
        updated_at  = now()
  returning * into v_account;

  update public.artist_claims
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_claim_id;

  for v_loser in
    select user_id from public.artist_claims
     where artist_id = v_claim.artist_id and id <> p_claim_id and status = 'pending'
  loop
    perform public.write_notification(
      v_loser.user_id, null, 'artist_claim', 'Artist page claim',
      'Your claim on this artist page was not approved. Write to songchaindao@gmail.com if you think that is wrong.',
      null, jsonb_build_object('status', 'rejected', 'artist_id', v_claim.artist_id)
    );
  end loop;

  update public.artist_claims
     set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
   where artist_id = v_claim.artist_id
     and id <> p_claim_id
     and status = 'pending';

  perform public.write_notification(
    v_claim.user_id, null, 'artist_claim', 'Your artist page is yours',
    'Your claim was approved. The Studio is open: upload, edit details and take records on chain.',
    null, jsonb_build_object('status', 'approved', 'artist_id', v_claim.artist_id)
  );

  return v_account;
end $fn$;

create or replace function public.reject_artist_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_claim public.artist_claims;
begin
  if not exists (
    select 1 from public.user_roles ur
     where ur.user_id = auth.uid() and ur.role = 'admin'::app_role
  ) then
    raise exception 'only an admin can review claims';
  end if;
  select * into v_claim from public.artist_claims where id = p_claim_id and status = 'pending';
  if v_claim.id is null then return; end if;
  update public.artist_claims
     set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_claim_id;
  perform public.write_notification(
    v_claim.user_id, null, 'artist_claim', 'Artist page claim',
    'Your claim was not approved. Write to songchaindao@gmail.com if you think that is wrong.',
    null, jsonb_build_object('status', 'rejected', 'artist_id', v_claim.artist_id)
  );
end $fn$;
