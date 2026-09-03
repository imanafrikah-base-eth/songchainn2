-- What the world-gate function verified about a person's holdings, written by
-- the function itself (service role) and never by a browser. Meeting request
-- pricing reads it, so the tier and fee on a booking come from a real balance
-- read on Base rather than from whatever the client typed into the insert.
-- Applied to the live project 3 Sep 2026.

create table if not exists public.world_access_snapshots (
  user_id    uuid not null references auth.users(id) on delete cascade,
  world_slug text not null,
  wallet     text,
  ring1      boolean not null default false,
  ring2      boolean not null default false,
  council    boolean not null default false,
  balance    numeric not null default 0,
  checked_at timestamptz not null default now(),
  primary key (user_id, world_slug)
);

alter table public.world_access_snapshots enable row level security;

drop policy if exists "Citizens read their own access snapshot" on public.world_access_snapshots;
create policy "Citizens read their own access snapshot"
  on public.world_access_snapshots
  for select
  using ((select auth.uid()) = user_id);

-- No insert or update policy on purpose: only the service role writes here.
grant select on public.world_access_snapshots to authenticated;

-- The price of a meeting, decided by the database.
--
-- Base fees and holder discounts mirror src/worlds/meetings.ts. The client
-- still shows a quote, but whatever it inserts for tier, fee_tokens and
-- minutes is overwritten here from the verified snapshot, and a snapshot older
-- than fifteen minutes counts for nothing.
create or replace function public.price_world_meeting_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  snap public.world_access_snapshots%rowtype;
  base numeric;
  discount numeric := 0;
begin
  base := case new.kind
    when 'one-to-one' then 2500000
    when 'appearance' then 7500000
    when 'event'      then 15000000
    else null
  end;
  if base is null then
    raise exception 'Unknown meeting kind: %', new.kind;
  end if;

  new.minutes := case new.kind
    when 'one-to-one' then 15
    when 'appearance' then 30
    else 60
  end;

  select * into snap
    from public.world_access_snapshots
   where user_id = new.user_id
     and world_slug = new.world_slug
     and checked_at > now() - interval '15 minutes';

  if found and snap.council then
    new.tier := 'council'; discount := 0.4;
  elsif found and snap.ring2 then
    new.tier := 'insider'; discount := 0.2;
  elsif found and snap.ring1 then
    new.tier := 'fan';
  else
    new.tier := 'visitor';
  end if;

  new.fee_tokens := round(base * (1 - discount));
  return new;
end;
$$;

drop trigger if exists price_world_meeting_request on public.world_meeting_requests;
create trigger price_world_meeting_request
  before insert on public.world_meeting_requests
  for each row execute function public.price_world_meeting_request();
