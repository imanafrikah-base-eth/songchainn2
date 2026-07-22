// The registry of Artist Worlds. One entry per launched world, in launch
// order. Adding a world = adding a WorldConfig here (plus its token config in
// the world-gate edge function). Artist profiles link into their world via
// getWorldByArtistId.

import type { WorldConfig } from './types';
import { CLASSIC_NINE_ROOMS } from './rooms';

export const IMAN_AFRIKAH_WORLD: WorldConfig = {
  slug: 'iman-afrikah',
  worldNumber: 1,
  artistId: '3',
  artistName: 'IMan Afrikah',
  tokenSymbol: '$IMAN',
  chain: 'base',
  // Replaced with the live pool link on deploy day.
  swapUrl: null,
  farcasterUrl: 'https://farcaster.xyz/imanafrikah',
  positioning: '$IMAN is not a fan token. It is the key to my world.',
  story: [
    'IMan Afrikah is a pioneer of the Zambian music scene. From Livingstone Town Square to an onchain catalog of over 80 tracks, the music has always traveled further than the map says it should.',
    'This is his world on songchainn. Not a page, a world. Rooms run deeper than any profile: the Streets are open to everyone, the Screening Room and the Gallery open for fans who hold the key, the Studio and the Request Desk open for insiders, and the Council seats the ten most devoted citizens.',
    'Hold the key and doors open. Sell it and they close. No sign up, no custody, no promises. Access and belonging, nothing else.',
  ],
  featuredSongIds: [],
  rooms: CLASSIC_NINE_ROOMS,
  accent: 'amber',
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
