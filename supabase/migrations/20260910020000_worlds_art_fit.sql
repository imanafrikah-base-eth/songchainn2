-- How each piece of art sits in its frame, chosen by the artist: a focus point
-- (x, y as fractions of the picture) and a zoom. Keyed by slot: 'hero',
-- 'entrance', 'ad', 'room:<slug>', 'city:<slug>'. Nothing is cropped on
-- upload any more; the frame is applied where the art is shown.
-- Applied to the live project via MCP on 10 Sep 2026.
alter table public.worlds add column if not exists art_fit jsonb not null default '{}'::jsonb;
