import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * The artist side of SONGCHAINN: upload a track, have it auditioned, and see
 * everything you own at whatever stage it is at.
 *
 * An account is all it takes to upload. A wallet is only ever needed to coin a
 * track, never to release one.
 */

export type ReleaseStatus = 'uploading' | 'auditioning' | 'published' | 'workshop';

/**
 * Which rung of the standard a released track landed on.
 *
 * The standard is a ladder, not a door. Almost everything publishes; the rung
 * decides what a track is eligible for, not whether it exists.
 *
 *   master   meets the full SONGCHAINN standard, the bar the founding catalog
 *            set. Carries the mark.
 *   release  clean professional delivery. Eligible for featured placement.
 *   raw      out and playable, but short of clean delivery. Not pushed into
 *            hero slots, editorial or coining until it is tightened.
 */
export type ReleaseTier = 'master' | 'release' | 'raw';

export const TIER_LABEL: Record<ReleaseTier, string> = {
  master: 'Mastered to standard',
  release: 'Release ready',
  raw: 'Room to tighten',
};

export interface AuditionNote {
  code: string;
  metric?: string;
  measured?: number;
  limit?: number;
  target?: string;
  plain: string;
}

export interface AuditionResult {
  ok: boolean;
  passed?: boolean;
  at?: string;
  stage?: string;
  plain?: string;
  tier?: ReleaseTier;
  tierLabel?: string;
  failures?: AuditionNote[];
  advisories?: AuditionNote[];
  /** Exactly what stands between this track and the rung above it. */
  shortfalls?: AuditionNote[];
  hikulu?: string | null;
  nakulu?: string | null;
  metrics?: Record<string, number | string | null>;
}

export interface ArtistRelease {
  id: string;
  title: string | null;
  artist_name: string | null;
  genre: string | null;
  status: ReleaseStatus;
  audio_url: string | null;
  cover_art_url: string | null;
  duration_seconds: number | null;
  created_at: string;
  published_at: string | null;
  audition: AuditionResult | null;
}

/** Every track this artist owns, newest first, at any stage. */
export function useArtistReleases() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['artist_releases', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ArtistRelease[]> => {
      const { data, error } = await supabase
        .from('songs')
        .select('id, title, artist_name, genre, status, audio_url, cover_art_url, duration_seconds, created_at, published_at, audition')
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ArtistRelease[];
    },
    staleTime: 15_000,
  });
}

export type UploadPhase = 'idle' | 'preparing' | 'uploading' | 'auditioning' | 'done' | 'error';

export interface UploadState {
  phase: UploadPhase;
  progress: number;
  error: string | null;
  result: AuditionResult | null;
}

const IDLE: UploadState = { phase: 'idle', progress: 0, error: null, result: null };

export function useTrackUpload() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const upload = useCallback(
    async (
      file: File,
      meta: { title: string; artistName: string; genre?: string; cover?: File | null },
    ) => {
      if (!user) {
        setState({ ...IDLE, phase: 'error', error: 'Sign in to upload.' });
        return;
      }

      setState({ phase: 'preparing', progress: 0, error: null, result: null });

      try {
        // 1. Ask for a short-lived door into our own storage. The row is
        //    reserved server-side so the artist never picks the storage key.
        const cover = meta.cover ?? null;
        const { data: ticket, error: ticketError } = await supabase.functions.invoke('upload-url', {
          body: {
            title: meta.title,
            artistName: meta.artistName,
            genre: meta.genre || null,
            fileName: file.name,
            contentType: file.type,
            fileBytes: file.size,
            ...(cover ? { coverContentType: cover.type, coverBytes: cover.size } : {}),
          },
        });

        if (ticketError || !ticket?.uploadUrl) {
          const message =
            (ticketError as { context?: { body?: string } })?.context?.body ||
            ticket?.error ||
            ticketError?.message ||
            'Could not start the upload.';
          throw new Error(typeof message === 'string' ? safeMessage(message) : 'Could not start the upload.');
        }

        // 2. The file goes straight from this browser to storage. It never
        //    passes through our servers.
        setState((s) => ({ ...s, phase: 'uploading', progress: 0 }));
        await putWithProgress(ticket.uploadUrl, file, (progress) =>
          setState((s) => (s.phase === 'uploading' ? { ...s, progress } : s)),
        );

        // 2b. Artwork, if they gave us any. Only once it is genuinely in the
        //     bucket do we point the song row at it, so a failed cover upload
        //     leaves no broken image behind. It is never fatal: a release with
        //     no artwork still beats no release.
        if (cover && ticket.coverUploadUrl && ticket.coverPublicUrl) {
          try {
            await putWithProgress(ticket.coverUploadUrl, cover, () => undefined);
            await supabase
              .from('songs')
              .update({ cover_art_url: ticket.coverPublicUrl })
              .eq('id', ticket.songId);
          } catch (coverErr) {
            console.error('Cover art upload failed, continuing without it', coverErr);
          }
        }

        // 3. The audition. Measured, then put into words by $HIKULU and NAKULU.
        setState((s) => ({ ...s, phase: 'auditioning', progress: 100 }));
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;

        const res = await fetch('/api/audition', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ songId: ticket.songId }),
        });
        const result = await res.json();

        await queryClient.invalidateQueries({ queryKey: ['artist_releases', user.id] });
        await queryClient.invalidateQueries({ queryKey: ['published_catalog'] });

        if (!res.ok && !result?.status) {
          throw new Error(result?.error || 'The audition could not finish.');
        }

        setState({
          phase: 'done',
          progress: 100,
          error: null,
          result: {
            ok: true,
            passed: result.passed === true,
            failures: result.failures ?? [],
            advisories: result.advisories ?? [],
            hikulu: result.hikulu ?? null,
            nakulu: result.nakulu ?? null,
            metrics: result.metrics ?? undefined,
            plain: result.error ?? undefined,
          },
        });
      } catch (err) {
        setState({
          phase: 'error',
          progress: 0,
          error: err instanceof Error ? err.message : 'Something went wrong.',
          result: null,
        });
      }
    },
    [user, queryClient],
  );

  return { ...state, upload, reset };
}

/** Edge functions return their error as a JSON body; unwrap it when we can. */
function safeMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.error === 'string') return parsed.error;
  } catch {
    /* not JSON, use it as-is */
  }
  return raw;
}

/**
 * XHR rather than fetch: a real progress bar matters when the connection is
 * slow, and plenty of the artists this is built for are on slow connections.
 */
function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}). Check your connection and try again.`));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Try again on a stronger connection.'));
    xhr.send(file);
  });
}
