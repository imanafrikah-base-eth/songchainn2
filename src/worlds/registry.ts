// The registry of Artist Worlds. One entry per launched world, in launch
// order. Adding a world = adding a WorldConfig here (plus its token config in
// the world-gate edge function). Artist profiles link into their world via
// getWorldByArtistId.

import type { WorldConfig } from './types';
import { CLASSIC_NINE_ROOMS, THE_PARLOUR } from './rooms';
import { CLASSIC_FIVE_CITIES } from './cities';

/**
 * IMan's world art. His, and only his.
 *
 * These twenty one pieces were commissioned for World #001 and are not a
 * starter pack: no other world may point at /world-assets. Another artist who
 * wants a set like it buys one, at the equivalent of twenty dollars a piece,
 * from the Worlds Marketplace. That rule is kept honest by where the paths
 * live rather than by anyone remembering it: this file is the only module in
 * the codebase that names the folder, and every other world takes its art from
 * its own row in the worlds table by way of loader.ts, so a builder-made world
 * has no way to reach these even by accident.
 *
 * They live in public/, not in src/assets/.
 *
 * The bundler is the wrong owner for it: seventeen loops and their stills are
 * nine megabytes, none of it is imported by any module, and all of it wants to
 * be fetched on demand by an <img> or a <video> rather than hashed into the
 * build. Being a plain path also means the 3D city can hand these straight to
 * a TextureLoader with no CORS detour, which R2-hosted artwork cannot do.
 */
const ART = '/world-assets';

/**
 * The town square hero, exported separately so the file name still reads at
 * the call site. It is the top-cropped banner: IMan sits in the upper third
 * of the frame, and the lower half of the picture is never on screen.
 */
const SQUARE_HERO_STILL = `${ART}/square-hero.jpg`;

export const IMAN_AFRIKAH_WORLD: WorldConfig = {
  slug: 'iman-afrikah',
  worldNumber: 1,
  artistId: '3',
  artistName: 'IMan Afrikah',
  tokenSymbol: '$IMAN',
  chain: 'base',
  // $IMAN went live on Base 26 Aug 2026. Token 0x58f65dF9566C85E125855E97391F52Dc375bA37e,
  // pool 0x4cC581A56DD250AA3C4F4c58B55d33dDbbcBa089 (Uniswap v3, IMAN/WETH, 1% tier).
  // The world-gate edge function is still the only authority on access; this
  // link is display only, for the visitor who wants to pick up a key.
  swapUrl:
    'https://app.uniswap.org/swap?chain=base&outputCurrency=0x58f65dF9566C85E125855E97391F52Dc375bA37e',
  farcasterUrl: 'https://farcaster.xyz/imanafrikah',
  positioning: '$IMAN is not a fan token. It is the key to my world.',
  story: [
    'IMan Afrikah is a pioneer of the Zambian music scene. From Livingstone Town Square to an onchain catalog of over 80 tracks, the music has always traveled further than the map says it should.',
    'This is his world on songchainn. Not a page, a world. Rooms run deeper than any profile: the Streets are open to everyone, the Screening Room and the Gallery open for fans who hold the key, the Studio and the Request Desk open for insiders, and the Council seats the ten most devoted citizens.',
    'Hold the key and doors open. Sell it and they close. No sign up, no custody, no promises. Access and belonging, nothing else.',
  ],
  featuredSongIds: [],
  // IMan opted into bookings, so the Parlour joins the nine. It belongs to no
  // city and stands in the town square.
  rooms: [...CLASSIC_NINE_ROOMS, THE_PARLOUR],
  cities: CLASSIC_FIVE_CITIES,
  accent: 'amber',
  // Every slot below is IMan's own art, made for this world and named to the
  // asset sheet (plans/IMAN_WORLD_ASSET_PROMPTS). Stills are frame zero of
  // their own loop, so a still and its motion are the same picture. The
  // album covers and press photos that stood in here until now are gone from
  // the world; they still do their job in the catalog, where they belong.
  heroImage: SQUARE_HERO_STILL,
  heroVideo: `${ART}/square-hero.mp4`,
  roomArt: {
    gate: `${ART}/room-gate.jpg`,
    streets: `${ART}/room-streets.jpg`,
    'screening-room': `${ART}/room-screening.jpg`,
    gallery: `${ART}/room-gallery.jpg`,
    studio: `${ART}/room-studio.jpg`,
    'request-desk': `${ART}/room-request.jpg`,
    council: `${ART}/room-council.jpg`,
    stage: `${ART}/room-stage.jpg`,
    wall: `${ART}/room-wall.jpg`,
    parlour: `${ART}/room-parlour.jpg`,
  },
  roomVideo: {
    gate: `${ART}/room-gate.mp4`,
    streets: `${ART}/room-streets.mp4`,
    'screening-room': `${ART}/room-screening.mp4`,
    gallery: `${ART}/room-gallery.mp4`,
    studio: `${ART}/room-studio.mp4`,
    'request-desk': `${ART}/room-request.mp4`,
    council: `${ART}/room-council.mp4`,
    stage: `${ART}/room-stage.mp4`,
    wall: `${ART}/room-wall.mp4`,
    parlour: `${ART}/room-parlour.mp4`,
  },
  // Skyline art. All five cities have a tower now, including the two that are
  // still empty: the art is only ever reached for once a city has something
  // standing in it, so Motion and Word keep rendering as fenced plots and the
  // art waits for the day they are not.
  cityArt: {
    music: `${ART}/city-music.jpg`,
    canvas: `${ART}/city-canvas.jpg`,
    motion: `${ART}/city-motion.jpg`,
    vault: `${ART}/city-vault.jpg`,
    word: `${ART}/city-word.jpg`,
  },
  cityVideo: {
    music: `${ART}/city-music.mp4`,
    canvas: `${ART}/city-canvas.mp4`,
    motion: `${ART}/city-motion.mp4`,
    vault: `${ART}/city-vault.mp4`,
    word: `${ART}/city-word.mp4`,
  },
  // The brass doors you walk through. Portrait, because almost everyone
  // arrives on a phone.
  entrance: {
    poster: `${ART}/entrance-doors.jpg`,
    video: `${ART}/entrance.mp4`,
  },
  // The world with depth. Three textures, 418KB together, which is the whole
  // reason the 3D city can afford to have any at all.
  depth: {
    sky: `${ART}/world-sky.jpg`,
    facade: `${ART}/facade-tile.jpg`,
    ground: `${ART}/ground-tile.jpg`,
  },
};

export const WORLDS: WorldConfig[] = [IMAN_AFRIKAH_WORLD];

export function getWorldBySlug(slug: string | undefined): WorldConfig | undefined {
  if (!slug) return undefined;
  const s = slug.toLowerCase();
  return WORLDS.find((w) => w.slug === s);
}

export function getWorldByArtistId(artistId: string | undefined): WorldConfig | undefined {
  if (!artistId) return undefined;
  return WORLDS.find((w) => w.artistId === artistId);
}

export function formatWorldNumber(world: WorldConfig): string {
  return `World #${String(world.worldNumber).padStart(3, '0')}`;
}
