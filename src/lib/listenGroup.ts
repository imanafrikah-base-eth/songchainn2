/**
 * A song heard together is one stream.
 *
 * In the Room and in a battle one song plays to a whole crowd. Every listener
 * still records their own listen, so an artist can see who was there, but all
 * of those listens carry the same key and the stream count counts the key
 * once. The counting is done in the database (song_play_counts); this only
 * says which shared play a listen belongs to.
 *
 * The Room answers through a resolver rather than a stored key, because a
 * listen reaches its half minute a little after it began: by then the Room can
 * already be lining up the next song, and the listen still belongs to the play
 * it was part of. The resolver is asked for the song actually playing, and it
 * looks that song up in the schedule.
 */

type Resolver = (songId: string | null) => string | null;

let resolver: Resolver | null = null;

export function setListenGroupResolver(next: Resolver | null) {
  resolver = next;
}

/** The shared play this song belongs to right now, if any. */
export function listenGroupNow(songId?: string | null) {
  if (!resolver) return null;
  return resolver(songId ?? null);
}

export const roomListenGroup = (entryId: number | string) => `room:${entryId}`;
export const battleListenGroup = (battleId: string, trackKey: string) => `battle:${battleId}:${trackKey}`;
