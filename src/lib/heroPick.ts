import type { Song } from '@/data/musicData';

/**
 * Which record the app opens on.
 *
 * The order is deliberate and it is a ranking, not a preference:
 *
 *   1. Number one on Hot Today. If the audience has decided something today,
 *      that is the answer, and it changes on its own because Hot Today resets
 *      at midnight.
 *   2. Otherwise the most streamed of the new music. Early in the day, before
 *      anyone has played anything, the newest thing that is actually being
 *      listened to leads.
 *   3. Otherwise a record from the catalog, rotated by the date.
 *
 * The third rule exists because of the requirement that it must change every
 * day. Rules 1 and 2 do that by themselves once there is traffic, but on a
 * quiet day they would both return the same record indefinitely, and the front
 * page would look frozen. Seeding the pick with the date guarantees a different
 * record each morning even with no plays at all.
 */

export interface HeroPick {
  song: Song;
  /** The small line above the title, explaining why this record is here. */
  label: string;
}

/** Days since epoch in local time. Same for everyone on a given calendar day. */
export function dayIndex(now: Date = new Date()): number {
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor(local.getTime() / 86_400_000);
}

export interface HeroInput {
  /** Today's most played, already ranked. */
  hotToday: Song[];
  /** Songs from releases inside the new-music window. */
  newMusic: Song[];
  /** Everything, as the last resort. */
  allSongs: Song[];
  /** Play counts to rank new music by. */
  playsFor?: (song: Song) => number;
  now?: Date;
}

export function pickHeroSong({
  hotToday,
  newMusic,
  allSongs,
  playsFor,
  now,
}: HeroInput): HeroPick | null {
  // 1. Number one today.
  const number1 = hotToday.find((s) => s?.id);
  if (number1) return { song: number1, label: 'Number one today' };

  // 2. The most streamed of the new music.
  if (newMusic.length) {
    const ranked = [...newMusic].sort((a, b) => {
      const pa = playsFor ? playsFor(a) : (a.plays ?? 0);
      const pb = playsFor ? playsFor(b) : (b.plays ?? 0);
      return pb - pa;
    });
    if (ranked[0]) return { song: ranked[0], label: 'New and climbing' };
  }

  // 3. A different record every morning, even on a day with no plays.
  const pool = allSongs.filter((s) => s?.id);
  if (!pool.length) return null;
  const song = pool[dayIndex(now) % pool.length];
  return { song, label: "Today's record" };
}
