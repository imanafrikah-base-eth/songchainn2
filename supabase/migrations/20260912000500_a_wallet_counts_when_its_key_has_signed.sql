-- Applied to the live project 12 Sep 2026 via MCP.
--
-- Proof of key control, so "a wallet on your account" means something.
--
-- add_my_wallet binds ANY address to your account on nothing but a format
-- check. That was fine while user_wallets was a convenience (remember what I
-- paid with), and it became load bearing the moment three money functions
-- started using it to answer "is this payment yours?". Base is public: a real
-- host's fee transfer and its from address are visible to everyone the moment
-- they are mined. So anybody could register a stranger's address and then claim
-- that stranger's payment as their own. battle-host-fee, battle-voice and
-- battle-trade-verify all say so in their own comments. This closes it.
--
-- The fix is NOT to remove add_my_wallet. Remembering a wallet you used is a
-- genuinely useful thing and breaking it would cost people their wallet list
-- for no security gain. Instead a wallet now has two states, and only one of
-- them counts for money:
--
--   verified_at IS NULL  a wallet you have used here. Convenience only.
--   verified_at SET      its key signed a challenge naming you. This is proof.
--
-- The money functions require the second. Nothing else has to change.
--
-- NOTE ON EXISTING ROWS: they are deliberately left unverified. Grandfathering
-- them in would reintroduce exactly the hole this closes, so the wallets on the
-- account today must sign once before they can pay a fee or back a corner. The
-- app asks for that signature by itself, before any money moves.

alter table public.user_wallets
  add column if not exists verified_at timestamptz;

comment on column public.user_wallets.verified_at is
  'When this address proved it holds its own key, by signing a nonce challenge naming this account. NULL means the address was merely used here and must never be accepted as proof of who paid.';

-- The challenge. One row per attempt, single use, short lived.
create table if not exists public.wallet_link_challenges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  address    text not null,
  nonce      text not null unique,
  message    text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

comment on table public.wallet_link_challenges is
  'Single use nonces for proving a wallet key. Service role only: a client that could read or write these could mint its own proof.';

create index if not exists wallet_link_challenges_lookup_idx
  on public.wallet_link_challenges (user_id, address, used_at);

alter table public.wallet_link_challenges enable row level security;

-- No policies at all, deliberately. Only the service role issues or spends a
-- challenge. TRUNCATE ignores RLS, so the grant goes explicitly.
revoke all on public.wallet_link_challenges from anon, authenticated;
grant all on public.wallet_link_challenges to service_role;
