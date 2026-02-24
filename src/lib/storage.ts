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
