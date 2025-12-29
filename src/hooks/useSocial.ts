import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { SocialPostWithProfile, PostComment } from '@/types/social';
import { AudienceProfile } from '@/types/database';

// Helper to create notifications
const createNotificationRecord = async (
  fromUserId: string,
  toUserId: string,
  type: 'follow' | 'like' | 'comment' | 'mention',
  postId?: string,
  message?: string
) => {
  if (fromUserId === toUserId) return; // Don't notify yourself
  
  await supabase.from('notifications').insert({
    user_id: toUserId,
    type,
    from_user_id: fromUserId,
    post_id: postId || null,
    message: message || null,
  });
};

export function useSocial() {
  const { user, isArtist } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<SocialPostWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [following, setFollowing] = useState<string[]>([]);
  const [followers, setFollowers] = useState<string[]>([]);

  const fetchFollowData = useCallback(async () => {
    if (!user) {
      setFollowing([]);
      setFollowers([]);
      return;
    }

    const [followingRes, followersRes] = await Promise.all([
      supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', user.id),
      supabase
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', user.id)
    ]);

    if (followingRes.data) {
      setFollowing(followingRes.data.map(f => f.following_id));
    }
    if (followersRes.data) {
      setFollowers(followersRes.data.map(f => f.follower_id));
    }
  }, [user]);

  const fetchPosts = useCallback(async (feedType: 'all' | 'following' = 'all') => {
    if (!user) {
      setPosts([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    let query = supabase
      .from('social_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (feedType === 'following' && following.length > 0) {
      query = query.in('user_id', [...following, user.id]);
    }

    const { data: postsData } = await query;

    if (postsData && postsData.length > 0) {
      const userIds = [...new Set(postsData.map(p => p.user_id))];
      const postIds = postsData.map(p => p.id);

      const [profilesRes, likesRes, commentsRes, userLikesRes] = await Promise.all([
        supabase
          .from('audience_profiles')
          .select('*')
          .in('user_id', userIds),
        supabase
          .from('post_likes')
          .select('post_id')
          .in('post_id', postIds),
        supabase
          .from('post_comments')
          .select('post_id')
          .in('post_id', postIds),
        supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds)
      ]);

      const profilesMap = new Map(
        profilesRes.data?.map(p => [p.user_id, p as AudienceProfile]) || []
      );

      const likesCount = new Map<string, number>();
      likesRes.data?.forEach(l => {
        likesCount.set(l.post_id, (likesCount.get(l.post_id) || 0) + 1);
      });

      const commentsCount = new Map<string, number>();
      commentsRes.data?.forEach(c => {
        commentsCount.set(c.post_id, (commentsCount.get(c.post_id) || 0) + 1);
      });

      const userLikedPosts = new Set(userLikesRes.data?.map(l => l.post_id) || []);

      const enrichedPosts: SocialPostWithProfile[] = postsData.map(post => ({
        id: post.id,
        user_id: post.user_id,
        content: post.content,
        song_id: post.song_id,
        playlist_id: post.playlist_id,
        image_url: (post as any).image_url ?? null,
        image_path: (post as any).image_path ?? null,
        post_type: post.post_type as 'text' | 'song_share' | 'playlist_share' | 'listening' | 'welcome' | 'song_like',
        created_at: post.created_at,
        updated_at: post.updated_at,
        profile: profilesMap.get(post.user_id),
        likes_count: likesCount.get(post.id) || 0,
        comments_count: commentsCount.get(post.id) || 0,
        is_liked: userLikedPosts.has(post.id)
      }));

      setPosts(enrichedPosts);
    } else {
      setPosts([]);
    }

    setIsLoading(false);
  }, [user, following]);

  useEffect(() => {
    if (user) {
      fetchFollowData();
    } else {
      setFollowing([]);
      setFollowers([]);
    }
  }, [user, fetchFollowData]);

  useEffect(() => {
    if (user) {
      fetchPosts();
    } else {
      setPosts([]);
      setIsLoading(false);
    }
  }, [user, fetchPosts]);

  // Real-time subscription for new posts
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('social-posts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'social_posts'
        },
        () => {
          // Refetch posts when a new post is created
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchPosts]);

  const createPost = useCallback(async (
    content: string,
    postType: 'text' | 'song_share' | 'playlist_share' | 'listening' = 'text',
    songId?: string,
    playlistId?: string,
    image?: { url: string; path: string }
  ) => {
    if (!user) return;

    if (image && !isArtist) {
      toast({ title: 'Only artists can upload images', variant: 'destructive' });
      return;
    }

    const { error } = await supabase
      .from('social_posts')
      .insert({
        user_id: user.id,
        content,
        post_type: postType,
        song_id: songId || null,
        playlist_id: playlistId || null,
        image_url: image?.url || null,
        image_path: image?.path || null,
      });

    if (error) {
      toast({ title: 'Error creating post', variant: 'destructive' });
      return;
    }

    toast({ title: 'Post shared!' });
    fetchPosts();
  }, [user, isArtist, toast, fetchPosts]);

  const deletePost = useCallback(async (postId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('social_posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', user.id);

    if (!error) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      toast({ title: 'Post deleted' });
    }
  }, [user, toast]);

  const toggleLikePost = useCallback(async (postId: string) => {
    if (!user) return;

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    if (post.is_liked) {
      await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);
    } else {
      await supabase
        .from('post_likes')
        .insert({ post_id: postId, user_id: user.id });
      
      // Create notification for the post owner
      if (post.user_id !== user.id) {
        createNotificationRecord(user.id, post.user_id, 'like', postId);
      }
    }

    setPosts(prev => prev.map(p => 
      p.id === postId 
        ? { 
            ...p, 
            is_liked: !p.is_liked, 
            likes_count: p.is_liked ? p.likes_count - 1 : p.likes_count + 1 
          } 
        : p
    ));
  }, [user, posts]);

  const followUser = useCallback(async (userId: string) => {
    if (!user || userId === user.id) return;

    const isCurrentlyFollowing = following.includes(userId);

    if (isCurrentlyFollowing) {
      await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', userId);
      setFollowing(prev => prev.filter(id => id !== userId));
      toast({ title: 'Unfollowed' });
    } else {
      await supabase
        .from('user_follows')
        .insert({ follower_id: user.id, following_id: userId });
      setFollowing(prev => [...prev, userId]);
      toast({ title: 'Following!' });
      
      // Create notification for the followed user
      createNotificationRecord(user.id, userId, 'follow');
    }
  }, [user, following, toast]);

  const isFollowing = useCallback((userId: string) => {
    return following.includes(userId);
  }, [following]);

  const getPostComments = useCallback(async (postId: string): Promise<PostComment[]> => {
    const { data: commentsData } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (!commentsData || commentsData.length === 0) return [];

    const userIds = [...new Set(commentsData.map(c => c.user_id))];
    const { data: profilesData } = await supabase
      .from('audience_profiles')
      .select('*')
      .in('user_id', userIds);

    const profilesMap = new Map(
      profilesData?.map(p => [p.user_id, p as AudienceProfile]) || []
    );

    return commentsData.map(c => ({
      ...c,
      profile: profilesMap.get(c.user_id)
    }));
  }, []);

  const addComment = useCallback(async (postId: string, content: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: user.id, content });

    if (error) {
      toast({ title: 'Error adding comment', variant: 'destructive' });
      return;
    }

    // Get the post owner to send notification
    const post = posts.find(p => p.id === postId);
    if (post && post.user_id !== user.id) {
      createNotificationRecord(user.id, post.user_id, 'comment', postId, content.substring(0, 100));
    }

    setPosts(prev => prev.map(p => 
      p.id === postId 
        ? { ...p, comments_count: p.comments_count + 1 } 
        : p
    ));
  }, [user, toast, posts]);

  return {
    posts,
    isLoading,
    following,
    followers,
    createPost,
    deletePost,
    toggleLikePost,
    followUser,
    isFollowing,
    getPostComments,
    addComment,
    refetchPosts: fetchPosts
  };
}
