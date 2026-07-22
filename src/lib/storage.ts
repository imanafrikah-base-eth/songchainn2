import { supabase } from '@/integrations/supabase/client';

const sanitizeFileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.\-_]/g, '');

export async function uploadPublicImage(params: {
  bucket: 'avaters' | 'covers';
  userId: string;
  file: File;
}) {
  const { bucket, userId, file } = params;

  const ext = file.name.includes('.')
    ? file.name.split('.').pop()
    : 'jpg';

  const base = sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || 'image';
  const objectPath = `${userId}/${Date.now()}-${base}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
      cacheControl: '3600',
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  if (!data?.publicUrl) throw new Error('Failed to generate public URL.');

  return data.publicUrl;
}

// zabal-gamez is a PUBLIC bucket — Zabal Gamez verses go live on the wall
// immediately, so the upload returns a public URL that plays in the browser.
export async function uploadZabalVerse(params: { file: File }) {
  const { file } = params;

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'mp3';
  const base = sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || 'verse';
  const objectPath = `${crypto.randomUUID()}/${base}.${sanitizeFileName(ext || 'mp3')}`;

  const { error: uploadError } = await supabase.storage
    .from('zabal-gamez')
    .upload(objectPath, file, {
      contentType: file.type || 'audio/mpeg',
      cacheControl: '3600',
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('zabal-gamez').getPublicUrl(objectPath);
  if (!data?.publicUrl) throw new Error('Failed to generate public URL.');

  return data.publicUrl;
}

// artist-uploads is a private bucket — submissions aren't reviewed yet, so
// there's no public URL. The submit-artist-application edge function reads
// these back with signed URLs using the service role key.
export async function uploadArtistSubmissionFile(params: {
  submissionId: string;
  label: string;
  file: File;
}) {
  const { submissionId, label, file } = params;

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const objectPath = `${submissionId}/${label}.${sanitizeFileName(ext || 'bin')}`;

  const { error: uploadError } = await supabase.storage
    .from('artist-uploads')
    .upload(objectPath, file, {
      contentType: file.type || 'application/octet-stream',
    });

  if (uploadError) throw uploadError;

  return objectPath;
}
