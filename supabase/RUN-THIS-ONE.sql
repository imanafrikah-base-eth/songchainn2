-- ===========================================================================
-- Everything outstanding, in one block, safe to run more than once.
--
-- Paste the whole thing into the Supabase SQL editor and press RUN.
-- The last statement prints a table telling you exactly what exists, so you do
-- not have to take anyone's word for whether it worked.
--
-- If a previous attempt failed silently, this is almost certainly why: every
-- table below uses gen_random_uuid(), which does not exist until pgcrypto is
-- enabled. The first line fixes that, and without it the very first CREATE
-- fails and takes the rest of the script down with it.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. The trading ground
-- ---------------------------------------------------------------------------
create table if not exists public.battle_host_fees (
  id             uuid primary key default gen_random_uuid(),
  battle_id      uuid not null references public.battles(id) on delete cascade,
  host_user_id   uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null,
  amount_raw     numeric(78, 0) not null check (amount_raw > 0),
  token_address  text not null,
  token_symbol   text not null default 'WWAT',
  quoted_usd     numeric(12, 4) not null check (quoted_usd > 0),
  tx_hash        text not null,
  paid_at        timestamptz not null default now(),
  constraint battle_host_fees_one_per_battle unique (battle_id),
  constraint battle_host_fees_tx_unique      unique (tx_hash)
);
create index if not exists battle_host_fees_host_idx on public.battle_host_fees(host_user_id);

create table if not exists public.battle_trades (
  id             uuid primary key default gen_random_uuid(),
  battle_id      uuid not null references public.battles(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null,
  side           text not null check (side in ('a', 'b')),
  song_id        text not null,
  coin_address   text not null,
  eth_spent_wei  numeric(78, 0) not null check (eth_spent_wei > 0),
  tx_hash        text not null,
  created_at     timestamptz not null default now(),
  constraint battle_trades_tx_unique unique (tx_hash)
);
create index if not exists battle_trades_battle_idx      on public.battle_trades(battle_id);
create index if not exists battle_trades_battle_side_idx on public.battle_trades(battle_id, side);
create index if not exists battle_trades_user_idx        on public.battle_trades(user_id);

alter table public.battle_host_fees enable row level security;
alter table public.battle_trades    enable row level security;

drop policy if exists battle_trades_read on public.battle_trades;
create policy battle_trades_read on public.battle_trades for select using (true);

drop policy if exists battle_trades_insert_own on public.battle_trades;
create policy battle_trades_insert_own on public.battle_trades for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists battle_host_fees_read on public.battle_host_fees;
create policy battle_host_fees_read on public.battle_host_fees for select using (true);

drop policy if exists battle_host_fees_insert_own on public.battle_host_fees;
create policy battle_host_fees_insert_own on public.battle_host_fees for insert
  to authenticated with check (auth.uid() = host_user_id);

-- Counts PEOPLE, not money. Scoring by volume would hand the verdict to
-- whoever spent most; counting backers means a side wins by convincing more
-- of the room, which is what a battle is actually about.
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

-- ---------------------------------------------------------------------------
-- 2. Bug reports
-- ---------------------------------------------------------------------------
create table if not exists public.bug_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  area        text not null,
  detail      text,
  page        text,
  screen_size text,
  user_agent  text,
  status      text not null default 'open' check (status in ('open','seen','fixed','wont_fix')),
  admin_note  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bug_reports_status_idx on public.bug_reports(status, created_at desc);

alter table public.bug_reports enable row level security;

-- Signed out people can report too: an app is often broken before you can sign
-- in, and refusing those reports loses the worst bugs.
drop policy if exists bug_reports_insert_anyone on public.bug_reports;
create policy bug_reports_insert_anyone on public.bug_reports for insert
  to anon, authenticated with check (true);

drop policy if exists bug_reports_read_own on public.bug_reports;
create policy bug_reports_read_own on public.bug_reports for select
  to authenticated using (auth.uid() = user_id);

grant insert on public.bug_reports to anon, authenticated;
grant select on public.bug_reports to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The official account, and the stage a battle runs on
-- ---------------------------------------------------------------------------
alter table public.audience_profiles
  add column if not exists is_official boolean not null default false;

create unique index if not exists audience_profiles_one_official
  on public.audience_profiles ((is_official)) where is_official = true;

-- Open Mic is free and costs points. Main Stage costs $1 in $WWAT and is the
-- only one where anything can be traded or paid out. Existing battles become
-- Main Stage, since they were created before the split existed.
alter table public.battles
  add column if not exists stage text not null default 'main_stage'
  check (stage in ('open_mic', 'main_stage'));

alter table public.battles
  add column if not exists points_spent integer not null default 0;

-- When the music ends and when voting and backing close. Written by the host
-- when a battle goes live, so every viewer counts down to the same instant
-- rather than to their own device clock.
alter table public.battles
  add column if not exists music_ends_at timestamptz;

alter table public.battles
  add column if not exists closes_at timestamptz;

create index if not exists battles_stage_idx on public.battles(stage, status);

-- ===========================================================================
-- PROOF. Read this output rather than assuming the script worked.
-- ===========================================================================
select 'battle_trades'            as thing, to_regclass('public.battle_trades')          is not null as exists
union all select 'battle_host_fees',        to_regclass('public.battle_host_fees')       is not null
union all select 'battle_trade_standing',   to_regclass('public.battle_trade_standing')  is not null
union all select 'bug_reports',             to_regclass('public.bug_reports')            is not null
union all select 'audience_profiles.is_official',
  exists (select 1 from information_schema.columns
          where table_name='audience_profiles' and column_name='is_official')
union all select 'battles.stage',
  exists (select 1 from information_schema.columns
          where table_name='battles' and column_name='stage')
union all select 'battles.closes_at',
  exists (select 1 from information_schema.columns
          where table_name='battles' and column_name='closes_at');
