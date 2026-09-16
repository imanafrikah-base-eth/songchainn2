import { useMemo } from 'react';
import { ARTISTS, SONGS, type Artist, type Song } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import type { SocialPostWithProfile } from '@/types/social';
import { battleIdFromPost } from '@/components/social/FeedVisuals';

/**
 * What a feed post is about, looked up in the whole catalogue.
 *
 * The feed used to find a post's song in the founding catalogue only, so every
 * like, pulse or share of an uploaded record drew a grey circle with a music
 * note where the artwork should be (founder, 15 Sep 2026: "dont add those kinda
 * post with the ugly placeholders").
 */
export interface FeedCatalog {
  songById: Map<string, Song>;
  artistById: Map<string, Artist>;
  songsByArtist: Map<string, Song[]>;
}

export function useFeedCatalog(): FeedCatalog {
  const { songs: published, artists: publishedArtists } = usePublishedCatalog();
  return useMemo(() => {
    const songById = new Map<string, Song>();
    for (const s of [...SONGS, ...published]) if (!songById.has(String(s.id))) songById.set(String(s.id), s);
    const artistById = new Map<string, Artist>();
    for (const a of [...ARTISTS, ...publishedArtists]) if (!artistById.has(String(a.id))) artistById.set(String(a.id), a);
    const songsByArtist = new Map<string, Song[]>();
    for (const s of songById.values()) {
      const list = songsByArtist.get(String(s.artistId)) ?? [];
      list.push(s);
      songsByArtist.set(String(s.artistId), list);
    }
    return { songById, artistById, songsByArtist };
  }, [published, publishedArtists]);
}

/** The record a post plays: its own song, or the best known song of the artist it is about. */
export function resolvePostSong(post: SocialPostWithProfile, catalog: FeedCatalog): Song | null {
  if (post.song_id) return catalog.songById.get(String(post.song_id)) ?? null;
  if (post.post_type === 'artist_follow' && post.artist_id) {
    const list = catalog.songsByArtist.get(String(post.artist_id)) ?? [];
    return [...list].sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0))[0] ?? null;
  }
  return null;
}

/** Posts that carry a real song, picture or clip as their subject. */
export function postHasOwnVisual(post: SocialPostWithProfile, catalog: FeedCatalog): boolean {
  if (post.media_url || post.songcard) return true;
  const song = resolvePostSong(post, catalog);
  if (song?.coverImage) return true;
  if (post.post_type === 'artist_follow' && post.artist_id && catalog.artistById.get(String(post.artist_id))?.profileImage) return true;
  return false;
}

/**
 * Whether a post has anything worth a full screen. A post about a song nobody
 * can find any more, a welcome card, or an empty activity row is left out
 * rather than drawn as a placeholder. Battles, the Room and posts with real
 * words keep their own designed visuals.
 */
export function isShowablePost(post: SocialPostWithProfile, catalog: FeedCatalog): boolean {
  if (postHasOwnVisual(post, catalog)) return true;
  // A song post whose song is gone is nothing to look at.
  if (post.song_id || post.post_type === 'song_like' || post.post_type === 'song_pulse' || post.post_type === 'song_comment') return false;
  if (post.post_type === 'welcome') return false;
  if (battleIdFromPost(post)) return true;
  if (post.post_type === 'activity' && post.activity_type === 'room_entered') return true;
  if (post.post_type === 'activity' && post.activity_type === 'playlist_created') return false;
  return !!post.content?.trim();
}

/** The sections of the feed. */
export type FeedSection = 'foryou' | 'following' | 'videos' | 'photos';

/** Anything that plays a record: a song card, a pulse, a listen. */
export function hasPlayCard(post: SocialPostWithProfile): boolean {
  return Boolean(post.songcard || post.song_id || post.post_type === 'song_pulse');
}

export function postInSection(post: SocialPostWithProfile, section: FeedSection): boolean {
  const isVideo = post.media_kind === 'video' && !!post.media_url;
  const isRoom = post.post_type === 'activity' && post.activity_type === 'room_entered';
  // Videos is where things play: clips, song cards, pulses, the Room. Posts is
  // for posts, which is what the founder asked for on 16 Sep 2026 after
  // watching somebody scroll past a wall of them hunting for the music.
  if (section === 'videos') return isVideo || hasPlayCard(post) || isRoom;
  // Posts is what a person sat down and wrote or photographed. The app's own
  // chatter, that somebody followed somebody, that a battle ended, that a
  // playlist exists, is news rather than a post: it still runs in For you and
  // Following, where news belongs.
  if (section === 'photos') {
    if (isVideo || hasPlayCard(post) || isRoom) return false;
    if (post.post_type === 'system' || post.post_type === 'activity') return false;
    if (post.post_type === 'artist_follow') return false;
    return true;
  }
  return true;
}
