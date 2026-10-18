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
export function indexSongs(songs: Song[]): Map<string, Song> {
  return new Map(songs.map((song) => [song.id, song]));
}

// The front store: who reaches the rails a stranger sees first.
//
// The rung measures finish, not taste. A rough mix from a founding artist and
// a rough mix from someone who signed up yesterday read the same on a meter,
// so the meter alone cannot keep the front store sounding like SONGCHAINN.
// What can is the verified mark (artist_accounts.is_verified), which the
// founder grants by hand to artists who rep the place.
//
// Anyone can still upload and publish. An unverified artist's records get a
// page, a player, a share link, search, All Catalogs and their own profile.
// They do not get New Releases, the opening record, Hot Today, featured rails,
// the landing page or the artist faces until the founder verifies them, and
// the moment he does, everything they have already released moves up with
// them.

type FrontStorable = Pick<Song, 'qualityTier' | 'artistId'>;
type IsVerified = (artistId?: string | null) => boolean;

/**
 * True when a track belongs on the front store. Founding-catalog tracks carry
 * no rung and always do; an uploaded track needs a verified artist.
 */
export function onFrontStore(song: FrontStorable, isVerifiedArtist: IsVerified): boolean {
  if (!song.qualityTier) return true;
  return isVerifiedArtist(song.artistId);
}

/** Same rule for a catalog: it is on the front when its artist is. */
export function catalogOnFrontStore(
  catalog: Pick<Catalog, 'songIds' | 'artistId'>,
  songById: Map<string, FrontStorable>,
  isVerifiedArtist: IsVerified,
): boolean {
  const known = catalog.songIds.map((id) => songById.get(id)).filter(Boolean) as FrontStorable[];
  if (known.length === 0) return true;
  return known.some((song) => onFrontStore(song, isVerifiedArtist));
}
