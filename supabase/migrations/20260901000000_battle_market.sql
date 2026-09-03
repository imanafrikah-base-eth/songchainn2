-- The Trading Ground: the third voice in a battle verdict, alongside the AI
-- judges and the public poll.
--
-- THE ONE RULE THIS SCHEMA ENFORCES: SONGCHAINN NEVER HOLDS ANYONE'S MONEY.
-- Every row here is a RECORD of something that already happened on Base, in the
-- user's own wallet, against Zora. There is no balance column anywhere, no
-- escrow, and no table this app could drain. A backer buys the song coin of the
-- side they believe in and KEEPS that coin whether their side wins or loses. It
-- is a real asset with a resale market (see the Marketplace), not a stake.
--
-- The prize pool is therefore never made of anybody's principal. It is funded
-- only by fees: the host fee for the battle, plus a small fee on each backing
-- trade. Winners share that fee pool. Losers lose nothing but the call.

-- ---------------------------------------------------------------------------
-- Host fees. Every battle is paid for. There is no free battle.
-- ---------------------------------------------------------------------------
create table if not exists public.battle_host_fees (
  id             uuid primary key default gen_random_uuid(),
  battle_id      uuid not null references public.battles(id) on delete cascade,
  host_user_id   uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null,
  -- What the host actually paid, in the smallest unit of the token they paid in.
  amount_raw     numeric(78, 0) not null check (amount_raw > 0),
  token_address  text not null,
  token_symbol   text not null default 'WWAT',
  -- The USD figure the fee was quoted at when they paid, kept for the receipt.
  quoted_usd     numeric(12, 4) not null check (quoted_usd > 0),
  tx_hash        text not null,
  paid_at        timestamptz not null default now(),
  -- One fee per battle, and one row per on-chain transaction. Both matter: the
  -- first stops a battle being paid for twice, the second stops one payment
  -- being replayed to unlock several battles.
  constraint battle_host_fees_one_per_battle unique (battle_id),
  constraint battle_host_fees_tx_unique      unique (tx_hash)
);

create index if not exists battle_host_fees_host_idx on public.battle_host_fees(host_user_id);

-- ---------------------------------------------------------------------------
-- Backing trades. A record of a Zora buy the user made themselves.
-- ---------------------------------------------------------------------------
create table if not exists public.battle_trades (
  id             uuid primary key default gen_random_uuid(),
  battle_id      uuid not null references public.battles(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null,
  -- Which corner they backed, and the song coin they actually bought.
  side           text not null check (side in ('a', 'b')),
  song_id        text not null,
  coin_address   text not null,
  -- What they spent, in wei. Recorded for the receipt and for volume display.
  -- It is NOT what decides the battle. See battle_trade_standing below.
  eth_spent_wei  numeric(78, 0) not null check (eth_spent_wei > 0),
  tx_hash        text not null,
  created_at     timestamptz not null default now(),
  -- The same transaction can never be counted twice.
  constraint battle_trades_tx_unique unique (tx_hash)
);

create index if not exists battle_trades_battle_idx      on public.battle_trades(battle_id);
create index if not exists battle_trades_battle_side_idx on public.battle_trades(battle_id, side);
create index if not exists battle_trades_user_idx        on public.battle_trades(user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.battle_host_fees enable row level security;
alter table public.battle_trades    enable row level security;

-- Anyone can see who is backing whom. That visibility IS the trading ground.
drop policy if exists battle_trades_read on public.battle_trades;
create policy battle_trades_read
  on public.battle_trades for select
  using (true);

-- You may only ever record a trade as yourself. You cannot write a row that
-- credits somebody else, and you cannot edit or delete one afterwards, so the
-- standing cannot be rewritten once the battle is running.
drop policy if exists battle_trades_insert_own on public.battle_trades;
create policy battle_trades_insert_own
  on public.battle_trades for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists battle_host_fees_read on public.battle_host_fees;
create policy battle_host_fees_read
  on public.battle_host_fees for select
  using (true);

drop policy if exists battle_host_fees_insert_own on public.battle_host_fees;
create policy battle_host_fees_insert_own
  on public.battle_host_fees for insert
  to authenticated
  with check ((select auth.uid()) = host_user_id);

-- ---------------------------------------------------------------------------
-- The standing, and why it counts PEOPLE and not MONEY.
--
-- Scoring by volume would hand the verdict to whoever spent most, which is both
-- less fun and much easier to game: one wallet, one big buy, battle decided.
-- Counting distinct backers means a side wins the trading component by
-- convincing more people, which is the thing the battle is actually about.
-- Volume is still returned, because it is worth seeing, it just does not vote.
-- ---------------------------------------------------------------------------
create or replace view public.battle_trade_standing as
select
  battle_id,
  count(distinct user_id) filter (where side = 'a') as backers_a,
  count(distinct user_id) filter (where side = 'b') as backers_b,
  coalesce(sum(eth_spent_wei) filter (where side = 'a'), 0) as volume_a_wei,
  coalesce(sum(eth_spent_wei) filter (where side = 'b'), 0) as volume_b_wei,
  count(*) as trade_count
from public.battle_trades
group by battle_id;

grant select on public.battle_trade_standing to anon, authenticated;
grant select on public.battle_trades         to anon, authenticated;
grant insert on public.battle_trades         to authenticated;
grant select on public.battle_host_fees      to anon, authenticated;
grant insert on public.battle_host_fees      to authenticated;
