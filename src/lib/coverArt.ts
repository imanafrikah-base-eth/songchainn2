import { supabase } from '@/integrations/supabase/client';
import { shrinkCover } from '@/lib/shrinkImage';
import { sendFile } from '@/lib/storageUpload';

/**
 * Cover art rules, in one place, because every door a record can come
 * through (the Studio, Mo$ha's chat, the details dialog) has to agree on
 * them. A record never goes live without its artwork: the Studio will not
 * send without one, the audition refuses one, and the database refuses to
 * mark a record published without one. The artwork can be replaced any time
 * from Edit details; it can never be removed from a live record.
 */

// Keep in step with MAX_COVER_BYTES in upload-url.
export const MAX_COVER_MB = 8;
// Stores want square art. Under this it is soft on a phone; under 600 it is
// unusable and gets stopped here rather than at the server.
export const COVER_GOOD_PX = 1400;
export const COVER_MIN_PX = 600;
export const COVER_ACCEPT = 'image/jpeg,image/png,image/webp';
export const NO_COVER = 'Add the cover art. Nothing goes live without it.';

export type CoverCheck = { block: string | null; warn: string | null };

/** What is wrong with a cover before a byte of it leaves the phone. */
export async function checkCover(file: File): Promise<CoverCheck> {
  // Judge the size of what will actually be sent, not what came off the
  // camera. landCover shrinks every cover to 1600 pixels before it leaves the
  // phone, so refusing a 12 MB photo here turned away artwork that would have
  // arrived at well under a megabyte. A phone photo is routinely 8 to 12 MB,
  // and this one rule stopped artists uploading for days.
  let sending = file;
  if (sending.size > MAX_COVER_MB * 1024 * 1024) sending = await shrinkCover(sending);
  if (sending.size > MAX_COVER_MB * 1024 * 1024) {
    return {
      block: `That image is still ${(sending.size / (1024 * 1024)).toFixed(1)} MB after shrinking. Covers are ${MAX_COVER_MB} MB at most.`,
      warn: null,
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('unreadable'));
      img.src = url;
    });
    const shortest = Math.min(width, height);
    const ratio = width / height;
    if (ratio > 1.1 || ratio < 0.9) {
      return { block: 'Covers are square. Pick the photo again and drag it square.', warn: null };
    }
    if (shortest < COVER_MIN_PX) {
      return { block: `That image is only ${shortest} pixels across. It needs at least ${COVER_MIN_PX}, and ${COVER_GOOD_PX} looks right.`, warn: null };
    }
    if (shortest < COVER_GOOD_PX) {
      return { block: null, warn: `${shortest} pixels across will look soft on a big screen. ${COVER_GOOD_PX} or more is the store standard.` };
    }
    return { block: null, warn: null };
  } catch {
    return { block: 'We could not read that image. Send a JPG, PNG or WEBP.', warn: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Send a cover through the visual upload door, kept off the public gallery,
 * and resolve to its URL. Throws with a plain sentence when it does not land.
 */
export async function landCover(cover: File, onProgress?: (pct: number) => void): Promise<string> {
  // Square and crisp, but no bigger than anything shows it. A four thousand
  // pixel cover is minutes of a phone's upload spent on detail nobody sees.
  const sending = await shrinkCover(cover);
  const { data: ticket, error } = await supabase.functions.invoke('upload-url', {
    body: { purpose: 'visual', title: 'Cover', fileName: sending.name, contentType: sending.type, fileBytes: sending.size },
  });
  if (error || !ticket?.uploadUrl) throw new Error('The cover art could not start uploading. Check your connection and try again.');
  await sendFile(ticket.uploadUrl, sending, { kind: 'visual', id: ticket.mediaId }, onProgress);
  const { data: row } = await supabase
    .from('artist_media' as never)
    .update({ is_published: false, updated_at: new Date().toISOString() } as never)
    .eq('id', ticket.mediaId)
    .select('public_url')
    .maybeSingle();
  const url = (row as { public_url?: string } | null)?.public_url ?? (typeof ticket.publicUrl === 'string' ? ticket.publicUrl : null);
  if (!url) throw new Error('The cover art did not land. Try again.');
  return url;
}
