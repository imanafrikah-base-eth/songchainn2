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
  /** The moment, when the artist set a time as well as a day. ISO. */
  release_at: string | null;
  publisher: string | null;
  pro: string | null;
  distribution: Distribution;
  onchain_requested_at: string | null;
  /** The EP or album this track sits on, if any, and where on it. */
  release_id: string | null;
  track_number: number | null;
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
  release_at: null,
  publisher: null,
  pro: null,
  distribution: 'app',
  onchain_requested_at: null,
  release_id: null,
  track_number: null,
};

const COLUMNS =
  'lyrics, description, credits, splits, isrc, iswc, language, explicit, release_date, release_at, publisher, pro, distribution, onchain_requested_at, release_id, track_number';

/**
 * An ISRC is two letters of country, three of registrant, two of year and
 * five of designation: twelve characters once the dashes are gone.
 */
export const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export function normaliseIsrc(raw: string | null): string | null {
  const t = (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return t.length ? t : null;
}

export function isValidIsrc(raw: string | null): boolean {
  const t = normaliseIsrc(raw);
  return !t || ISRC_PATTERN.test(t);
}

/** Whole-percent splits either add up to 100 or there are none. */
export function splitsAddUp(splits: Split[]): boolean {
  const named = splits.filter((s) => s.name.trim());
  if (!named.length) return true;
  return named.reduce((sum, s) => sum + (Number(s.share) || 0), 0) === 100;
}

/**
 * Everything that stops a save, in the artist's words. Empty when the
 * details are fine to write.
 */
export function detailProblems(d: SongDetails): string[] {
  const problems: string[] = [];
  if (!isValidIsrc(d.isrc)) problems.push('That ISRC is not the right shape. It is 12 characters, like ZMA012600001.');
  if (!splitsAddUp(d.splits)) problems.push('The splits have to add up to exactly 100 percent.');
  if (d.track_number !== null && d.track_number !== undefined && (!Number.isInteger(d.track_number) || d.track_number < 1)) {
    problems.push('A track number is a whole number starting at 1.');
  }
  if (d.release_date && Number.isNaN(Date.parse(d.release_date))) problems.push('That release date is not a real date.');
  if (d.release_at && Number.isNaN(Date.parse(d.release_at))) problems.push('That release time is not a real time.');
  return problems;
}

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
    release_at: (row.release_at as string | null) ?? null,
    publisher: (row.publisher as string | null) ?? null,
    pro: (row.pro as string | null) ?? null,
    distribution: row.distribution === 'onchain' ? 'onchain' : 'app',
    onchain_requested_at: (row.onchain_requested_at as string | null) ?? null,
    release_id: (row.release_id as string | null) ?? null,
    track_number: typeof row.track_number === 'number' ? row.track_number : null,
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
    isrc: normaliseIsrc(d.isrc),
    iswc: text(d.iswc)?.toUpperCase().replace(/\s+/g, '') ?? null,
    language: text(d.language),
    // The day follows the moment, so everything that groups by day agrees with the clock.
    release_date: d.release_at ? new Date(d.release_at).toISOString().slice(0, 10) : text(d.release_date),
    release_at: d.release_at ? new Date(d.release_at).toISOString() : null,
    publisher: text(d.publisher),
    pro: text(d.pro),
    release_id: text(d.release_id),
    track_number: d.track_number && d.track_number > 0 ? Math.round(d.track_number) : null,
  };
}

export async function saveSongDetails(songId: string, details: SongDetails): Promise<void> {
  const problems = detailProblems(details);
  if (problems.length) throw new Error(problems[0]);
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
      release_at: clean.release_at,
      publisher: clean.publisher,
      pro: clean.pro,
      distribution: clean.distribution,
      release_id: clean.release_id,
      track_number: clean.track_number,
      details_updated_at: new Date().toISOString(),
    } as never)
    .eq('id', songId);
  if (error) throw error;
}

/**
 * The record's name and genre, which the upload form sets once and used to
 * be frozen forever. A typo in a title is the most common thing an artist
 * wants to fix the minute after they press send.
 */
export async function saveSongCore(songId: string, core: { title: string; genre: string | null }): Promise<void> {
  const title = core.title.trim();
  if (!title) throw new Error('A record needs a title.');
  const { error } = await supabase
    .from('songs')
    .update({ title, genre: core.genre?.trim() || null, details_updated_at: new Date().toISOString() } as never)
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
