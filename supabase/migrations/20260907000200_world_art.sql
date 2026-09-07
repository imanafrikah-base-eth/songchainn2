-- Every world gets the art slots World #001 has.
--
-- IMan's world was dressed by hand in code: a hero with a silent loop, the
-- brass entrance, a still and a loop per door, a skyline per city, and three
-- textures for the world with depth. The worlds table only ever held the hero
-- still and the door and city stills. These columns give a built world every
-- slot the code world has, so the Art step in the builder can fill them and
-- the viewer draws a built world exactly the way it draws his.
--
-- All optional. A world with none of them looks exactly as it did.

alter table public.worlds
  add column if not exists hero_video text,
  add column if not exists entrance_poster text,
  add column if not exists entrance_video text,
  add column if not exists room_video jsonb not null default '{}'::jsonb,
  add column if not exists city_video jsonb not null default '{}'::jsonb,
  add column if not exists depth jsonb not null default '{}'::jsonb;

comment on column public.worlds.hero_video is 'Silent loop behind the world map header; hero_image is its poster.';
comment on column public.worlds.entrance_poster is 'The doors a visitor walks through on arrival. Portrait.';
comment on column public.worlds.entrance_video is 'Silent loop for the entrance; entrance_poster is its poster.';
comment on column public.worlds.room_video is 'Silent loops keyed by street slug; room_art holds the posters.';
comment on column public.worlds.city_video is 'Silent loops keyed by city slug; city_art holds the posters.';
comment on column public.worlds.depth is 'Textures for the 3D city: {sky, facade, ground}.';
