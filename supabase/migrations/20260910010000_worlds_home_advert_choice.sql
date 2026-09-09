-- What a world shows in its advert on Home and the landing page. The artist
-- picks: the entrance loop (the gate), the hero loop, or a clip made for it.
-- Applied to the live project via MCP on 10 Sep 2026.
alter table public.worlds
  add column if not exists ad_kind text not null default 'entrance',
  add column if not exists ad_image text,
  add column if not exists ad_video text;
alter table public.worlds drop constraint if exists worlds_ad_kind_check;
alter table public.worlds add constraint worlds_ad_kind_check check (ad_kind in ('entrance', 'hero', 'custom'));
