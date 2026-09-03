import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

/**
 * Everything about a record beyond the audio: lyrics, credits, splits and
 * the rights identifiers. All optional, all editable by the artist at any
 * time, all read by anyone who can play the song.
 */

export interface Credit {
  role: string;
  name: string;
}

export interface Split {
  name: string;
  role: string;
  /** Whole percentage points. */
  share: number;
}

export type Distribution = 'app' | 'onchain';

export interface SongDetails {
  lyrics: string | null;
  description: string | null;
  credits: Credit[];
  splits: Split[];
  isrc: string | null;
  iswc: string | null;
  language: string | null;
  explicit: boolean;
  release_date: string | null;
  publisher: string | null;
  pro: string | null;
  distribution: Distribution;
  onchain_requested_at: string | null;
}

export const EMPTY_DETAILS: SongDetails = {
  lyrics: null,
  description: null,
  credits: [],
  splits: [],
  isrc: null,
  iswc: null,
  language: null,
  explicit: false,
  release_date: null,
  publisher: null,
  pro: null,
  distribution: 'app',
  onchain_requested_at: null,
};

const COLUMNS =
  'lyrics, description, credits, splits, isrc, iswc, language, explicit, release_date, publisher, pro, distribution, onchain_requested_at';

function normalise(row: Record<string, unknown> | null): SongDetails {
  if (!row) return EMPTY_DETAILS;
  const credits = Array.isArray(row.credits) ? (row.credits as Credit[]) : [];
  const splits = Array.isArray(row.splits) ? (row.splits as Split[]) : [];
  return {
    lyrics: (row.lyrics as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    credits: credits.filter((c) => c && typeof c.name === 'string'),
    splits: splits.filter((s) => s && typeof s.name === 'string'),
    isrc: (row.isrc as string | null) ?? null,
    iswc: (row.iswc as string | null) ?? null,
    language: (row.language as string | null) ?? null,
    explicit: Boolean(row.explicit),
    release_date: (row.release_date as string | null) ?? null,
    publisher: (row.publisher as string | null) ?? null,
    pro: (row.pro as string | null) ?? null,
    distribution: row.distribution === 'onchain' ? 'onchain' : 'app',
    onchain_requested_at: (row.onchain_requested_at as string | null) ?? null,
  };
}

export function useSongDetails(songId: string | undefined) {
  return useQuery({
    queryKey: ['song-details', songId],
    enabled: Boolean(songId) && isSupabaseConfigured,
    staleTime: 60_000,
    queryFn: async (): Promise<SongDetails> => {
      const { data } = await supabase
        .from('songs')
        .select(COLUMNS)
        .eq('id', songId!)
        .maybeSingle();
      // The generated types predate the details columns; the row is read as plain data.
      return normalise((data as unknown as Record<string, unknown> | null) ?? null);
    },
  });
}

/** Trim strings, drop empty list rows, keep shares as whole numbers. */
export function cleanDetails(d: SongDetails): SongDetails {
  const text = (v: string | null) => {
    const t = (v ?? '').trim();
    return t.length ? t : null;
  };
  return {
    ...d,
    lyrics: text(d.lyrics),
    description: text(d.description),
    credits: d.credits.map((c) => ({ role: c.role.trim(), name: c.name.trim() })).filter((c) => c.name),
    splits: d.splits
      .map((s) => ({ name: s.name.trim(), role: s.role.trim(), share: Math.max(0, Math.min(100, Math.round(Number(s.share) || 0))) }))
      .filter((s) => s.name),
    isrc: text(d.isrc)?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? null,
    iswc: text(d.iswc)?.toUpperCase().replace(/\s+/g, '') ?? null,
    language: text(d.language),
    release_date: text(d.release_date),
    publisher: text(d.publisher),
    pro: text(d.pro),
  };
}

export async function saveSongDetails(songId: string, details: SongDetails): Promise<void> {
  const clean = cleanDetails(details);
  const { error } = await supabase
    .from('songs')
    .update({
      lyrics: clean.lyrics,
      description: clean.description,
      credits: clean.credits,
      splits: clean.splits,
      isrc: clean.isrc,
      iswc: clean.iswc,
      language: clean.language,
      explicit: clean.explicit,
      release_date: clean.release_date,
      publisher: clean.publisher,
      pro: clean.pro,
      distribution: clean.distribution,
      details_updated_at: new Date().toISOString(),
    } as never)
    .eq('id', songId);
  if (error) throw error;
}

/** The artist asks for a coin. The mint itself is done by the platform's signer. */
export async function requestOnchain(songId: string): Promise<void> {
  const { error } = await supabase
    .from('songs')
    .update({ distribution: 'onchain', onchain_requested_at: new Date().toISOString() } as never)
    .eq('id', songId);
  if (error) throw error;
}

/* ----------------------------------------------------------- activity --- */

export interface DayCount {
  day: string;
  plays: number;
}
export interface CityCount {
  city: string;
  country: string | null;
  plays: number;
}
export interface SourceCount {
  source: string;
  plays: number;
}

export interface SongActivity {
  song_id: string;
  plays_total: number;
  plays_7d: number;
  plays_30d: number;
  listeners_30d: number;
  by_day: DayCount[];
  cities: CityCount[];
  sources: SourceCount[];
  saves: number;
  purchases: number;
  copies_sold: number;
  usd_volume: number;
  holders: number;
}

export interface PerSongActivity {
  song_id: string;
  title: string;
  plays_30d: number;
  plays_total: number;
  saves: number;
  purchases: number;
  usd_volume: number;
  holders: number;
}

export interface Purchase {
  song_id: string;
  title: string;
  copies: number;
  usd: number;
  eth: number;
  tx_hash: string | null;
  at: string;
}

export interface ArtistActivity {
  artist_id: string;
  songs: number;
  plays_total: number;
  plays_30d: number;
  listeners_30d: number;
  by_day: DayCount[];
  cities: CityCount[];
  sources: SourceCount[];
  saves: number;
  followers: number;
  purchases: number;
  usd_volume: number;
  holders: number;
  per_song: PerSongActivity[];
  /** Only present for the artist or an admin. */
  money: Purchase[] | null;
}

export function useSongActivity(songId: string | undefined) {
  return useQuery({
    queryKey: ['song-activity', songId],
    enabled: Boolean(songId) && isSupabaseConfigured,
    staleTime: 60_000,
    queryFn: async (): Promise<SongActivity | null> => {
      const { data, error } = await supabase.rpc('song_activity' as never, { _song_id: songId } as never);
      if (error) return null;
      return (data as SongActivity | null) ?? null;
    },
  });
}

export function useArtistActivity(artistId: string | null | undefined) {
  return useQuery({
    queryKey: ['artist-activity', artistId],
    enabled: Boolean(artistId) && isSupabaseConfigured,
    staleTime: 60_000,
    queryFn: async (): Promise<ArtistActivity | null> => {
      const { data, error } = await supabase.rpc('artist_activity' as never, { _artist_id: artistId } as never);
      if (error) return null;
      return (data as ArtistActivity | null) ?? null;
    },
  });
}
