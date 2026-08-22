-- Hand the artist pages over to the artists.
--
-- ArtistDetail.tsx, Community.tsx, CommentSheet.tsx and NotificationDropdown.tsx
-- have queried `artist_accounts` since day one. The table was never created, and
-- every query is wrapped in try/catch returning null, so the whole ownership
-- layer has been silently dead: nobody owns a page, nobody can edit one, and no
-- badge can ever show. Creating the table switches all of that on.
--
-- Once an artist owns their page, their own audience_profiles row supplies the
-- page's name, bio, picture and cover. That is the hand-over: they edit their
-- profile, their artist page changes.

-- --------------------------------------------------------------- accounts ---

create table if not exists public.artist_accounts (
  -- The musicData ARTISTS id (text, e.g. '3'), not a uuid.
  artist_id     text primary key,
  user_id       uuid references auth.users(id) on delete set null,
  is_verified   boolean not null default false,
  profile_theme text,
  claimed_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists artist_accounts_user_id_idx on public.artist_accounts (user_id);

alter table public.artist_accounts enable row level security;

-- Anyone can see who owns a page and whether they are verified. That is public
-- information on a public profile, and anon needs it too.
drop policy if exists "Artist accounts are public" on public.artist_accounts;
create policy "Artist accounts are public"
  on public.artist_accounts for select
  using (true);

-- The owner can change how their page looks. They cannot grant themselves
-- ownership or a verification badge; the trigger below enforces that.
drop policy if exists "Owner updates own artist page" on public.artist_accounts;
create policy "Owner updates own artist page"
  on public.artist_accounts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Admins manage artist accounts" on public.artist_accounts;
create policy "Admins manage artist accounts"
  on public.artist_accounts for all
  to authenticated
  using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role))
  with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role));

create or replace function public.artist_accounts_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- No end user in context: service role, or an admin SQL session.
  if auth.uid() is null then
    new.updated_at := now();
    return new;
  end if;
  if exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role) then
    new.updated_at := now();
    return new;
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'ownership is granted by approving a claim, not by hand';
  end if;
  if new.is_verified is distinct from old.is_verified then
    raise exception 'verification is not self-service';
  end if;
  new.updated_at := now();
  return new;
end $fn$;

drop trigger if exists artist_accounts_guard_trg on public.artist_accounts;
create trigger artist_accounts_guard_trg
  before update on public.artist_accounts
  for each row execute function public.artist_accounts_guard();

-- ----------------------------------------------------------------- claims ---

create table if not exists public.artist_claims (
  id          uuid primary key default gen_random_uuid(),
  artist_id   text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- The artist's own words: how the founder knows it is really them.
  message     text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (artist_id, user_id)
);

create index if not exists artist_claims_status_idx on public.artist_claims (status, created_at desc);

alter table public.artist_claims enable row level security;

drop policy if exists "Users read own claims" on public.artist_claims;
create policy "Users read own claims"
  on public.artist_claims for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users file own claims" on public.artist_claims;
create policy "Users file own claims"
  on public.artist_claims for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Users withdraw own pending claims" on public.artist_claims;
create policy "Users withdraw own pending claims"
  on public.artist_claims for delete
  to authenticated
  using (user_id = auth.uid() and status = 'pending');

drop policy if exists "Admins manage claims" on public.artist_claims;
create policy "Admins manage claims"
  on public.artist_claims for all
  to authenticated
  using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role))
  with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role));

-- ------------------------------------------------------- the hand-over ---

-- Approving a claim is the moment a page changes hands, so it happens in one
-- transaction: grant ownership, mark this claim approved, and reject every
-- other pending claim on the same artist so two people never both think they won.
create or replace function public.approve_artist_claim(p_claim_id uuid, p_verify boolean default true)
returns public.artist_accounts
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_claim public.artist_claims;
  v_account public.artist_accounts;
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

  update public.artist_claims
     set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
   where artist_id = v_claim.artist_id
     and id <> p_claim_id
     and status = 'pending';

  return v_account;
end $fn$;

revoke execute on function public.approve_artist_claim(uuid, boolean) from public, anon;
grant execute on function public.approve_artist_claim(uuid, boolean) to authenticated;

create or replace function public.reject_artist_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (
    select 1 from public.user_roles ur
     where ur.user_id = auth.uid() and ur.role = 'admin'::app_role
  ) then
    raise exception 'only an admin can review claims';
  end if;
  update public.artist_claims
     set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_claim_id and status = 'pending';
end $fn$;

revoke execute on function public.reject_artist_claim(uuid) from public, anon;
grant execute on function public.reject_artist_claim(uuid) to authenticated;

comment on table public.artist_accounts is
  'Who owns each artist page. The owner''s audience_profiles row supplies the page name, bio, picture and cover.';
comment on table public.artist_claims is
  'An artist asking for their page. Approved by an admin via approve_artist_claim().';
