/**
 * Mo$ha's first-run tour.
 *
 * What it replaced: 900ms after a user logged in, Mo$ha fired one 40-word
 * paragraph explaining coins, artists and WaveWarz all at once, with two
 * buttons. Before you had seen a single song. That is not a welcome, it is a
 * pop-up ad for the app you are already standing in, and it read as irritating
 * because it was.
 *
 * What this does instead:
 *
 *  - **Waits for you to do something.** No beat fires on a timer alone. Each
 *    one waits for a real signal: you played a record, you opened an artist,
 *    you reached the feed.
 *  - **One short line at a time.** Every beat is a sentence, not a paragraph.
 *  - **Says something about what you just did**, so it reads as someone
 *    watching with you rather than a script running at you.
 *  - **Stops early if ignored.** Two beats dismissed without a tap and the
 *    tour ends for good. Mo$ha is still there on the button.
 *
 * Beats are also subject to the app-wide interruption budget in
 * src/lib/interruptions.ts, so this can never stack on a banner.
 */

export type TourSignal =
  | 'played-first-song'
  | 'opened-artist'
  | 'reached-feed'
  | 'browsed-a-while';

export interface TourBeat {
  id: string;
  /** The signal that earns this beat. Nothing fires on time alone. */
  on: TourSignal;
  /** One sentence. If you need two, you need a shorter one. */
  line: (ctx: TourContext) => string;
  ctaLabel?: string;
  ctaPath?: string;
  /** Wait this long after the signal, so it lands as a reaction, not a reflex. */
  delayMs?: number;
}

export interface TourContext {
  displayName?: string;
  songTitle?: string;
  artistName?: string;
}

/** Ordered. A beat only becomes eligible once the one before it is spent. */
export const TOUR_BEATS: TourBeat[] = [
  {
    id: 'first-play',
    on: 'played-first-song',
    delayMs: 12_000,
    line: ({ artistName }) =>
      artistName
        ? `That's ${artistName}. Tap the name and you get everything they've put out.`
        : `Nice pick. Tap any artist name and you get everything they've put out.`,
  },
  {
    id: 'ownership',
    on: 'opened-artist',
    delayMs: 6_000,
    line: () => 'No label sits between you and them here. They put it up, you hear it.',
  },
  {
    id: 'the-room',
    on: 'browsed-a-while',
    delayMs: 4_000,
    line: ({ displayName }) =>
      displayName
        ? `${displayName}, The Room is people listening to the same song right now. Want in?`
        : 'The Room is people listening to the same song right now. Want in?',
    ctaLabel: 'Take me there',
    ctaPath: '/room',
  },
  {
    id: 'feed',
    on: 'reached-feed',
    delayMs: 5_000,
    line: () => 'Post what you are playing here. That is how anyone finds anything.',
  },
];

const INDEX_KEY = 'songchainn:mosha-tour-index:v2';
const IGNORED_KEY = 'songchainn:mosha-tour-ignored:v2';
/** Ignored this many beats in a row and the tour is over. */
const IGNORE_LIMIT = 2;

function key(base: string, userId: string) {
  return `${base}:${userId}`;
}

function read(base: string, userId: string): number {
  try {
    return Number(localStorage.getItem(key(base, userId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function write(base: string, userId: string, value: number) {
  try {
    localStorage.setItem(key(base, userId), String(value));
  } catch {
    /* private mode: the tour simply restarts next session */
  }
}

/** The beat this user has earned for `signal`, or null if none is due. */
export function nextBeatFor(userId: string, signal: TourSignal): TourBeat | null {
  if (read(IGNORED_KEY, userId) >= IGNORE_LIMIT) return null;
  const index = read(INDEX_KEY, userId);
  if (index >= TOUR_BEATS.length) return null;
  const beat = TOUR_BEATS[index];
  return beat.on === signal ? beat : null;
}

/** Mark the current beat spent, and whether the user engaged with it. */
export function advanceTour(userId: string, engaged: boolean) {
  write(INDEX_KEY, userId, read(INDEX_KEY, userId) + 1);
  write(IGNORED_KEY, userId, engaged ? 0 : read(IGNORED_KEY, userId) + 1);
}

/** True once there is nothing left to say. */
export function tourFinished(userId: string) {
  return read(INDEX_KEY, userId) >= TOUR_BEATS.length || read(IGNORED_KEY, userId) >= IGNORE_LIMIT;
}
