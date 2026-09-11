-- In-app voice for a WaveWarz battle, turned on per battle.
--
-- Voice left the app for X Spaces on 8 Jul 2026. It comes back one battle at a
-- time: the host turns it on from the room. On the Main Stage that costs $3 in
-- $WWAT, paid from the host's own wallet to the WaveWarz treasury and checked
-- on Base by the battle-voice function before voice switches on. The Open Mic
-- takes no money, so voice there is only for the hosts the founder named.
-- Nothing a browser sends can switch voice on; only the server can.
-- Applied to the live project on 11 Sep 2026 through the Supabase MCP.

alter table public.battles add column if not exists voice_enabled boolean not null default false;
alter table public.battles add column if not exists voice_enabled_at timestamptz;

create table if not exists public.battle_voice_fees (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null unique references public.battles(id) on delete cascade,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  -- True for a host who hosts voice free; no money moved.
  exempt boolean not null default false,
  tx_hash text unique,
  payer_address text,
  amount_raw numeric,
  token_address text,
  quoted_usd numeric,
  price_usd numeric,
  verified_at timestamptz not null default now()
);

alter table public.battle_voice_fees enable row level security;

drop policy if exists "hosts read their own voice fees" on public.battle_voice_fees;
create policy "hosts read their own voice fees" on public.battle_voice_fees
  for select to authenticated
  using (host_user_id = (select auth.uid()));

grant select on public.battle_voice_fees to authenticated;
-- No insert or update grant: only the battle-voice function, as the service role, writes here.

create or replace function public.guard_battle_voice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.voice_enabled := false;
    new.voice_enabled_at := null;
    return new;
  end if;
  if new.voice_enabled is distinct from old.voice_enabled
     or new.voice_enabled_at is distinct from old.voice_enabled_at then
    raise exception 'In-app voice is turned on from the room, once it is paid for or free for this host.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists battles_guard_voice on public.battles;
create trigger battles_guard_voice
  before insert or update on public.battles
  for each row execute function public.guard_battle_voice();
