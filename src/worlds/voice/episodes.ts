import { supabase } from '@/integrations/supabase/client';
import { sendFile } from '@/lib/storageUpload';

/**
 * Keeping a live session as an episode.
 *
 * The artist's own browser records the session while it runs, so an episode
 * needs no recording server: when they end the session and choose to keep it,
 * the recording goes up through the same door as every other upload (a row
 * reserved by upload-url, the file sent straight to storage, the relay if that
 * fails), and only then is it marked as a published episode of their world.
 */

export interface KeepEpisodeInput {
  worldSlug: string;
  sessionId: string | null;
  title: string;
  recording: Blob;
  durationSeconds: number | null;
}

/** Resolves to the episode id once it is in storage and published. Throws a plain sentence when it is not. */
export async function keepEpisode(input: KeepEpisodeInput, onProgress?: (pct: number) => void): Promise<string> {
  const type = (input.recording.type || 'audio/webm').split(';')[0];
  const ext = type === 'audio/ogg' ? 'ogg' : type === 'audio/mp4' ? 'm4a' : type === 'audio/mpeg' ? 'mp3' : 'webm';
  const name = `${input.title.trim() || 'episode'}.${ext}`;
  const file = new File([input.recording], name, { type });

  const { data: ticket, error } = await supabase.functions.invoke('upload-url', {
    body: {
      purpose: 'episode',
      worldSlug: input.worldSlug,
      sessionId: input.sessionId,
      title: input.title.trim(),
      fileName: name,
      contentType: type,
      fileBytes: file.size,
    },
  });
  if (error || !ticket?.uploadUrl || !ticket?.episodeId) {
    const raw = (error as { context?: { body?: string } } | null)?.context?.body ?? ticket?.error;
    let message = 'The episode could not start uploading. Try again.';
    try {
      const parsed = typeof raw === 'string' ? (JSON.parse(raw) as { error?: string }) : null;
      if (parsed?.error) message = parsed.error;
    } catch {
      if (typeof raw === 'string' && raw) message = raw.slice(0, 200);
    }
    throw new Error(message);
  }

  await sendFile(ticket.uploadUrl, file, { kind: 'episode', id: ticket.episodeId }, onProgress);

  const { error: publishError } = await supabase
    .from('world_episodes' as never)
    .update({
      is_published: true,
      duration_seconds: input.durationSeconds,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', ticket.episodeId);
  if (publishError) throw new Error('The episode is uploaded but could not be published. Try again from your station.');
  return ticket.episodeId as string;
}
