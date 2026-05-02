import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { SocialPostWithProfile, PostComment } from '@/types/social';
import { AudienceProfile } from '@/types/database';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export function useSocial() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<SocialPostWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [following, setFollowing] = useState<string[]>([]);
  const [followers, setFollowers] = useState<string[]>([]);
  const followingRef = useRef<string[]>([]);

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

    const newFollowing = (followingRes.data || []).map((r: any) => r.following_id).filter(Boolean);
    followingRef.current = newFollowing;
    setFollowing(newFollowing);
    setFollowers((followersRes.data || []).map((r: any) => r.follower_id).filter(Boolean));
  }, [user]);

  const fetchPosts = useCallback(async (feedType: 'all' | 'following' = 'all') => {
    if (!user) {
      setPosts([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const currentFollowing = followingRef.current;

    if (feedType === 'following' && currentFollowing.length === 0) {
      setPosts([]);
      setIsLoading(false);
      return;
    }

    try {
      const baseQuery = supabase
        .from('social_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      const { data: postsData, error: postsError } =
        feedType === 'following'
          ? await baseQuery.in('user_id', Array.from(new Set([user.id, ...currentFollowing])))
          : await baseQuery;

      if (postsError) throw postsError;

      const rows = (postsData as any[]) || [];
      if (rows.length === 0) {
        setPosts([]);
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
    } catch (err) {
      if (import.meta.env.DEV) console.error('fetchPosts failed', err);
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

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

  const createPost = useCallback(
    async (
      content: string,
      postType: 'text' | 'song_share' | 'playlist_share' | 'listening' = 'text',
      songId?: string,
      playlistId?: string
    ): Promise<boolean> => {
      if (!isSupabaseConfigured) {
        toast({
          title: 'Posting unavailable',
          description: 'Connect a Supabase project to enable the social feed.',
          variant: 'destructive',
        });
        return false;
      }

      let payloadForLog:
        | {
            user_id: string;
            content?: string | null;
            post_type?: string;
            song_id?: string | null;
            playlist_id?: string | null;
          }
        | undefined;

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const sessionUser = authData?.user;
        if (!sessionUser) throw new Error('Not authenticated');

        const cleanContent = (content ?? '').trim();
        const cleanSongId = (songId ?? '').trim();
        const cleanPlaylistId = (playlistId ?? '').trim();

        if (!cleanContent && !cleanSongId && !cleanPlaylistId) {
          toast({ title: 'Post cannot be empty', variant: 'destructive' });
          return false;
        }

        const payload: Database['public']['Tables']['social_posts']['Insert'] = {
          user_id: sessionUser.id,
          post_type: postType,
        };

        if (cleanContent) {
          payload.content = cleanContent;
        }
        if (cleanSongId) {
          payload.song_id = cleanSongId;
        }
        if (cleanPlaylistId) {
          payload.playlist_id = cleanPlaylistId;
        }

        payloadForLog = payload as any;

        const { error } = await supabase.from('social_posts').insert(payload);
        if (error) {
          console.error('social_posts insert failed', { error, payload: payloadForLog });
          throw error;
        }

        toast({ title: 'Post shared!' });
        await fetchPosts();
        return true;
      } catch (error: any) {
        const msg = String(error?.message || '');
        console.error('social_posts insert failed', { error: msg, payload: payloadForLog });
        toast({
          title: 'Could not share post',
          description: msg || 'Please check your connection and try again.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast, fetchPosts]
  );

  const deletePost = useCallback(async (postId: string) => {
    if (!user) return;

    const [, , { error }] = await Promise.all([
      supabase.from('post_likes').delete().eq('post_id', postId),
      supabase.from('post_comments').delete().eq('post_id', postId),
      supabase.from('social_posts').delete().eq('id', postId).eq('user_id', user.id),
    ]);

    if (error) {
      toast({ title: 'Could not delete post', description: error.message, variant: 'destructive' });
      return;
    }

    setPosts((prev) => prev.filter((p) => p.id !== postId));
    toast({ title: 'Post deleted' });
  }, [user, toast]);

  const toggleLikePost = useCallback(async (postId: string) => {
    if (!user) return;

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const wasLiked = post.is_liked;

    // Optimistic update
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, is_liked: !wasLiked, likes_count: wasLiked ? Math.max(0, p.likes_count - 1) : p.likes_count + 1 }
        : p
    ));

    const { error } = wasLiked
      ? await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id)
      : await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id } as any);

    if (error) {
      // Revert on failure
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, is_liked: wasLiked, likes_count: wasLiked ? p.likes_count + 1 : Math.max(0, p.likes_count - 1) }
          : p
      ));
      toast({ title: 'Could not update like', description: error.message, variant: 'destructive' });
    }
  }, [user, posts, toast]);

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

        setFollowing((prev) => {
          const next = prev.filter((id) => id !== userId);
          followingRef.current = next;
          return next;
        });
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

        setFollowing((prev) => {
          const next = Array.from(new Set([...prev, userId]));
          followingRef.current = next;
          return next;
        });
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

  // Stable refs so the channel effect below never needs fetchPosts/fetchFollowData
  // as dependencies — those functions change whenever `following` state changes,
  // which would tear down and recreate the channel and hit Supabase's rule that
  // `.on()` cannot be called after `.subscribe()`.
  const feedTypeRef = useRef<'all' | 'following'>('all');
  const fetchPostsRef = useRef(fetchPosts);
  fetchPostsRef.current = fetchPosts;
  const fetchFollowDataRef = useRef(fetchFollowData);
  fetchFollowDataRef.current = fetchFollowData;

  useEffect(() => {
    if (!user) return;
    // Append timestamp so a rapid unmount/remount cycle never reuses a
    // channel name that Supabase still considers subscribed.
    const channelName = `social-feed-${user.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_posts' }, () => {
        void fetchPostsRef.current(feedTypeRef.current);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, () => {
        void fetchPostsRef.current(feedTypeRef.current);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => {
        void fetchPostsRef.current(feedTypeRef.current);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_follows' }, () => {
        void fetchFollowDataRef.current();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]); // only recreate when the logged-in user changes

  const fetchPostsTracked = useCallback((feedType: 'all' | 'following' = 'all') => {
    feedTypeRef.current = feedType;
    return fetchPosts(feedType);
  }, [fetchPosts]);

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
    refetchPosts: fetchPostsTracked
  };
}
