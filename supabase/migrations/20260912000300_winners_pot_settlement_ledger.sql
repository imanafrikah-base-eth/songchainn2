-- Applied to the live project 12 Sep 2026 via MCP.
--
-- The winners' pot, written down before a penny of it moves.
--
-- HostFeeNotice has promised hosts, since the fee went live, that "the rest goes
-- to the pot the winning side's backers share when the battle ends". Nothing
-- shared it. splitWinnersPool in battleMarket.ts has had zero callers for its
-- whole life, and the pooled 60% has simply sat in the treasury. That was a
-- promise the app was making on screen and not keeping.
--
-- Two tables, because computing what is owed and actually sending it are
-- different acts with different risks. The computation is reversible and can be
-- checked by eye; the sending is neither. So settlement records the arithmetic
-- first and leaves every payout sitting at 'owed' until something with a key
-- moves it. If the maths is ever wrong, it is wrong in a row somebody can read
-- rather than in a transfer nobody can take back.
--
-- Service role writes only. Both tables have RLS on and no write policy at all.

create table if not exists public.battle_settlements (
  battle_id         uuid primary key references public.battles(id) on delete cascade,
  -- Lower case, always. battles.winner is 'A'/'B' but battle_trades.side is
  -- 'a'/'b', and comparing them without folding pays nobody while looking
  -- exactly like a battle that simply had no backers.
  winner_side       text not null check (winner_side in ('a', 'b')),
  token_address     text not null,
  fee_total_raw     text not null,
  winners_pool_raw  text not null,
  host_rebate_raw   text not null,
  treasury_keep_raw text not null,
  backer_count      integer not null default 0,
  -- What the payout rows actually add up to. Always <= winners_pool_raw: every
  -- share is floored, and the remainder stays put rather than being handed to
  -- somebody for being first in the list.
  distributed_raw   text not null default '0',
  dust_raw          text not null default '0',
  settled_at        timestamptz not null default now()
);

comment on table public.battle_settlements is
  'The arithmetic of one battle''s winners pot, recorded when the battle is settled. Reading this should tell you exactly why every payout row is the size it is.';

create table if not exists public.battle_winner_payouts (
  id             uuid primary key default gen_random_uuid(),
  battle_id      uuid not null references public.battles(id) on delete cascade,
  user_id        uuid not null,
  wallet_address text not null,
  amount_raw     text not null,
  token_address  text not null,
  -- owed  : computed and waiting for the treasury to send it
  -- sent  : on chain, tx_hash is filled in
  -- failed: the send was attempted and did not land; safe to retry
  status         text not null default 'owed' check (status in ('owed', 'sent', 'failed')),
  tx_hash        text,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  constraint battle_winner_payouts_one_per_backer unique (battle_id, user_id)
);

comment on table public.battle_winner_payouts is
  'What each winning backer is owed from a battle''s pot, and whether it has been sent. One row per person per battle.';

create index if not exists battle_winner_payouts_owed_idx
  on public.battle_winner_payouts (status, battle_id);

alter table public.battle_settlements enable row level security;
alter table public.battle_winner_payouts enable row level security;

-- The arithmetic is public: anybody can check that a pot was split the way the
-- notice said it would be. It carries no wallet and no person.
drop policy if exists battle_settlements_read on public.battle_settlements;
create policy battle_settlements_read
  on public.battle_settlements
  for select
  using (true);

-- A payout row carries a wallet address, so it is for the person owed it and
-- nobody else. Backers should be able to see what they are due without asking.
drop policy if exists battle_winner_payouts_read_own on public.battle_winner_payouts;
create policy battle_winner_payouts_read_own
  on public.battle_winner_payouts
  for select
  using ((select auth.uid()) = user_id);

-- No insert, update or delete policy on either table, deliberately: only the
-- service role settles a battle or marks a payout sent. TRUNCATE ignores RLS,
-- so that grant goes explicitly.
revoke all on public.battle_settlements from anon, authenticated;
revoke all on public.battle_winner_payouts from anon, authenticated;
grant select on public.battle_settlements to anon, authenticated;
grant select on public.battle_winner_payouts to authenticated;
grant all on public.battle_settlements to service_role;
grant all on public.battle_winner_payouts to service_role;
