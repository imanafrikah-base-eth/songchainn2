import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PostComment } from '@/types/social';

const PROFILE_COLUMNS = 'id,user_id,display_name,profile_name,username,avatar_url,profile_picture_url';
/** How many of the newest comments a feed card shows under its caption. */
export const PREVIEW_COUNT = 2;

/**
 * The latest one or two comments for every card in a feed, in ONE query.
 *
 * A conversation you cannot see is a conversation nobody joins: in 184 posts
 * there had been one comment ever, and every one of them was hidden behind a
 * sheet. Fetching per card would be fifty round trips for a feed page, so this
 * takes the newest comments across all the ids at once and splits them up.
 */
export function useCommentPreviews(postIds: string[]) {
  const [previews, setPreviews] = useState<Record<string, PostComment[]>>({});
  const key = postIds.join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setPreviews({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('post_comments')
        .select('id,post_id,user_id,content,created_at,edited_at')
        .in('post_id', ids)
        .order('created_at', { ascending: false })
        .limit(Math.min(500, ids.length * 6));
      const rows = ((data as any[]) ?? []);
      const byPost: Record<string, any[]> = {};
      for (const row of rows) {
        const list = (byPost[row.post_id] ??= []);
        if (list.length < PREVIEW_COUNT) list.push(row);
      }
      const userIds = Array.from(new Set(Object.values(byPost).flat().map((c) => c.user_id).filter(Boolean)));
      const profiles = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('audience_profiles')
          .select(PROFILE_COLUMNS)
          .in('user_id', userIds);
        ((profileRows as any[]) ?? []).forEach((p) => {
          profiles.set(String(p.user_id ?? p.id), p);
        });
      }
      if (cancelled) return;
      const next: Record<string, PostComment[]> = {};
      for (const [postId, list] of Object.entries(byPost)) {
        // Oldest first, so the pair reads like a conversation.
        next[postId] = list.reverse().map((c) => ({
          id: c.id,
          post_id: c.post_id,
          user_id: c.user_id,
          content: c.content,
          created_at: c.created_at,
          edited_at: c.edited_at ?? null,
          profile: profiles.get(String(c.user_id)),
        }));
      }
      setPreviews(next);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [key]);

  /** Show a comment at once, before the insert has come back. */
  const addPreview = useCallback((comment: PostComment) => {
    setPreviews((prev) => {
      const list = [...(prev[comment.post_id] ?? []), comment].slice(-PREVIEW_COUNT);
      return { ...prev, [comment.post_id]: list };
    });
  }, []);

  const removePreview = useCallback((postId: string, commentId: string) => {
    setPreviews((prev) => ({ ...prev, [postId]: (prev[postId] ?? []).filter((c) => c.id !== commentId) }));
  }, []);

  const replacePreviews = useCallback((postId: string, comments: PostComment[]) => {
    setPreviews((prev) => ({ ...prev, [postId]: comments.slice(-PREVIEW_COUNT) }));
  }, []);

  return { previews, addPreview, removePreview, replacePreviews };
}
