import type { Song } from '@/data/musicData';

/** A tiny deterministic generator, so one seed always gives one order. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Everyone behind a record: its artist id, its collaborators, and each name in
 * the credit ("A & B", "A x B", "A ft B"). Names matter as well as ids because
 * the founding catalogue and uploads can know the same artist by different ids.
 */
export function artistKeysOf(song: Pick<Song, 'artistId' | 'artist' | 'collabArtistIds'>): Set<string> {
  const keys = new Set<string>();
  if (song.artistId) keys.add(`id:${String(song.artistId).toLowerCase()}`);
  for (const id of song.collabArtistIds ?? []) keys.add(`id:${String(id).toLowerCase()}`);
  for (const name of (song.artist ?? '').split(/\s*(?:&|,|\bx\b|\bft\.?|\bfeat\.?|\bfeaturing\b)\s*/i)) {
    const n = name.trim().toLowerCase();
    if (n) keys.add(`name:${n}`);
  }
  return keys;
}

function sharesArtist(a: Set<string>, b: Set<string>): boolean {
  for (const k of a) if (b.has(k)) return true;
  return false;
}

/**
 * The Room's order: every record on SONGCHAINN, shuffled, the same for
 * everybody and changing once a day, and never the same artist twice in a row
 * (the wrap from the last record back to the first included).
 *
 * Input is sorted by id first: the catalogue query does not promise an order,
 * and two listeners must build the identical list to hear the same second.
 */
export function roomOrderForDay<T extends Pick<Song, 'id' | 'artistId' | 'artist' | 'collabArtistIds'>>(
  items: readonly T[],
  day: number = Math.floor(Date.now() / 86_400_000),
): T[] {
  const rand = seededRandom(day * 2654435761);
  const sorted = items.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shuffle = <U,>(list: U[]): U[] => {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  // Spread each artist evenly across the loop. A plain shuffle, or taking the
  // next record that differs, spends the biggest catalogue early and leaves a
  // clump of it at the end (IMan Afrikah holds about a third of the Room). Here
  // an artist with k records gets k evenly spaced slots from a random start,
  // nudged a little so the pattern is not mechanical, and everyone's slots are
  // merged by position.
  const groups = new Map<string, Array<{ song: T; keys: Set<string> }>>();
  for (const song of sorted) {
    const keys = artistKeysOf(song);
    const lead = song.artistId ? `id:${String(song.artistId).toLowerCase()}` : [...keys][0] ?? `song:${song.id}`;
    const group = groups.get(lead) ?? [];
    group.push({ song, keys });
    groups.set(lead, group);
  }
  const placed: Array<{ song: T; keys: Set<string>; pos: number }> = [];
  for (const lead of [...groups.keys()].sort()) {
    const group = shuffle(groups.get(lead)!);
    const k = group.length;
    const start = rand();
    group.forEach((entry, j) => {
      const nudge = (rand() - 0.5) * 0.6;
      placed.push({ ...entry, pos: (j + start + nudge) / k });
    });
  }
  placed.sort((a, b) => a.pos - b.pos || (a.song.id < b.song.id ? -1 : 1));
  const out = placed.map(({ song, keys }) => ({ song, keys }));

  // Repair what the spacing left behind: a record next to one by the same
  // artist (or a shared collaborator) swaps with the nearest record that fits
  // both places. The list loops, so the last and first are neighbours too.
  const n = out.length;
  const clash = (i: number, j: number) => sharesArtist(out[((i % n) + n) % n].keys, out[((j % n) + n) % n].keys);
  const fitsAt = (candidate: number, slot: number, skip: number) =>
    [slot - 1, slot + 1].every((nb) => {
      const idx = ((nb % n) + n) % n;
      return idx === skip || idx === candidate || !sharesArtist(out[candidate].keys, out[idx].keys);
    });
  for (let pass = 0; pass < 4 && n > 2; pass += 1) {
    let fixed = true;
    for (let i = 0; i < n; i += 1) {
      if (!clash(i, i + 1)) continue;
      fixed = false;
      const slot = (i + 1) % n;
      for (let step = 1; step < n; step += 1) {
        const j = (slot + step) % n;
        if (j === i) continue;
        if (fitsAt(j, slot, j) && fitsAt(slot, j, slot)) {
          [out[slot], out[j]] = [out[j], out[slot]];
          break;
        }
      }
    }
    if (fixed) break;
  }
  return out.map((r) => r.song);
}

/** Back-to-back repeats in a looping order (0 when the rule holds). Used by the check script. */
export function countBackToBack(order: ReadonlyArray<Pick<Song, 'artistId' | 'artist' | 'collabArtistIds'>>): number {
  let repeats = 0;
  for (let i = 0; i < order.length && order.length > 1; i += 1) {
    const next = order[(i + 1) % order.length];
    if (sharesArtist(artistKeysOf(order[i]), artistKeysOf(next))) repeats += 1;
  }
  return repeats;
}
