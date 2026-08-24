// Placement: what the front store pushes.
//
// Publishing is free. Placement is earned. That distinction is the whole
// reason an artist can release on SONGCHAINN the same minute they upload,
// without the front store filling up with unfinished records and without the
// founder sitting in the middle of it as the bottleneck.
//
// The audition (api/_standard.mjs) puts every uploaded track on a rung:
//
//   master   meets the full standard the founding catalog set
//   release  clean professional delivery
//   raw      out and playable, still short of clean delivery
//
// A 'raw' track is a real release. It gets a page, a player, a share link, a
// place in New Releases, in All Catalogs, on the artist's own page and in
// search. Its artist can build an audience with it and distribute it direct
// to fans. What it does not get is a push: the hero rails we choose to render
// prominently, and the onchain verified badge that reads as us vouching for
// the record.
//
// Founding-catalog tracks carry no rung at all and are always eligible. They
// are the records the standard was measured from.
//
// Nothing here is a judgement about whether a song is good. The rung measures
// whether a record was finished properly, and that is all it measures.

import type { Song, Catalog } from '@/data/musicData';

type Placeable = Pick<Song, 'qualityTier'>;

/**
 * True when a track has earned a push. False only for 'raw'.
 */
export function earnedPlacement(song: Placeable): boolean {
  return song.qualityTier !== 'raw';
}

/**
 * True when a catalog has earned a push, meaning at least one track in it is
 * finished.
 *
 * Deliberately "at least one" rather than "every one": a five track EP with
 * four clean masters and one rough cut is a real release and should not lose
 * its featured slot over the rough cut. The rough cut still carries its own
 * rung everywhere it appears on its own.
 */
export function catalogEarnedPlacement(
  catalog: Pick<Catalog, 'songIds'>,
  songById: Map<string, Placeable>,
): boolean {
  const known = catalog.songIds.map((id) => songById.get(id)).filter(Boolean) as Placeable[];
  // A catalog whose songs we cannot resolve is left alone rather than hidden.
  if (known.length === 0) return true;
  return known.some(earnedPlacement);
}

/** Index songs by id, for catalogEarnedPlacement. */
export function indexSongs(songs: Song[]): Map<string, Placeable> {
  return new Map(songs.map((song) => [song.id, song]));
}
