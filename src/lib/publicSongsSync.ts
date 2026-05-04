import { ARTISTS, type Artist, type Song } from '@/data/musicData';
import { supabase } from '@/integrations/supabase/client';

type PublicSongRow = {
  id: string;
  title: string;
  artist_name: string;
  audio_url: string;
  cover_art_url: string | null;
  artist_image_url: string | null;
  is_published: true;
};

const lastSyncedFingerprintById = new Map<string, string>();

function normalizeArtistName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildArtistIndexes(artists: Artist[]) {
  const byId = new Map<string, Artist>();
  const byName = new Map<string, Artist>();

  for (const artist of artists) {
    byId.set(artist.id, artist);
    byName.set(normalizeArtistName(artist.name), artist);
  }

  return { byId, byName };
}

function resolveArtistImage(song: Song, artistIndex: ReturnType<typeof buildArtistIndexes>): string | null {
  const byIdMatch = artistIndex.byId.get(song.artistId);
  if (byIdMatch?.profileImage) return byIdMatch.profileImage;

  const byNameMatch = artistIndex.byName.get(normalizeArtistName(song.artist));
  if (byNameMatch?.profileImage) return byNameMatch.profileImage;

  return null;
}

function toPublicSongRow(song: Song, artistIndex: ReturnType<typeof buildArtistIndexes>): PublicSongRow | null {
  const id = String(song.id ?? '').trim();
  const title = String(song.title ?? '').trim();
  const artistName = String(song.artist ?? '').trim();
  const audioUrl = String(song.audioUrl ?? '').trim();

  if (!id || !title || !artistName || !audioUrl) return null;

  return {
    id,
    title,
    artist_name: artistName,
    audio_url: audioUrl,
    cover_art_url: song.coverImage ?? null,
    artist_image_url: resolveArtistImage(song, artistIndex),
    is_published: true,
  };
}

function fingerprintRow(row: PublicSongRow): string {
  return `${row.id}|${row.title}|${row.artist_name}|${row.audio_url}|${row.cover_art_url ?? ''}|${row.artist_image_url ?? ''}|${row.is_published}`;
}

function uniqueBySongId(songs: Song[]): Song[] {
  const byId = new Map<string, Song>();
  for (const song of songs) {
    if (!song?.id) continue;
    byId.set(String(song.id), song);
  }
  return Array.from(byId.values());
}

async function upsertPublicRows(rows: PublicSongRow[]): Promise<void> {
  if (rows.length === 0) return;
  const chunkSize = 200;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize);
    const { error } = await (supabase as any)
      .from('songs')
      .upsert(batch as any, { onConflict: 'id' });
    if (error) throw error;
  }
}

export async function syncPublicSongsInBackground(
  songs: Song[],
  artists: Artist[] = ARTISTS,
): Promise<void> {
  try {
    const artistIndex = buildArtistIndexes(artists);
    const dedupedSongs = uniqueBySongId(songs);

    const rowsToSync: PublicSongRow[] = [];
    for (const song of dedupedSongs) {
      const row = toPublicSongRow(song, artistIndex);
      if (!row) continue;
      const fingerprint = fingerprintRow(row);
      if (lastSyncedFingerprintById.get(row.id) === fingerprint) continue;
      rowsToSync.push(row);
    }

    await upsertPublicRows(rowsToSync);
    for (const row of rowsToSync) {
      lastSyncedFingerprintById.set(row.id, fingerprintRow(row));
    }
  } catch {
    // Silent background sync: never block player or UI.
  }
}

export async function syncOnePublicSongInBackground(
  song: Song,
  artists: Artist[] = ARTISTS,
): Promise<void> {
  await syncPublicSongsInBackground([song], artists);
}
