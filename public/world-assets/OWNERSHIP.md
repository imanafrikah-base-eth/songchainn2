# World #001 art set. IMan Afrikah.

Twenty one pieces, commissioned for IMan Afrikah World and exclusive to it.
They are not a shared theme, not a default, and not a starter pack for the
World Builder.

**Any other artist who wants a set like this buys one, at the equivalent of
USD 20 per piece, listed in the Worlds Marketplace.** Nothing in this folder is
licensed to a second world.

## How the exclusivity is held in code

`src/worlds/registry.ts` is the only module that names `/world-assets`. Every
other world is loaded from its own row in the `worlds` table through
`src/worlds/loader.ts` (`hero_image`, `room_art`, `city_art`), so a world made
in the World Builder has no path to these files even by mistake. If you are
adding a second hardcoded world, give it its own folder. Do not point it here.

## What is in the set

| Piece | Loop | Still | Where it is seen |
|---|---|---|---|
| The grand entrance | `entrance.mp4` | `entrance-doors.jpg` | Full screen on arrival, once per session |
| Town square hero | `square-hero.mp4` | `square-hero.jpg` | Top 420px of the world map |
| Music City | `city-music.mp4` | `city-music.jpg` | Skyline block, and the city banner |
| Canvas City | `city-canvas.mp4` | `city-canvas.jpg` | Skyline block, and the city banner |
| Motion City | `city-motion.mp4` | `city-motion.jpg` | Waiting: the city is an empty plot until videos land |
| Vault City | `city-vault.mp4` | `city-vault.jpg` | Skyline block, and the city banner |
| Word City | `city-word.mp4` | `city-word.jpg` | Waiting: the city is an empty plot until the writing lands |
| The Gate | `room-gate.mp4` | `room-gate.jpg` | Door on the map, banner inside the room |
| The Streets | `room-streets.mp4` | `room-streets.jpg` | Door and banner |
| The Screening Room | `room-screening.mp4` | `room-screening.jpg` | Door and banner |
| The Gallery | `room-gallery.mp4` | `room-gallery.jpg` | Door and banner |
| The Studio | `room-studio.mp4` | `room-studio.jpg` | Door and banner |
| The Request Desk | `room-request.mp4` | `room-request.jpg` | Door and banner |
| The Council | `room-council.mp4` | `room-council.jpg` | Door and banner |
| The Stage | `room-stage.mp4` | `room-stage.jpg` | Door and banner |
| The Wall | `room-wall.mp4` | `room-wall.jpg` | Door and banner |
| The Parlour | `room-parlour.mp4` | `room-parlour.jpg` | Door and banner |
| The night sky | | `world-sky.jpg` | Wrapped around the 3D city, 2048x1024 equirectangular |
| Tower facade | | `facade-tile.jpg` | Every tower in the 3D city, tinted per city hue |
| The ground | | `ground-tile.jpg` | The 3D floor and the town square circle |

Every still is frame zero of its own loop, so it doubles as the video's poster
and the handover from still to motion is invisible. Nine megabytes in total, and
almost none of it is fetched on a normal visit: loops attach their source only
when they scroll into view, and nobody on reduced motion or Save-Data is sent
one at all.

## If a piece is replaced

Keep the file name. The name is the contract with `registry.ts`. Re-cut the
still from the new loop at frame zero so the two never drift apart:

    ffmpeg -y -ss 0 -i room-gate.mp4 -frames:v 1 -q:v 4 room-gate.jpg

## How it is served

`vercel.json` gives `/world-assets/(.*)` a seven day cache with a month of
stale-while-revalidate. Not `immutable`, deliberately: the rule above says a
replaced piece keeps its file name, so an immutable header would strand the old
art in every visitor's cache forever. Seven days means a re-cut piece reaches
everyone within the week, and a loop and its still stay on one policy because
they are the same picture.

The service worker does not touch any of it. `public/sw.js` returns early for
video and for any request carrying a Range header, because a `<video>` fetches
in ranges, the reply is a 206, the Cache API cannot store a 206, and answering a
ranged request with a cached full response is what breaks playback. The browser
handles these natively and the cache header above does the rest.
