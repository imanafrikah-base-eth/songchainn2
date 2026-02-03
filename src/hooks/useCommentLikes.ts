import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { PostComment } from '@/types/social';

export function useCommentLikes() {
  const { user } = useAuth();

  const fetchCommentLikesData = useCallback(async (comments: PostComment[]): Promise<PostComment[]> => {
    if (!user || comments.length === 0) return comments;

    const commentIds = comments.map(c => c.id);

    const [likesCountRes, userLikesRes] = await Promise.all([
      supabase
        .from('comment_likes')
        .select('comment_id')
        .in('comment_id', commentIds),
      supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', user.id)
        .in('comment_id', commentIds)
    ]);

    const likesCount = new Map<string, number>();
    likesCountRes.data?.forEach(l => {
      likesCount.set(l.comment_id, (likesCount.get(l.comment_id) || 0) + 1);
    });

    const userLikedComments = new Set(userLikesRes.data?.map(l => l.comment_id) || []);

    return comments.map(comment => ({
      ...comment,
      likes_count: likesCount.get(comment.id) || 0,
      is_liked: userLikedComments.has(comment.id)
    }));
  }, [user]);

  const toggleCommentLike = useCallback(async (
    commentId: string, 
    commentUserId: string,
    isCurrentlyLiked: boolean
  ): Promise<{ success: boolean; newLikesCount: number; isLiked: boolean }> => {
    if (!user) return { success: false, newLikesCount: 0, isLiked: false };

    try {
      if (isCurrentlyLiked) {
        await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('comment_likes')
          .insert({ comment_id: commentId, user_id: user.id });

        // Create notification for the comment author
        if (commentUserId !== user.id) {
          await supabase.from('notifications').insert({
            user_id: commentUserId,
            type: 'comment_like',
            from_user_id: user.id,
            message: 'liked your comment'
          });
        }
      }

      // Get updated count
      const { count } = await supabase
        .from('comment_likes')
        .select('*', { count: 'exact', head: true })
        .eq('comment_id', commentId);

      return {
        success: true,
        newLikesCount: count || 0,
        isLiked: !isCurrentlyLiked
      };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error toggling comment like:', error);
      }
      return { success: false, newLikesCount: 0, isLiked: isCurrentlyLiked };
    }
  }, [user]);

  return {
    fetchCommentLikesData,
    toggleCommentLike
  };
}
