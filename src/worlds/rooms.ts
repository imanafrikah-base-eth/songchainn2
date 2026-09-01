// The classic nine-room set — the template world layout proven by World #001.
// Future worlds can clone this set or define their own rooms; the slugs here
// are concept-locked for IMan Afrikah World (spec §02) and survive to the
// spatial phase unchanged.

import type { WorldRoomDef } from './types';

/**
 * The Parlour, where a citizen asks to meet the artist in person.
 *
 * Kept out of CLASSIC_NINE_ROOMS on purpose. The nine are the proven template
 * every world clones; this one commits an artist to showing up for bookings,
 * which is a promise only that artist can make. Worlds opt into it by
 * composing it onto their room list, so no future world inherits an obligation
 * its artist never agreed to.
 *
 * Fan-gated rather than public: the fee is not the gate, the key is. Someone
 * who holds nothing can still watch, listen and walk every open street.
 */
export const THE_PARLOUR: WorldRoomDef = {
  slug: 'parlour',
  name: 'The Parlour',
  ring: 1,
  access: 'fan',
  tagline: 'Ask him in person',
  teaser: 'Book a private word, an appearance on your show, or a night at your venue.',
  hue: 'rose',
  order: 10,
};

export const CLASSIC_NINE_ROOMS: WorldRoomDef[] = [
  {
    slug: 'gate',
    name: 'The Gate',
    ring: 0,
    access: 'public',
    tagline: 'Every world has an entrance',
    teaser: 'The story, three featured tracks, and your way in.',
    hue: 'amber',
    order: 1,
  },
  {
    slug: 'streets',
    name: 'The Streets',
    ring: 0,
    access: 'public',
    tagline: 'The public feed',
    teaser: 'Latest drops from the onchain catalog and the hot chart.',
    hue: 'emerald',
    order: 2,
  },
  {
    slug: 'screening-room',
    name: 'The Screening Room',
    ring: 1,
    access: 'fan',
    tagline: 'Premieres land here first',
    teaser: 'Music videos, interviews, documentaries and visualizers.',
    hue: 'sky',
    order: 3,
  },
  {
    slug: 'gallery',
    name: 'The Gallery',
    ring: 1,
    access: 'fan',
    tagline: 'The visual archive',
    teaser: 'Photos, the cover art archive, lyric sheets and collectible image drops.',
    hue: 'violet',
    order: 4,
  },
  {
    slug: 'studio',
    name: 'The Studio',
    ring: 2,
    access: 'insider',
    tagline: 'Where the music is made',
    teaser: 'Works in progress, demos, stems, voice notes and beat previews.',
    hue: 'rose',
    order: 5,
  },
  {
    slug: 'request-desk',
    name: 'The Request Desk',
    ring: 2,
    access: 'insider',
    tagline: 'You call the next record',
    teaser: 'Submit song requests, vote monthly, watch the queue.',
    hue: 'orange',
    order: 6,
  },
  {
    slug: 'council',
    name: 'The Council',
    ring: 3,
    access: 'council',
    tagline: 'The top ten',
    teaser: 'Guaranteed monthly picks, named release credits, private chat, first listen.',
    hue: 'yellow',
    order: 7,
  },
  {
    slug: 'stage',
    name: 'The Stage',
    ring: null,
    access: 'event',
    tagline: 'Live moments',
    teaser: 'Listening parties, premiere nights and Q&A sessions. The Council gets front row.',
    hue: 'red',
    order: 8,
  },
  {
    slug: 'wall',
    name: 'The Wall',
    ring: null,
    access: 'public',
    tagline: 'The trust layer',
    teaser: 'The supporters wall: leaderboard, credits history and transparency reports.',
    hue: 'cyan',
    order: 9,
  },
];
