-- The wallets a person has, and which one they are using.
--
-- Until now a connection lived only in the tab it happened in: the address
-- went into auth metadata and nothing read it back, so the app kept asking
-- to connect a wallet that was already connected, and the top bar never
-- showed one. It also only ever held one address, though people carry
-- several: the one in the Base app, MetaMask on a laptop, the one Farcaster
-- gave them.
--
-- So: every wallet a person adds is kept, with how they connected it, and
-- exactly one is the active one that money moves through. The active one is
-- mirrored onto their profile, because the world gates and the coin rails
-- already read it from there.

create table if not exists public.user_wallets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  address      text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),
  -- How they connected it, so the app can name it back to them.
  provider     text not null default 'other'
               check (provider in ('metamask', 'coinbase', 'farcaster', 'zora', 'rainbow', 'phantom', 'rabby', 'walletconnect', 'other')),
  label        text,
  is_active    boolean not null default false,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  constraint user_wallets_one_each unique (user_id, address)
);
create unique index if not exists user_wallets_one_active
  on public.user_wallets (user_id) where is_active;
create index if not exists user_wallets_user_idx on public.user_wallets (user_id, created_at);

alter table public.user_wallets enable row level security;
drop policy if exists user_wallets_own on public.user_wallets;
create policy user_wallets_own on public.user_wallets for select to authenticated using (user_id = auth.uid());
grant select on public.user_wallets to authenticated;

/** The active wallet, mirrored where the gates and the coin rails read it. */
create or replace function public.sync_active_wallet_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active then
    update public.audience_profiles
       set wallet_address = new.address, updated_at = now()
     where user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists user_wallets_sync_profile_trg on public.user_wallets;
create trigger user_wallets_sync_profile_trg
  after insert or update of is_active, address on public.user_wallets
  for each row execute function public.sync_active_wallet_to_profile();

/**
 * Remember a wallet the person just connected. The first one they add
 * becomes the one money moves through; the rest wait to be chosen. Called
 * every time a connection succeeds, so it is safe to call twice.
 */
create or replace function public.add_my_wallet(p_address text, p_provider text default 'other', p_label text default null)
returns public.user_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_addr text := lower(btrim(coalesce(p_address, '')));
  v_row public.user_wallets;
  v_first boolean;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if v_addr !~ '^0x[0-9a-f]{40}$' then raise exception 'That does not look like a wallet address.'; end if;

  select not exists (select 1 from public.user_wallets where user_id = v_me) into v_first;

  insert into public.user_wallets (user_id, address, provider, label, is_active, last_used_at)
  values (v_me, v_addr,
          case when p_provider in ('metamask','coinbase','farcaster','zora','rainbow','phantom','rabby','walletconnect') then p_provider else 'other' end,
          nullif(btrim(coalesce(p_label, '')), ''),
          v_first, now())
  on conflict (user_id, address) do update
     set provider = case when excluded.provider <> 'other' then excluded.provider else public.user_wallets.provider end,
         label = coalesce(excluded.label, public.user_wallets.label),
         last_used_at = now()
  returning * into v_row;
  return v_row;
end $$;
grant execute on function public.add_my_wallet(text, text, text) to authenticated;

/** Choose which wallet money moves through. */
create or replace function public.set_active_wallet(p_address text)
returns public.user_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_addr text := lower(btrim(coalesce(p_address, '')));
  v_row public.user_wallets;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from public.user_wallets where user_id = v_me and address = v_addr) then
    raise exception 'That wallet is not on your account.';
  end if;
  update public.user_wallets set is_active = false where user_id = v_me and is_active and address <> v_addr;
  update public.user_wallets set is_active = true, last_used_at = now()
   where user_id = v_me and address = v_addr
  returning * into v_row;
  return v_row;
end $$;
grant execute on function public.set_active_wallet(text) to authenticated;

/** Take a wallet off the account. Nothing on chain changes; we simply forget it. */
create or replace function public.forget_wallet(p_address text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_addr text := lower(btrim(coalesce(p_address, '')));
  v_was_active boolean;
  v_next text;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select is_active into v_was_active from public.user_wallets where user_id = v_me and address = v_addr;
  if v_was_active is null then return false; end if;
  delete from public.user_wallets where user_id = v_me and address = v_addr;
  if v_was_active then
    select address into v_next from public.user_wallets where user_id = v_me order by last_used_at desc nulls last, created_at limit 1;
    if v_next is not null then
      update public.user_wallets set is_active = true where user_id = v_me and address = v_next;
    else
      update public.audience_profiles set wallet_address = null, updated_at = now() where user_id = v_me;
    end if;
  end if;
  return true;
end $$;
grant execute on function public.forget_wallet(text) to authenticated;

-- Everyone who already had an address on their profile keeps it, as their
-- active wallet, so nobody is asked to connect something they already did.
insert into public.user_wallets (user_id, address, provider, is_active, created_at)
select p.user_id, lower(p.wallet_address), 'other', true, coalesce(p.updated_at, now())
  from public.audience_profiles p
 where p.wallet_address ~ '^0x[0-9a-fA-F]{40}$'
on conflict (user_id, address) do nothing;
