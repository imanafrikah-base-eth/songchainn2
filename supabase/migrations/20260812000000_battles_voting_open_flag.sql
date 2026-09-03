-- Host-controlled voting gate for WaveWarz battles.
-- The host panel already had "End Voting" / "Start Voting" and "Pause" buttons,
-- but they only flipped local React state, so nothing reached the audience.
-- This column makes that control real and readable by every client.
alter table public.battles
  add column if not exists voting_open boolean not null default true;

comment on column public.battles.voting_open is
  'When false, the live room hides/disables vote buttons. Host-controlled.';
