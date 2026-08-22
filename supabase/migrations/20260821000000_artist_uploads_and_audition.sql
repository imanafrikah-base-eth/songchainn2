-- Artist self-serve releases: ownership, the audition pipeline, and the rule
-- that nothing reaches the public catalog without passing the gate.
--
-- Model:
--   * An artist signs up and can upload immediately. No wallet required.
--   * A wallet (audience_profiles.wallet_address) is only needed to coin a
--     track, never to release one.
--   * status is the pipeline state; is_published stays the public-read gate
--     that existing policies and usePublishedCatalog already rely on. A
--     trigger keeps them consistent so a workshop track can never leak.

-- ---------------------------------------------------------------- songs ---

alter table public.songs
  add column if not exists owner_id         uuid references auth.users(id) on delete set null,
  add column if not exists status           text,
  add column if not exists audition         jsonb,
  add column if not exists storage_key      text,
  add column if not exists duration_seconds numeric,
  add column if not exists file_bytes       bigint,
  add column if not exists published_at     timestamptz;

-- Existing catalog is the founder's, already live: derive its state.
update public.songs
   set status = case when coalesce(is_published, false) then 'published' else 'workshop' end
 where status is null;

update public.songs
   set published_at = created_at
 where published_at is null and status = 'published';

alter table public.songs
  alter column status set default 'uploading',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'songs_status_check'
  ) then
    alter table public.songs
      add constraint songs_status_check
      check (status in ('uploading', 'auditioning', 'published', 'workshop'));
  end if;
end $$;

create index if not exists songs_owner_id_idx  on public.songs (owner_id);
create index if not exists songs_status_idx    on public.songs (status);
create index if not exists songs_published_idx on public.songs (published_at desc)
  where status = 'published';

-- is_published is derived from status, always. Nothing can publish itself by
-- writing the boolean directly.
create or replace function public.songs_sync_published()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.is_published := (new.status = 'published');
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

drop trigger if exists songs_sync_published_trg on public.songs;
create trigger songs_sync_published_trg
  before insert or update on public.songs
  for each row execute function public.songs_sync_published();

-- An artist may edit their own track's metadata, but may never move it along
-- the pipeline. Only the service role (the audition function) does that.
create or replace function public.songs_guard_pipeline()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- No end user in context: the service role (audition function), an admin
  -- SQL session, or a trigger. Anonymous requests never reach here because
  -- every update policy on this table already requires owner_id = auth.uid().
  if auth.uid() is null then
    return new;
  end if;
  if exists (
    select 1 from public.user_roles ur
     where ur.user_id = auth.uid() and ur.role = 'admin'::app_role
  ) then
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'status is set by the audition, not by hand';
  end if;
  if new.audition is distinct from old.audition then
    raise exception 'audition results are written by $HIKULU and NAKULU only';
  end if;
  if new.owner_id is distinct from old.owner_id then
    raise exception 'ownership cannot be reassigned';
  end if;
  return new;
end $$;

drop trigger if exists songs_guard_pipeline_trg on public.songs;
create trigger songs_guard_pipeline_trg
  before update on public.songs
  for each row execute function public.songs_guard_pipeline();

-- ------------------------------------------------------------ policies ---

-- Artists see everything they own, at any stage. This is what makes the
-- private workshop private: nobody can browse who did not make it.
drop policy if exists "Artists read own songs" on public.songs;
create policy "Artists read own songs"
  on public.songs for select
  to authenticated
  using (owner_id = auth.uid());

-- Uploads land unpublished and unauditioned. The gate decides the rest.
drop policy if exists "Artists insert own songs" on public.songs;
create policy "Artists insert own songs"
  on public.songs for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and status = 'uploading'
    and audition is null
  );

drop policy if exists "Artists update own songs" on public.songs;
create policy "Artists update own songs"
  on public.songs for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Artists delete own unpublished songs" on public.songs;
create policy "Artists delete own unpublished songs"
  on public.songs for delete
  to authenticated
  using (owner_id = auth.uid() and status <> 'published');

-- ------------------------------------------------- per-artist upload cap ---

create or replace function public.artist_upload_count(p_user uuid, p_since interval)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.songs
   where owner_id = p_user
     and created_at > now() - p_since;
$$;

-- Service role only: this is called by the upload-url edge function. Left open
-- to anon it would let anyone count any artist's uploads.
revoke execute on function public.artist_upload_count(uuid, interval) from public;
revoke execute on function public.artist_upload_count(uuid, interval) from anon;
revoke execute on function public.artist_upload_count(uuid, interval) from authenticated;
grant execute on function public.artist_upload_count(uuid, interval) to service_role;

comment on column public.songs.owner_id is
  'The artist who uploaded this. Null for the founding catalog.';
comment on column public.songs.status is
  'uploading -> auditioning -> published | workshop. Set by the audition only.';
comment on column public.songs.audition is
  'Measured result plus the $HIKULU and NAKULU note. Written by the edge function.';
