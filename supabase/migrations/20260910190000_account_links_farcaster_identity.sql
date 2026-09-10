-- One person, several logins.
--
-- Three real people are here twice or three times: an email account, a
-- Farcaster auto-login, a placeholder we made for them. Nothing tied those
-- together, so their work sat in whichever login happened to make it and the
-- app treated them as strangers to each other.
--
-- Two tables fix that. account_links says "these logins are the same person",
-- and it takes both sides saying so (or the founder saying it) before
-- anything moves. farcaster_identities says which account a Farcaster ID
-- should actually sign into, so a person who came in through Farcaster once
-- lands on their real account from then on.
--
-- Nothing here merges anyone automatically. The person chooses, and what
-- they built is moved rather than deleted.

create table if not exists public.account_links (
  id                   uuid primary key default gen_random_uuid(),
  primary_user_id      uuid not null references auth.users(id) on delete cascade,
  linked_user_id       uuid not null references auth.users(id) on delete cascade,
  confirmed_by_primary boolean not null default false,
  confirmed_by_linked  boolean not null default false,
  linked_by_admin      uuid references auth.users(id) on delete set null,
  applied_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint account_links_not_self check (primary_user_id <> linked_user_id),
  constraint account_links_one_home unique (linked_user_id)
);
create index if not exists account_links_primary_idx on public.account_links (primary_user_id);

alter table public.account_links enable row level security;
drop policy if exists account_links_mine on public.account_links;
create policy account_links_mine on public.account_links for select to authenticated
  using (primary_user_id = auth.uid() or linked_user_id = auth.uid()
         or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role));
grant select on public.account_links to authenticated;

create table if not exists public.farcaster_identities (
  fid        bigint primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  set_by     uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists farcaster_identities_user_idx on public.farcaster_identities (user_id);
alter table public.farcaster_identities enable row level security;
drop policy if exists farcaster_identities_mine on public.farcaster_identities;
create policy farcaster_identities_mine on public.farcaster_identities for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role));
grant select on public.farcaster_identities to authenticated;

/** How much of a world actually exists: streets, what is on them, its art. */
create or replace function public.world_richness(p_world uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (select count(*) from public.world_streets s where s.world_id = w.id) * 2
         + (select count(*) from public.world_blocks b join public.world_streets s on s.id = b.street_id where s.world_id = w.id) * 3
         + (case when w.hero_image is not null then 5 else 0 end)
         + (case when w.entrance_poster is not null then 5 else 0 end)
         + (case when w.entrance_video is not null then 5 else 0 end)
         + coalesce(array_length(w.story, 1), 0) * 2
         + (case when w.status = 'published' then 100 else 0 end)
      from public.worlds w where w.id = p_world
  ), 0);
$$;
grant execute on function public.world_richness(uuid) to authenticated, anon;

/**
 * The other logins that look like this person: the same name, or already
 * linked. Enough about each to recognise your own (how you signed in, a
 * masked address, what it holds), never enough to be useful to a stranger.
 */
create or replace function public.my_duplicate_accounts()
returns table (
  user_id uuid,
  display_name text,
  how_they_signed_in text,
  created_at timestamptz,
  is_verified_artist boolean,
  worlds int,
  songs int,
  media int,
  link_state text,
  is_primary boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.user_id, lower(btrim(coalesce(p.display_name, ''))) as name
      from public.audience_profiles p
     where p.user_id = auth.uid()
  ),
  others as (
    select p.user_id
      from public.audience_profiles p, me
     where p.user_id <> me.user_id
       and coalesce(me.name, '') <> ''
       and lower(btrim(coalesce(p.display_name, ''))) = me.name
    union
    select l.linked_user_id from public.account_links l where l.primary_user_id = auth.uid()
    union
    select l.primary_user_id from public.account_links l where l.linked_user_id = auth.uid()
  )
  select
    p.user_id,
    p.display_name,
    case
      when u.email like 'fid-%@farcaster.songchainn.xyz' then 'Farcaster'
      when u.email like '%@artists.songchainn.xyz' then 'A page we set up for you'
      when u.raw_app_meta_data->>'provider' = 'google' then 'Google, ' || left(u.email, 1) || '...@' || split_part(u.email, '@', 2)
      else left(coalesce(u.email, '?'), 1) || '...@' || split_part(coalesce(u.email, '?@?'), '@', 2)
    end,
    p.created_at,
    exists (select 1 from public.artist_accounts a where a.user_id = p.user_id and a.is_verified),
    (select count(*)::int from public.worlds w where w.owner_id = p.user_id),
    (select count(*)::int from public.songs s where s.owner_id = p.user_id),
    (select count(*)::int from public.artist_media m where m.user_id = p.user_id),
    coalesce((
      select case
               when l.applied_at is not null then 'joined'
               when l.linked_by_admin is not null then 'ready'
               when l.confirmed_by_primary and l.confirmed_by_linked then 'ready'
               else 'waiting'
             end
        from public.account_links l
       where (l.primary_user_id = auth.uid() and l.linked_user_id = p.user_id)
          or (l.linked_user_id = auth.uid() and l.primary_user_id = p.user_id)
       limit 1
    ), 'none'),
    exists (select 1 from public.account_links l where l.primary_user_id = p.user_id and l.linked_user_id = auth.uid())
  from others o
  join public.audience_profiles p on p.user_id = o.user_id
  join auth.users u on u.id = p.user_id
  order by p.created_at;
$$;
grant execute on function public.my_duplicate_accounts() to authenticated;

/**
 * Hand a world to another account. Used when two logins turn out to be the
 * same person. If the new owner already has one, the two are folded together
 * by merge_worlds rather than one of them being refused or lost.
 */
create or replace function public.transfer_world(p_world uuid, p_to uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_world public.worlds;
  v_theirs public.worlds;
  v_allowed boolean;
  v_keep uuid;
  v_fold uuid;
begin
  select * into v_world from public.worlds where id = p_world for update;
  if v_world.id is null then raise exception 'That world is gone.'; end if;
  if p_to <> auth.uid()
     and not exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role) then
    raise exception 'A world can only be moved to the account you are signed into.';
  end if;

  select v_world.owner_id = auth.uid()
      or exists (
        select 1 from public.account_links l
         where (l.confirmed_by_primary and l.confirmed_by_linked or l.linked_by_admin is not null)
           and ((l.primary_user_id = auth.uid() and l.linked_user_id = v_world.owner_id)
             or (l.linked_user_id = auth.uid() and l.primary_user_id = v_world.owner_id))
      )
      or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role)
    into v_allowed;
  if not v_allowed then raise exception 'That world is not yours to move.'; end if;

  select * into v_theirs from public.worlds where owner_id = p_to and id <> p_world order by created_at limit 1;

  update public.worlds set owner_id = p_to, updated_at = now() where id = p_world;

  if v_theirs.id is not null then
    -- Two worlds, one account: the fuller one is kept and the other folds in.
    if public.world_richness(v_theirs.id) >= public.world_richness(p_world) then
      v_keep := v_theirs.id; v_fold := p_world;
    else
      v_keep := p_world; v_fold := v_theirs.id;
    end if;
    perform public.merge_worlds(v_keep, v_fold);
    return v_keep;
  end if;
  return p_world;
end $$;
grant execute on function public.transfer_world(uuid, uuid) to authenticated;

/** Worlds standing under this person's other logins, waiting to be claimed. */
create or replace function public.my_other_worlds()
returns table (id uuid, slug text, artist_name text, status text, created_at timestamptz, streets int, richness int, owner_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.slug, w.artist_name, w.status, w.created_at,
         (select count(*)::int from public.world_streets s where s.world_id = w.id),
         public.world_richness(w.id),
         w.owner_id
    from public.worlds w
   where w.owner_id <> auth.uid()
     and exists (
       select 1 from public.account_links l
        where ((l.primary_user_id = auth.uid() and l.linked_user_id = w.owner_id)
            or (l.linked_user_id = auth.uid() and l.primary_user_id = w.owner_id))
     )
   order by public.world_richness(w.id) desc;
$$;
grant execute on function public.my_other_worlds() to authenticated;

/**
 * Saying "both of these are me". One side alone is never enough: anybody
 * could point at a stranger who happens to share a name. So the person signs
 * in on each login and says the same thing from both, and only then does
 * anything move.
 */
create or replace function public.claim_account_link(p_other uuid, p_keep uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_link public.account_links;
  v_primary uuid;
  v_linked uuid;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if p_other = v_me then raise exception 'That is the account you are signed into.'; end if;
  if p_keep <> v_me and p_keep <> p_other then raise exception 'Keep one of the two.'; end if;
  if not exists (select 1 from auth.users where id = p_other) then raise exception 'That login is gone.'; end if;

  v_primary := p_keep;
  v_linked  := case when p_keep = v_me then p_other else v_me end;

  select * into v_link from public.account_links
   where (primary_user_id = v_me and linked_user_id = p_other)
      or (primary_user_id = p_other and linked_user_id = v_me)
   for update;

  if v_link.id is null then
    insert into public.account_links (primary_user_id, linked_user_id, confirmed_by_primary, confirmed_by_linked)
    values (v_primary, v_linked, v_me = v_primary, v_me = v_linked)
    returning * into v_link;
  else
    if v_link.primary_user_id <> v_primary then
      update public.account_links
         set primary_user_id = v_primary,
             linked_user_id = v_linked,
             confirmed_by_primary = (v_me = v_primary),
             confirmed_by_linked = (v_me = v_linked),
             updated_at = now()
       where id = v_link.id
      returning * into v_link;
    else
      update public.account_links
         set confirmed_by_primary = confirmed_by_primary or (v_me = v_primary),
             confirmed_by_linked = confirmed_by_linked or (v_me = v_linked),
             updated_at = now()
       where id = v_link.id
      returning * into v_link;
    end if;
  end if;

  if v_link.applied_at is not null then return 'joined'; end if;
  if v_link.confirmed_by_primary and v_link.confirmed_by_linked then return 'ready'; end if;
  return 'waiting';
end $$;
grant execute on function public.claim_account_link(uuid, uuid) to authenticated;

/**
 * Do it. Everything the other login holds comes across to the one being
 * kept, and the spare is retired: its name is let go (so the name belongs to
 * one account again) and it can no longer be signed into as a person here.
 */
create or replace function public.apply_account_link(p_other uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_link public.account_links;
  v_keep uuid;
  v_drop uuid;
  v_world record;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select * into v_link from public.account_links
   where (primary_user_id = v_me and linked_user_id = p_other)
      or (primary_user_id = p_other and linked_user_id = v_me)
   for update;
  if v_link.id is null then raise exception 'Say they are both yours first.'; end if;
  if v_link.applied_at is not null then return 'already joined'; end if;
  if not ((v_link.confirmed_by_primary and v_link.confirmed_by_linked) or v_link.linked_by_admin is not null) then
    raise exception 'Sign in on the other one and say the same thing there, then this goes through.';
  end if;

  v_keep := v_link.primary_user_id;
  v_drop := v_link.linked_user_id;
  if v_me <> v_keep then raise exception 'Sign in on the account you are keeping to finish this.'; end if;

  for v_world in select id from public.worlds where owner_id = v_drop loop
    perform public.transfer_world(v_world.id, v_keep);
  end loop;

  update public.songs        set owner_id = v_keep where owner_id = v_drop;
  update public.artist_media set user_id  = v_keep where user_id  = v_drop;

  if not exists (select 1 from public.artist_accounts where user_id = v_keep) then
    update public.artist_accounts set user_id = v_keep, updated_at = now() where user_id = v_drop;
  end if;

  insert into public.farcaster_identities (fid, user_id, set_by)
  select (regexp_replace(u.email, '^fid-([0-9]+)@farcaster\.songchainn\.xyz$', '\1'))::bigint, v_keep, v_me
    from auth.users u
   where u.id = v_drop and u.email ~ '^fid-[0-9]+@farcaster\.songchainn\.xyz$'
  on conflict (fid) do update set user_id = excluded.user_id, set_by = excluded.set_by;

  update public.audience_profiles
     set display_name = null, is_public = false, updated_at = now()
   where user_id = v_drop;

  update public.account_links set applied_at = now(), updated_at = now() where id = v_link.id;
  return 'joined';
end $$;
grant execute on function public.apply_account_link(uuid) to authenticated;

/** The founder saying it for somebody, when a login was made on their behalf. */
create or replace function public.admin_link_accounts(p_primary uuid, p_linked uuid)
returns public.account_links
language plpgsql
security definer
set search_path = public
as $$
declare v_link public.account_links;
begin
  if not exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role) then
    raise exception 'only an admin can join two accounts for somebody';
  end if;
  if p_primary = p_linked then raise exception 'Those are the same login.'; end if;
  insert into public.account_links (primary_user_id, linked_user_id, confirmed_by_primary, confirmed_by_linked, linked_by_admin)
  values (p_primary, p_linked, true, true, auth.uid())
  on conflict (linked_user_id) do update
    set primary_user_id = excluded.primary_user_id,
        confirmed_by_primary = true,
        confirmed_by_linked = true,
        linked_by_admin = excluded.linked_by_admin,
        updated_at = now()
  returning * into v_link;
  return v_link;
end $$;
grant execute on function public.admin_link_accounts(uuid, uuid) to authenticated;

/**
 * The founder finishing a link on somebody's behalf, for a login that was
 * made for them rather than by them.
 */
create or replace function public.admin_apply_account_link(p_primary uuid, p_linked uuid, p_move_worlds boolean default true)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_world record;
begin
  if not exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role) then
    raise exception 'only an admin can finish a link for somebody';
  end if;
  if not exists (select 1 from public.account_links where primary_user_id = p_primary and linked_user_id = p_linked) then
    raise exception 'join the two accounts first';
  end if;

  if p_move_worlds then
    for v_world in select id from public.worlds where owner_id = p_linked loop
      update public.worlds set owner_id = p_primary, updated_at = now() where id = v_world.id;
    end loop;
  end if;

  update public.songs        set owner_id = p_primary where owner_id = p_linked;
  update public.artist_media set user_id  = p_primary where user_id  = p_linked;
  if not exists (select 1 from public.artist_accounts where user_id = p_primary) then
    update public.artist_accounts set user_id = p_primary, updated_at = now() where user_id = p_linked;
  end if;

  insert into public.farcaster_identities (fid, user_id, set_by)
  select (regexp_replace(u.email, '^fid-([0-9]+)@farcaster\.songchainn\.xyz$', '\1'))::bigint, p_primary, auth.uid()
    from auth.users u
   where u.id = p_linked and u.email ~ '^fid-[0-9]+@farcaster\.songchainn\.xyz$'
  on conflict (fid) do update set user_id = excluded.user_id, set_by = excluded.set_by;

  update public.audience_profiles
     set display_name = null, is_public = false, updated_at = now()
   where user_id = p_linked;

  update public.account_links set applied_at = now(), updated_at = now()
   where primary_user_id = p_primary and linked_user_id = p_linked;
  return 'joined';
end $$;
grant execute on function public.admin_apply_account_link(uuid, uuid, boolean) to authenticated;
