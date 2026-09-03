import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

/**
 * Share one song to the feed, without dragging the whole social hook along.
 *
 * ShareSongButton used to call useSocial() purely to reach createPost. That hook
 * opens a realtime channel and fires seven queries on mount, and a share button
 * is rendered once per song card. An artist page with 84 songs was therefore
 * making 588 requests and opening 336 realtime bindings to draw 84 share icons.
 *
 * A share is one insert. It needs no subscription, no prefetched feed, and no
 * follow graph, so it does not need a hook at all.
 */

export type SharePostType = 'text' | 'song_share' | 'playlist_share' | 'listening';

export async function shareToFeed(params: {
  content?: string;
  postType?: SharePostType;
  songId?: string;
  playlistId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'The feed is not connected yet.' };
  }

  const { data: session } = await supabase.auth.getUser();
  const uid = session?.user?.id;
  if (!uid) return { ok: false, error: 'Sign in to share to your feed.' };

  const content = (params.content ?? '').trim();
  const songId = (params.songId ?? '').trim();
  const playlistId = (params.playlistId ?? '').trim();

  if (!content && !songId && !playlistId) {
    return { ok: false, error: 'There is nothing in this post.' };
  }

  const { error } = await supabase.from('social_posts').insert({
    user_id: uid,
    content: content || null,
    post_type: params.postType ?? (songId ? 'song_share' : 'text'),
    song_id: songId || null,
    playlist_id: playlistId || null,
  } as never);

  if (error) {
    console.error('shareToFeed insert failed', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
