-- Applied to the live project 12 Sep 2026 via MCP.
--
-- A fee quote, pinned to the server, so what you were told to pay is what you
-- are judged against.
--
-- Both battle-host-fee and battle-voice used to re-read the $WWAT price when
-- confirming and check the host's transfers against a FRESHLY computed amount,
-- with an 80% tolerance standing in for price movement. That is backwards: it
-- makes an honest payment fail when the coin falls more than a fifth between
-- paying and confirming, which on a coin this thin is an ordinary afternoon.
-- The host did nothing wrong and gets told their payment is short.
--
-- So the quote is written down when it is given, and confirm is judged against
-- the pinned row while it is still fresh. The tolerance stays as a floor for
-- the case where no pinned quote exists (an older client, or one that expired),
-- but it is no longer load bearing.
--
-- Service role only, on purpose. RLS is on with NO policies, so nothing that
-- comes through PostgREST can read or write a quote: a client that could edit
-- its own pinned amount could pay a penny for a battle.
create table if not exists public.battle_fee_quotes (
  id            uuid primary key default gen_random_uuid(),
  battle_id     uuid not null references public.battles(id) on delete cascade,
  kind          text not null check (kind in ('host', 'voice')),
  user_id       uuid not null,
  token_address text not null,
  -- The smallest unit, as text. These are 18 decimal token amounts and they are
  -- compared exactly, so they must never touch a float on the way in or out.
  total_raw     text not null,
  -- The per artist and treasury legs for a host fee, exactly as quoted. Empty
  -- for the voice fee, which is one transfer to the treasury.
  legs          jsonb not null default '[]'::jsonb,
  price_usd     double precision,
  capped        boolean not null default false,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  constraint battle_fee_quotes_one_per_payer unique (battle_id, kind, user_id)
);

comment on table public.battle_fee_quotes is
  'What a host was quoted for a battle fee, pinned so confirm judges the payment against the price they were shown rather than the price at the moment they pressed confirm. Service role only.';

create index if not exists battle_fee_quotes_expires_idx
  on public.battle_fee_quotes (expires_at);

alter table public.battle_fee_quotes enable row level security;

-- Belt and braces: RLS with no policies already denies every client read and
-- write, but TRUNCATE is not subject to RLS, so the grant goes too.
revoke all on public.battle_fee_quotes from anon, authenticated;
grant all on public.battle_fee_quotes to service_role;
