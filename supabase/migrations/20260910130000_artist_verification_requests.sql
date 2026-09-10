-- Verification for artists who came in on their own. The founding artists
-- were verified when they claimed their pages; everyone else asks for it,
-- and the door opens after ten of their own records are live here. The
-- founder decides from Admin > Claims. Approval flips artist_accounts.is_verified,
-- which is the one flag every verification mark in the app reads.

create table if not exists public.artist_verification_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  artist_id   text not null,
  songs_owned int not null default 0,
  message     text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists artist_verification_requests_status_idx on public.artist_verification_requests (status, created_at desc);
create index if not exists artist_verification_requests_user_idx on public.artist_verification_requests (user_id, created_at desc);

alter table public.artist_verification_requests enable row level security;
drop policy if exists avr_own_or_admin_read on public.artist_verification_requests;
create policy avr_own_or_admin_read on public.artist_verification_requests for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role));
grant select on public.artist_verification_requests to authenticated;

-- Where the artist stands: verified or not, how many records are live, what the last request said.
create or replace function public.artist_verification_standing()
returns table (artist_id text, is_verified boolean, songs_live int, needed int, request_status text, requested_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select aa.artist_id,
         aa.is_verified,
         (select count(*)::int from public.songs s where s.owner_id = auth.uid() and s.status = 'published'),
         10,
         (select r.status from public.artist_verification_requests r where r.user_id = auth.uid() order by r.created_at desc limit 1),
         (select r.created_at from public.artist_verification_requests r where r.user_id = auth.uid() order by r.created_at desc limit 1)
    from public.artist_accounts aa
   where aa.user_id = auth.uid();
$$;
grant execute on function public.artist_verification_standing() to authenticated;

create or replace function public.request_artist_verification(p_message text default null)
returns public.artist_verification_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.artist_accounts;
  v_count   int;
  v_row     public.artist_verification_requests;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_account from public.artist_accounts where user_id = auth.uid();
  if v_account.artist_id is null then raise exception 'Only an artist account can ask to be verified.'; end if;
  if v_account.is_verified then raise exception 'This account is already verified.'; end if;
  select count(*) into v_count from public.songs where owner_id = auth.uid() and status = 'published';
  if v_count < 10 then
    raise exception 'Verification opens after ten of your own records are live here. You have %.', v_count;
  end if;
  if exists (select 1 from public.artist_verification_requests where user_id = auth.uid() and status = 'pending') then
    raise exception 'Your request is already in. The founder will look at it.';
  end if;
  insert into public.artist_verification_requests (user_id, artist_id, songs_owned, message)
  values (auth.uid(), v_account.artist_id, v_count, nullif(btrim(coalesce(p_message, '')), ''))
  returning * into v_row;
  return v_row;
end $$;
grant execute on function public.request_artist_verification(text) to authenticated;

create or replace function public.decide_artist_verification(p_request_id uuid, p_approve boolean)
returns public.artist_verification_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.artist_verification_requests;
begin
  if not exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'::app_role) then
    raise exception 'only an admin can verify an artist';
  end if;
  select * into v_row from public.artist_verification_requests where id = p_request_id for update;
  if v_row.id is null then raise exception 'request not found'; end if;
  if v_row.status <> 'pending' then raise exception 'that request was already reviewed'; end if;

  if p_approve then
    update public.artist_accounts set is_verified = true, updated_at = now() where user_id = v_row.user_id;
  end if;

  update public.artist_verification_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_request_id
  returning * into v_row;

  insert into public.notifications (user_id, type, title, message, metadata)
  values (
    v_row.user_id,
    'artist_claim',
    case when p_approve then 'You are verified' else 'Not verified yet' end,
    case when p_approve
      then 'Your artist account is verified. The mark travels with your name everywhere now.'
      else 'Not this time. Keep releasing your own records here and ask again.'
    end,
    jsonb_build_object('verification', v_row.status, 'request_id', v_row.id)
  );
  return v_row;
end $$;
grant execute on function public.decide_artist_verification(uuid, boolean) to authenticated;
