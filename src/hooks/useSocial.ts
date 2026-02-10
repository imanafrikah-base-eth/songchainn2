import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { SocialPostWithProfile, PostComment } from '@/types/social';
import { AudienceProfile } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';

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
      supabase.from('user_follows').select('following_id').eq('follower_id', user.id),
      supabase.from('user_follows').select('follower_id').eq('following_id', user.id),
    ]);

    setFollowing((followingRes.data || []).map((r: any) => r.following_id).filter(Boolean));
    setFollowers((followersRes.data || []).map((r: any) => r.follower_id).filter(Boolean));
  }, [user]);

  const fetchPosts = useCallback(async (feedType: 'all' | 'following' = 'all') => {
    if (!user) {
      setPosts([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    if (feedType === 'following' && following.length === 0) {
      setPosts([]);
      setIsLoading(false);
      return;
    }

    const baseQuery = supabase
      .from('social_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: postsData } =
      feedType === 'following'
        ? await baseQuery.in('user_id', Array.from(new Set([user.id, ...following])))
        : await baseQuery;

    const rows = (postsData as any[]) || [];
    if (rows.length === 0) {
      setPosts([]);
      setIsLoading(false);
      return;
    }

    const postIds = rows.map((p) => p.id);
    const userIds = Array.from(new Set(rows.map((p) => p.user_id).filter(Boolean)));

    const [profilesByIdRes, profilesByUserIdRes, likesRes, commentsRes, userLikesRes] = await Promise.all([
      supabase.from('audience_profiles').select('*').in('id', userIds),
      supabase.from('audience_profiles').select('*').in('user_id', userIds),
      supabase.from('post_likes').select('post_id,user_id').in('post_id', postIds),
      supabase.from('post_comments').select('post_id').in('post_id', postIds),
      supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', postIds),
    ]);

    const profilesMap = new Map<string, AudienceProfile>();
    ([...(profilesByIdRes.data || []), ...(profilesByUserIdRes.data || [])] as any[]).forEach((p: any) => {
      profilesMap.set(String(p.id), p as any);
      if (p?.user_id) profilesMap.set(String(p.user_id), p as any);
    });

    const likesCount = new Map<string, number>();
    (likesRes.data || []).forEach((l: any) => {
      const pid = String(l.post_id);
      likesCount.set(pid, (likesCount.get(pid) || 0) + 1);
    });

    const commentsCount = new Map<string, number>();
    (commentsRes.data || []).forEach((c: any) => {
      const pid = String(c.post_id);
      commentsCount.set(pid, (commentsCount.get(pid) || 0) + 1);
    });

    const userLikedPosts = new Set<string>((userLikesRes.data || []).map((l: any) => String(l.post_id)));

    const enriched: SocialPostWithProfile[] = rows.map((post) => ({
      id: post.id,
      user_id: post.user_id,
      content: post.content,
      song_id: post.song_id,
      playlist_id: post.playlist_id,
      image_url: (post as any).image_url ?? null,
      image_path: (post as any).image_path ?? null,
      post_type: post.post_type,
      created_at: post.created_at,
      updated_at: post.updated_at,
      profile: profilesMap.get(String(post.user_id)),
      likes_count: likesCount.get(String(post.id)) || 0,
      comments_count: commentsCount.get(String(post.id)) || 0,
      is_liked: userLikedPosts.has(String(post.id)),
      artist_id: null,
      artist_is_verified: null,
    }));

    setPosts(enriched);
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

    const { error } = await supabase.from('social_posts').insert({
      user_id: user.id,
      content,
      song_id: songId || null,
      playlist_id: playlistId || null,
      image_url: image?.url ?? null,
      image_path: image?.path ?? null,
      post_type: postType,
    } as any);

    if (error) {
      toast({ title: 'Failed to share post', variant: 'destructive' });
      return;
    }

    toast({ title: 'Post shared!' });
    await fetchPosts();
  }, [user, isArtist, toast, fetchPosts]);

  const deletePost = useCallback(async (postId: string) => {
    if (!user) return;

    await Promise.all([
      supabase.from('post_likes').delete().eq('post_id', postId),
      supabase.from('post_comments').delete().eq('post_id', postId),
      supabase.from('social_posts').delete().eq('id', postId).eq('user_id', user.id),
    ]);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    toast({ title: 'Post deleted' });
  }, [user, toast]);

  const toggleLikePost = useCallback(async (postId: string) => {
    if (!user) return;

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    if (post.is_liked) {
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id } as any);
    }

    setPosts(prev => prev.map(p => 
      p.id === postId 
        ? { 
            ...p, 
            is_liked: !p.is_liked,
            likes_count: p.is_liked ? Math.max(0, p.likes_count - 1) : p.likes_count + 1 
          } 
        : p
    ));
  }, [user, posts]);

  const followUser = useCallback(
    async (userId: string) => {
      if (!user || userId === user.id) {
        return;
      }

      const isCurrentlyFollowing = following.includes(userId);

      if (isCurrentlyFollowing) {
        const { error } = await supabase
          .from('user_follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);

        if (error) {
          toast({
            title: 'Could not unfollow',
            description: error.message || 'Please try again in a moment.',
            variant: 'destructive',
          });
          return;
        }

        setFollowing((prev) => prev.filter((id) => id !== userId));
        toast({ title: 'Unfollowed' });
      } else {
        const { error } = await supabase
          .from('user_follows')
          .insert({ follower_id: user.id, following_id: userId } as any);

        if (error) {
          toast({
            title: 'Could not follow',
            description: error.message || 'Please check your connection and try again.',
            variant: 'destructive',
          });
          return;
        }

        setFollowing((prev) => Array.from(new Set([...prev, userId])));
        toast({ title: 'Following!' });
      }
    },
    [user, following, toast]
  );

  const isFollowing = useCallback((userId: string) => {
    return following.includes(userId);
  }, [following]);

  const getPostComments = useCallback(async (postId: string): Promise<PostComment[]> => {
    const { data } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    const rows = (data as any[]) || [];
    if (rows.length === 0) return [];

    const userIds = Array.from(new Set(rows.map((c) => c.user_id).filter(Boolean)));
    const [profilesByIdRes, profilesByUserIdRes] = await Promise.all([
      supabase.from('audience_profiles').select('*').in('id', userIds),
      supabase.from('audience_profiles').select('*').in('user_id', userIds),
    ]);
    const profilesMap = new Map<string, AudienceProfile>();
    ([...(profilesByIdRes.data || []), ...(profilesByUserIdRes.data || [])] as any[]).forEach((p: any) => {
      profilesMap.set(String(p.id), p);
      if (p?.user_id) profilesMap.set(String(p.user_id), p);
    });

    return rows.map((c) => ({
      id: c.id,
      post_id: c.post_id,
      user_id: c.user_id,
      content: c.content,
      created_at: c.created_at,
      profile: profilesMap.get(String(c.user_id)),
      artist_id: null,
      artist_is_verified: null,
    }));
  }, []);

  const addComment = useCallback(async (postId: string, content: string) => {
    if (!user) {
      toast({ title: 'Please sign in to comment', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: user.id,
      content,
    } as any);
    if (error) {
      toast({ title: 'Failed to add comment', description: error.message, variant: 'destructive' });
      return;
    }

    setPosts(prev => prev.map(p => 
      p.id === postId 
        ? { ...p, comments_count: p.comments_count + 1 } 
        : p
    ));
  }, [user, toast]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`social-feed-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_posts' }, () => {
        void fetchPosts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, () => {
        void fetchPosts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => {
        void fetchPosts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_follows' }, () => {
        void fetchFollowData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchPosts, fetchFollowData]);

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
