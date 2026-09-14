-- The battle ending and the room closing are two different moments (founder, 14 Sep 2026).
--
-- When the music is done (or the host taps End Battle) the battle is over:
-- status = 'ended', the poll and the trading ground close, the judges are
-- asked for their cards. The room stays open so the host can read the results
-- to the people still in it, on voice. room_closed_at is the host closing that
-- room afterwards; every screen still in it leaves for the battle page then.
-- Only the host can write it, through the existing "hosts update their battles"
-- policy, and nothing closes a room on a timer: the host closes it.

alter table public.battles
  add column if not exists room_closed_at timestamptz;
