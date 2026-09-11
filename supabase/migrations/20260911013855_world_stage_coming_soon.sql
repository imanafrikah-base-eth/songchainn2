-- How a street or a city that is not finished gets shown.
--
-- Until now there were two states, on the map or put away, so an artist with a
-- half-built gallery had to choose between showing an empty room to visitors
-- and hiding the room entirely. Three states, chosen per street and per city:
--
--   open   shown and enterable, the normal thing
--   soon   shown on the map with a Coming soon plate, nobody walks in yet
--   away   off the map completely, kept with everything on it
--
-- `hidden` stays as it was and still means away, so nothing that already reads
-- it changes behaviour. `stage` is the single value the builder now writes.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'world_stage') then
    create type public.world_stage as enum ('open', 'soon', 'away');
  end if;
end $$;

alter table public.world_streets
  add column if not exists stage public.world_stage not null default 'open';
alter table public.world_cities
  add column if not exists stage public.world_stage not null default 'open';

-- Anything already put away keeps being away.
update public.world_streets set stage = 'away' where coalesce(hidden, false) = true and stage = 'open';

-- The two stay in step, whichever one is written, so older code that only
-- knows `hidden` and newer code that only knows `stage` agree.
create or replace function public.world_street_stage_sync()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.stage is distinct from old.stage then
      new.hidden := (new.stage = 'away');
    elsif new.hidden is distinct from old.hidden then
      new.stage := case when new.hidden then 'away'::public.world_stage
                        else 'open'::public.world_stage end;
    end if;
  else
    if coalesce(new.hidden, false) and new.stage = 'open' then
      new.stage := 'away';
    end if;
    new.hidden := (new.stage = 'away');
  end if;
  return new;
end;
$$;

drop trigger if exists world_street_stage_sync on public.world_streets;
create trigger world_street_stage_sync
before insert or update on public.world_streets
for each row execute function public.world_street_stage_sync();
