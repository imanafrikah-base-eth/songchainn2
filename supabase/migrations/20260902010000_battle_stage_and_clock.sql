-- Which room a battle is in, and the clock it runs on.
--
-- Two things the app already asks for but the database could not answer:
--
--   1. WHICH STAGE. Open Mic is free of money entirely: it costs the host
--      points, nothing in it can be backed, and nobody is paid. Main Stage is
--      the real thing. That difference is a promise made on screen, so it is
--      enforced here rather than trusted to the client.
--
--   2. WHEN IT CLOSES. Everyone in a room has to count down to the same
--      instant. A duration measured on each device drifts per viewer, and two
--      people would end up disagreeing about whether voting was still open.
--      So the room counts to a timestamp on the row, written once.

alter table public.battles
  add column if not exists stage         text    not null default 'main_stage',
  add column if not exists points_spent  integer not null default 0,
  add column if not exists music_ends_at timestamptz,
  add column if not exists closes_at     timestamptz;

do $$
begin
  alter table public.battles
    add constraint battles_stage_check check (stage in ('open_mic', 'main_stage'));
exception
  when duplicate_object then null;
end $$;

create index if not exists battles_stage_idx on public.battles(stage, status);

comment on column public.battles.stage is
  'open_mic (points to host, no money anywhere) or main_stage (host fee, backing, payouts).';
comment on column public.battles.points_spent is
  'Points actually taken from the host. Written by the charge trigger, never by the client.';
comment on column public.battles.closes_at is
  'When the poll and the trading ground both close. They close together on purpose.';

-- ---------------------------------------------------------------------------
-- Paying for an Open Mic
--
-- Charged in the same transaction that opens the room, so there is no window
-- where a battle exists that was never paid for and no way for a failed insert
-- to cost somebody points for a room they never got.
--
-- Charged on GOING LIVE, not on saving. A draft nobody ever opens costs
-- nothing, which is what a draft should cost.
-- ---------------------------------------------------------------------------
create or replace function public.charge_open_mic_host()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cost constant integer := 500;
begin
  -- Not open yet. Nothing has been paid, whatever the client claimed.
  if new.status is distinct from 'live' then
    if tg_op = 'INSERT' or old.status is distinct from 'live' then
      new.points_spent := 0;
    end if;
    return new;
  end if;

  -- Already live. It was paid for once and is not paid for again.
  if tg_op = 'UPDATE' and old.status = 'live' then
    return new;
  end if;

  if new.stage <> 'open_mic' then
    new.points_spent := 0;
    return new;
  end if;

  if new.host_user_id is null then
    raise exception 'An Open Mic battle needs a signed-in host.'
      using errcode = 'P0001';
  end if;

  update public.user_points
     set points = points - cost,
         updated_at = now()
   where user_id = new.host_user_id
     and points >= cost;

  if not found then
    raise exception 'Hosting an Open Mic costs % points, and this account does not have them yet. Listening earns them.', cost
      using errcode = 'P0001';
  end if;

  new.points_spent := cost;
  return new;
end;
$$;

drop trigger if exists battles_charge_open_mic on public.battles;
create trigger battles_charge_open_mic
  before insert or update of status on public.battles
  for each row execute function public.charge_open_mic_host();

-- ---------------------------------------------------------------------------
-- No money near the Open Mic
--
-- The stage picker tells a host, in writing, that nothing on the Open Mic is
-- worth money and nobody gets paid. A promise like that should not depend on
-- the client remembering to hide a button.
-- ---------------------------------------------------------------------------
create or replace function public.reject_money_on_open_mic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
begin
  select stage into s from public.battles where id = new.battle_id;
  if s = 'open_mic' then
    raise exception 'This battle is on the Open Mic. Nothing in it can be backed or paid for.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists battle_trades_no_open_mic on public.battle_trades;
create trigger battle_trades_no_open_mic
  before insert on public.battle_trades
  for each row execute function public.reject_money_on_open_mic();

drop trigger if exists battle_host_fees_no_open_mic on public.battle_host_fees;
create trigger battle_host_fees_no_open_mic
  before insert on public.battle_host_fees
  for each row execute function public.reject_money_on_open_mic();
