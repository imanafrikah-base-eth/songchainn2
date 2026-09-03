-- Citizens: who a person is inside an artist world.
--
-- One row per person per world: the name they go by there and the few numbers
-- that draw their avatar. Avatars are drawn from these values rather than
-- stored as images, so this table stays tiny no matter how many people arrive.
--
-- INCOGNITO IS ENFORCED HERE, NOT IN THE INTERFACE.
--
-- The world shows you other people standing in the same street. Someone who
-- has switched incognito on must be invisible to everyone, and "the client
-- filters them out" is not invisibility: anyone reading the network response
-- would still see them. So the read policy below refuses to return an
-- incognito citizen to anybody except themselves. A person who wants to be
-- unseen is genuinely unseen, at the database.
--
-- Nothing here holds a wallet, an email, or a balance. It is a name and a
-- drawing. Balances are read live from chain by world-gate and never stored,
-- so this table cannot leak what anyone is worth.

create table if not exists public.world_citizens (
  id           uuid primary key default gen_random_uuid(),
  world_slug   text not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- What they go by in this world. Not their account name, not their email.
  display_name text check (display_name is null or char_length(display_name) <= 40),
  -- The avatar as { skin, outfit, hair, accessory }. Validated in the client
  -- and re-checked against holdings on render, because a look tied to holding
  -- the key must stop working the moment the key is sold.
  avatar       jsonb not null default '{}'::jsonb,
  incognito    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (world_slug, user_id)
);

comment on table public.world_citizens is
  'One row per person per artist world: their name there and the numbers that draw their avatar. Incognito citizens are hidden by the read policy itself, not by client filtering.';

create index if not exists world_citizens_street_idx
  on public.world_citizens (world_slug)
  where incognito = false;

drop trigger if exists update_world_citizens_updated_at on public.world_citizens;
create trigger update_world_citizens_updated_at
  before update on public.world_citizens
  for each row execute function public.update_updated_at_column();

alter table public.world_citizens enable row level security;

-- Seeing the street: visible citizens are public, and you can always see
-- yourself. An incognito citizen is returned to nobody else, by anyone,
-- authenticated or not.
drop policy if exists "Visible citizens are public" on public.world_citizens;
create policy "Visible citizens are public"
  on public.world_citizens for select
  using (incognito = false or (select auth.uid()) = user_id);

-- Becoming a citizen, and changing how you look.
drop policy if exists "People create their own citizen" on public.world_citizens;
create policy "People create their own citizen"
  on public.world_citizens for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "People update their own citizen" on public.world_citizens;
create policy "People update their own citizen"
  on public.world_citizens for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "People delete their own citizen" on public.world_citizens;
create policy "People delete their own citizen"
  on public.world_citizens for delete
  to authenticated
  using ((select auth.uid()) = user_id);
