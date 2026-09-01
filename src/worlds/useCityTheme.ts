// "The city wears the record."
//
// Music already carries across every city, because PlayerProvider sits above
// the router in App.tsx and the audio element never unmounts on navigation.
// That is the township running through all of them. This hook makes it
// visible: whatever is playing dresses the world around you. Put on 7USHIMI
// and the sky, the streetlights and the signage move to its palette; switch to
// HIGH-BRED and the same streets redress themselves.
//
// The palette is keyed off the body of work rather than sampled from the cover
// image on the fly. Sampling would mean pulling every cover through a canvas,
// which needs CORS headers the R2 buckets do not send, and would flicker on
// every track change. A fixed palette per body of work is instant, works
// offline, and stays art-directed rather than whatever average a sampler
// happens to return.

import { useMemo } from 'react';
import { useSafePlayerState } from '@/context/PlayerContext';
import type { Song } from '@/data/musicData';
import type { WorldConfig } from './types';

export interface CityTheme {
  /** Accent hex used for glow, grid lines and chrome. */
  accent: string;
  /** Same accent as an rgb triple, for composing rgba() at various alphas. */
  rgb: string;
  /** The body of work currently dressing the city, or null when nothing plays. */
  wearing: string | null;
  /** True while a track by this world's artist is playing. */
  isOwnRecord: boolean;
}

type BodyOfWork = NonNullable<Song['volume']>;

/**
 * One accent per body of work. Tuned by eye against each cover; adjust freely,
 * nothing else depends on these values.
 */
const BODY_PALETTE: Record<BodyOfWork, { accent: string; label: string }> = {
  Vol1: { accent: '#D99E2B', label: '300FRQs Vol.1' },
  Vol2: { accent: '#5FA8D3', label: '300FRQs Vol.2' },
  Vol3: { accent: '#C4553D', label: '300FRQs Vol.3' },
  Vol4: { accent: '#7FB069', label: '300FRQs Vol.4' },
  Vol5: { accent: '#9B6BC4', label: '300FRQs Vol.5' },
  Vol6: { accent: '#E08A3C', label: '300FRQs Vol.6' },
  Vol7: { accent: '#3FA796', label: '300FRQs Vol.7' },
  '3.0': { accent: '#B8C34D', label: '3.0' },
  "ER'TING FLEX": { accent: '#E2564F', label: "ER'TING FLEX" },
  'Lovers EP': { accent: '#D96BA0', label: 'Lovers EP' },
  'LIKE,COMMENT,SUBSCRIBE': { accent: '#4D8FE0', label: 'Like, Comment, Subscribe' },
  '7USHIMI': { accent: '#C9A227', label: '7USHIMI' },
  'HIGH-BRED': { accent: '#8E6FD6', label: 'HIGH-BRED' },
  Single: { accent: '#D99E2B', label: 'Singles' },
};

/** The world's own colour, worn whenever nothing of the artist's is playing. */
const RESTING_ACCENT = '#D99E2B';

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const n = Number.parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  );
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function useCityTheme(world: WorldConfig): CityTheme {
  const player = useSafePlayerState();
  const song = player?.currentSong ?? null;

  return useMemo(() => {
    // Somebody else's record playing still soundtracks the walk, but it does
    // not get to repaint this artist's world.
    const isOwnRecord = Boolean(song && song.artistId === world.artistId);
    const entry = isOwnRecord && song?.volume ? BODY_PALETTE[song.volume] : undefined;
    const accent = entry?.accent ?? RESTING_ACCENT;

    return {
      accent,
      rgb: hexToRgb(accent),
      wearing: entry?.label ?? null,
      isOwnRecord,
    };
  }, [song, world.artistId]);
}
