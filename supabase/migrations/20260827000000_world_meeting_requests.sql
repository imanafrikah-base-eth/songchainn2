-- Booking the artist: requests to meet, made from the Parlour in an artist world.
--
-- A citizen asks for one of three things (a private word, an appearance on
-- their show, a night at their venue), the artist accepts or declines, and
-- only then does money move. Nothing here holds anyone's tokens: payment is
-- wallet to wallet, outside this table, and we record the transaction hash
-- afterwards purely as a receipt. Holding other people's funds to release
-- later is a regulated activity and a booking desk has no business being one.
--
-- The fee is stored on the row rather than recomputed later, because it is the
-- price that was quoted and agreed at the moment of asking. Token prices move;
-- an agreement should not move with them.
--
-- Privacy: a request contains a person's own words and their wallet, so it is
-- readable only by the person who made it and by an admin. It is deliberately
-- NOT public the way likes are. Nobody browses who has been asking to meet.

create table if not exists public.world_meeting_requests (
  id           uuid primary key default gen_random_uuid(),
  world_slug   text not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- The wallet that will pay, captured at request time. Nullable because a
  -- person may connect a different one by the time the booking is accepted.
  wallet       text,
  kind         text not null check (kind in ('one-to-one', 'appearance', 'event')),
  minutes      integer not null check (minutes > 0 and minutes <= 480),
  -- Whole tokens, as quoted. numeric because supply is large and we never want
  -- float rounding anywhere near an agreed price.
  fee_tokens   numeric(38, 0) not null check (fee_tokens >= 0),
  -- Which holder tier earned that price: visitor, fan, insider or council.
  tier         text not null,
  message      text check (message is null or char_length(message) <= 2000),
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined', 'paid', 'done')),
  -- Receipt only, written after the fact. Never a source of truth for access.
  payment_tx   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.world_meeting_requests is
  'Requests to meet an artist, made from the Parlour. Never custodial: payment happens wallet to wallet after acceptance, and payment_tx is only a receipt.';
comment on column public.world_meeting_requests.fee_tokens is
  'Whole tokens quoted and agreed at request time. Deliberately frozen on the row so a moving token price cannot rewrite an agreement.';

create index if not exists world_meeting_requests_user_idx
  on public.world_meeting_requests (user_id, created_at desc);
create index if not exists world_meeting_requests_triage_idx
  on public.world_meeting_requests (world_slug, status, created_at desc);

-- One open request per person per world. Stops a queue nobody can triage from
-- forming, and makes "you already have a request pending" a database fact
-- rather than something the client has to police.
create unique index if not exists world_meeting_requests_one_open_per_person
  on public.world_meeting_requests (world_slug, user_id)
  where status = 'pending';

drop trigger if exists update_world_meeting_requests_updated_at
  on public.world_meeting_requests;
create trigger update_world_meeting_requests_updated_at
  before update on public.world_meeting_requests
  for each row execute function public.update_updated_at_column();

alter table public.world_meeting_requests enable row level security;

-- Asking: you may only ever create a request as yourself.
drop policy if exists "Citizens create their own meeting requests"
  on public.world_meeting_requests;
create policy "Citizens create their own meeting requests"
  on public.world_meeting_requests for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Reading: your own requests, and nobody else's.
drop policy if exists "Citizens read their own meeting requests"
  on public.world_meeting_requests;
create policy "Citizens read their own meeting requests"
  on public.world_meeting_requests for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Withdrawing: you may cancel while it is still pending. Once the artist has
-- answered, the row is the record of that answer and stops being yours to edit.
drop policy if exists "Citizens withdraw their own pending requests"
  on public.world_meeting_requests;
create policy "Citizens withdraw their own pending requests"
  on public.world_meeting_requests for delete
  to authenticated
  using ((select auth.uid()) = user_id and status = 'pending');

-- Triage: admins see the queue and answer it.
drop policy if exists "Admins read every meeting request"
  on public.world_meeting_requests;
create policy "Admins read every meeting request"
  on public.world_meeting_requests for select
  to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists "Admins answer meeting requests"
  on public.world_meeting_requests;
create policy "Admins answer meeting requests"
  on public.world_meeting_requests for update
  to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
