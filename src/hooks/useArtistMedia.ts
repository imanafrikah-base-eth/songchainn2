import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { shrinkImage } from '@/lib/shrinkImage';

/**
 * An artist's visual work: artwork, photographs, video.
 *
 * The deal is the same one the music gets. Upload with an account and nothing
 * else, because most people who make things do not have a wallet and should not
 * need one to show their work. Coining a piece on Zora is a separate act, taken
 * later, from the artist's own wallet, and until a coin address genuinely comes
 * back from the chain nothing here claims a piece is on chain.
 *
 * The file goes browser to bucket on a presigned PUT and never passes through
 * our servers. The row is reserved server-side first, so the browser never
 * chooses its own storage key, and it stays unpublished until the bytes have
 * actually landed. A tile pointing at an empty key is a broken gallery.
 */

export type MediaKind = 'image' | 'video';
export type CoinStatus = 'none' | 'requested' | 'minted' | 'failed';

export interface ArtistMediaItem {
  id: string;
  user_id: string;
  artist_id: string | null;
  kind: MediaKind;
  title: string | null;
  caption: string | null;
  public_url: string;
  poster_url: string | null;
  mime_type: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  is_published: boolean;
  sort_order: number;
  zora_coin_address: string | null;
  coin_status: CoinStatus;
  coined_at: string | null;
  /** The artist said fans may save this file. Off by default. */
  allow_download: boolean;
  created_at: string;
}

const SELECT =
  'id, user_id, artist_id, kind, title, caption, public_url, poster_url, mime_type, bytes, ' +
  'width, height, duration_seconds, is_published, sort_order, zora_coin_address, coin_status, ' +
  'coined_at, allow_download, created_at';

/** Everything one artist has published, for their public gallery. */
export function useArtistGallery(artistId: string | null | undefined) {
  return useQuery({
    queryKey: ['artist_gallery', artistId],
    enabled: !!artistId,
    queryFn: async (): Promise<ArtistMediaItem[]> => {
      const { data, error } = await supabase
        .from('artist_media' as never)
        .select(SELECT)
        .eq('artist_id', artistId!)
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ArtistMediaItem[];
    },
    staleTime: 30_000,
  });
}

/** Everything the signed-in artist has, published or not, for their own studio. */
export function useMyMedia() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my_media', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ArtistMediaItem[]> => {
      const { data, error } = await supabase
        .from('artist_media' as never)
        .select(SELECT)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ArtistMediaItem[];
    },
    staleTime: 15_000,
  });
}

type Phase = 'idle' | 'preparing' | 'uploading' | 'done' | 'error';

interface UploadState {
  phase: Phase;
  progress: number;
  error: string | null;
  item: ArtistMediaItem | null;
}

const IDLE: UploadState = { phase: 'idle', progress: 0, error: null, item: null };

export function useMediaUpload() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const upload = useCallback(
    async (file: File, meta: { title?: string; caption?: string; /** Keep it off the public gallery: world art, not a post. */ private?: boolean }) => {
      if (!user) {
        setState({ ...IDLE, phase: 'error', error: 'Sign in to upload.' });
        return null;
      }
      setState({ phase: 'preparing', progress: 0, error: null, item: null });

      try {
        // A phone camera writes eight megabytes of detail that nothing here
        // displays. Shrinking first is what makes an upload feel fast on a
        // phone; a video, or a picture already small, is left alone.
        const sending = await shrinkImage(file);

        const { data: ticket, error: ticketError } = await supabase.functions.invoke('upload-url', {
          body: {
            purpose: 'visual',
            title: meta.title ?? file.name.replace(/\.[^.]+$/, ''),
            caption: meta.caption ?? null,
            fileName: sending.name,
            contentType: sending.type,
            fileBytes: sending.size,
          },
        });

        if (ticketError || !ticket?.uploadUrl) {
          const raw =
            (ticketError as { context?: { body?: string } })?.context?.body ||
            ticket?.error ||
            ticketError?.message ||
            'Could not start the upload.';
          throw new Error(readableError(raw));
        }

        setState((s) => ({ ...s, phase: 'uploading', progress: 0 }));
        await putWithProgress(ticket.uploadUrl, sending, (progress) =>
          setState((s) => (s.phase === 'uploading' ? { ...s, progress } : s)),
        );

        // Measure it now that the file is in hand. A gallery that knows the
        // shape of a picture before it loads does not jump about as it fills.
        const dims = await measure(sending, ticket.kind as MediaKind).catch(() => null);

        // Published only now, once the bytes are genuinely in the bucket.
        const { data: row, error: publishError } = await supabase
          .from('artist_media' as never)
          .update({
            // World art stays private to the world unless the artist shows it on their page.
            is_published: !meta.private,
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            duration_seconds: dims?.duration ?? null,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', ticket.mediaId)
          .select(SELECT)
          .maybeSingle();
        if (publishError) throw publishError;

        const item = (row ?? null) as unknown as ArtistMediaItem | null;
        await queryClient.invalidateQueries({ queryKey: ['my_media', user.id] });
        await queryClient.invalidateQueries({ queryKey: ['artist_gallery'] });
        setState({ phase: 'done', progress: 100, error: null, item });
        return item;
      } catch (e) {
        setState({
          phase: 'error',
          progress: 0,
          item: null,
          error: e instanceof Error ? e.message : 'Upload failed.',
        });
        return null;
      }
    },
    [user, queryClient],
  );

  return { ...state, upload, reset };
}

/** Edit a caption, reorder, hide, or delete a piece. */
export function useMediaActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['my_media', user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['artist_gallery'] });
  };

  const update = useMutation({
    mutationFn: async (patch: Partial<ArtistMediaItem> & { id: string }) => {
      const { id, ...fields } = patch;
      const { data, error } = await supabase
        .from('artist_media' as never)
        .update({ ...fields, updated_at: new Date().toISOString() } as never)
        .eq('id', id)
        .select('id');
      if (error) throw error;
      // A refused row level security update returns no error, it just matches
      // nothing, so check rather than trust.
      if (!data || (data as unknown[]).length === 0) {
        throw new Error('That did not save. It may not be yours to change.');
      }
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('artist_media' as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { update, remove };
}

/* ------------------------------------------------------------ helpers --- */

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

/** Width, height and, for video, how long it runs. */
function measure(
  file: File,
  kind: MediaKind,
): Promise<{ width: number; height: number; duration: number | null }> {
  const url = URL.createObjectURL(file);
  const done = <T,>(v: T) => {
    URL.revokeObjectURL(url);
    return v;
  };
  return new Promise((resolve, reject) => {
    if (kind === 'image') {
      const img = new Image();
      img.onload = () => resolve(done({ width: img.naturalWidth, height: img.naturalHeight, duration: null }));
      img.onerror = () => reject(done(new Error('could not read image')));
      img.src = url;
    } else {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () =>
        resolve(
          done({
            width: v.videoWidth,
            height: v.videoHeight,
            duration: Number.isFinite(v.duration) ? Math.round(v.duration * 100) / 100 : null,
          }),
        );
      v.onerror = () => reject(done(new Error('could not read video')));
      v.src = url;
    }
  });
}

/** Edge function errors arrive as a JSON string inside a string. Unwrap once. */
function readableError(raw: unknown): string {
  if (typeof raw !== 'string') return 'Could not start the upload.';
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    /* it was already a plain message */
  }
  return raw.slice(0, 200);
}
