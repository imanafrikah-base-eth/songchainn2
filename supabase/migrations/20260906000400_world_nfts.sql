-- Drops: an artist turns a song, a piece of artwork or any content into an
-- NFT on Base, from inside their world, with their own wallet.
--
-- HOW IT COSTS US NOTHING. The contract is a Zora Creator 1155, deployed by
-- the artist's wallet through Zora's factory: the artist pays the (small)
-- deployment gas on Base, the collector pays the price the artist set plus
-- Zora's protocol mint fee, and the price goes to the artist's payout wallet
-- straight from the contract. SONGCHAINN holds nothing, signs nothing and
-- never touches the money. The app is named as the create/mint referral, so
-- Zora's protocol rewards pay the platform a slice of the mint fee, which is
-- a reward for bringing the mint, not a charge on anybody.
--
-- WHAT THIS TABLE IS. The app's record of each drop: what it is, what it
-- costs, how many, where it is on chain, and whether it is shown in the
-- marketplace or used as a key. The chain is the truth about ownership and
-- supply; this row is how the app finds the token and draws the card.
--
-- WHO MAY WRITE. Only the artist who owns the world, and only as themselves.
-- The client records the transaction it sent; the nft-verify function reads
-- the chain, checks the contract really belongs to that artist's wallet, and
-- is the ONLY thing allowed to mark a drop live. A drop that is not live has
-- no Collect button, so a row somebody typed in cannot send a collector's
-- money to a contract nobody checked.

create table if not exists public.world_nfts (
  id uuid primary key default gen_random_uuid(),
  world_slug text not null,
  world_id uuid references public.worlds(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  artist_id text,
  kind text not null check (kind in ('song', 'artwork', 'content')),
  title text not null check (length(title) between 1 and 120),
  description text not null default '',
  song_id text,
  image_url text not null,
  media_url text,
  media_kind text check (media_kind is null or media_kind in ('audio', 'video', 'image', 'other')),
  price_eth numeric(20, 8) not null default 0 check (price_eth >= 0),
  -- null means an open edition: as many as people want.
  copies integer check (copies is null or copies > 0),
  per_wallet integer check (per_wallet is null or per_wallet > 0),
  sale_end timestamptz,
  in_marketplace boolean not null default false,
  -- Holding one grants this ring in the world, if set.
  key_ring text check (key_ring is null or key_ring in ('fan', 'insider')),
  status text not null default 'draft'
    check (status in ('draft', 'minting', 'live', 'paused', 'failed')),
  chain text not null default 'base',
  contract_address text check (contract_address is null or contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  token_id bigint,
  minter_address text check (minter_address is null or minter_address ~ '^0x[0-9a-fA-F]{40}$'),
  contract_version text,
  payout_wallet text check (payout_wallet is null or payout_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  tx_hash text check (tx_hash is null or tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  metadata_uri text,
  status_note text,
  minted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists world_nfts_world_idx on public.world_nfts (world_slug, status);
create index if not exists world_nfts_market_idx on public.world_nfts (in_marketplace, status);
create index if not exists world_nfts_owner_idx on public.world_nfts (owner_id);

alter table public.world_nfts enable row level security;

-- Anybody can see a drop that is live or paused; an artist sees all of theirs.
drop policy if exists "live drops are public, drafts are private" on public.world_nfts;
create policy "live drops are public, drafts are private"
  on public.world_nfts for select
  using (status in ('live', 'paused') or owner_id = auth.uid());

-- Only an adult artist who owns the world the drop is in may start one, and
-- only as themselves. A code-defined world (World #001) has no worlds row, so
-- for those the artist's linked artist_id has to match instead.
drop policy if exists "world owners start their own drops" on public.world_nfts;
create policy "world owners start their own drops"
  on public.world_nfts for insert
  with check (
    owner_id = auth.uid()
    and is_artist(auth.uid())
    and is_adult(auth.uid())
    and not has_restriction(auth.uid(), 'suspension')
    and not has_restriction(auth.uid(), 'ban')
    and (
      exists (select 1 from public.worlds w where w.slug = world_slug and w.owner_id = auth.uid())
      or exists (
        select 1 from public.artist_accounts a
        where a.user_id = auth.uid() and a.artist_id = world_nfts.artist_id
      )
    )
  );

drop policy if exists "artists edit their own drops" on public.world_nfts;
create policy "artists edit their own drops"
  on public.world_nfts for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "artists remove drops that never went out" on public.world_nfts;
create policy "artists remove drops that never went out"
  on public.world_nfts for delete
  using (owner_id = auth.uid() and status in ('draft', 'failed'));

-- The guard. Going live, and the on-chain identity of a live drop, belong to
-- the verifier alone. Everything else the artist may change whenever they like
-- (price and copies are display only once minted; the chain has the real ones).
create or replace function public.world_nfts_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
begin
  new.updated_at := now();
  if v_role = 'service_role' then
    return new;
  end if;

  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') then
    raise exception 'A drop goes live only after the chain has been checked';
  end if;
  if new.verified_at is not null and (tg_op = 'INSERT' or old.verified_at is distinct from new.verified_at) then
    raise exception 'verified_at is written by the verifier';
  end if;

  if tg_op = 'UPDATE' and old.status in ('live', 'paused') then
    if new.contract_address is distinct from old.contract_address
       or new.token_id is distinct from old.token_id
       or new.minter_address is distinct from old.minter_address
       or new.tx_hash is distinct from old.tx_hash
       or new.payout_wallet is distinct from old.payout_wallet
       or new.metadata_uri is distinct from old.metadata_uri then
      raise exception 'A live drop keeps its on-chain identity';
    end if;
    if new.status not in ('live', 'paused') then
      raise exception 'A live drop can be paused, not taken back';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists world_nfts_guard on public.world_nfts;
create trigger world_nfts_guard
  before insert or update on public.world_nfts
  for each row execute function public.world_nfts_guard();

-- A street can be locked with a drop, the way it can already be locked with a
-- song. Holding one copy opens the door.
alter table public.world_streets add column if not exists key_nft_id uuid references public.world_nfts(id) on delete set null;
alter table public.world_streets drop constraint if exists world_streets_key_kind_check;
alter table public.world_streets add constraint world_streets_key_kind_check
  check (key_kind is null or key_kind in ('open', 'song', 'token', 'points', 'nft'));

grant select on public.world_nfts to anon, authenticated;
grant insert, update, delete on public.world_nfts to authenticated;
