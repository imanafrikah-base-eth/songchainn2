import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { SocialPostWithProfile, PostComment, TaggedPerson, SongCardData } from '@/types/social';
import { AudienceProfile } from '@/types/database';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { broadcastCountDelta } from '@/hooks/usePopularity';
import { listFollows, saveFollows } from '@/lib/localDb';
import type { Database } from '@/integrations/supabase/types';

function isSyntheticId(id: string | null | undefined): boolean {
  return !!id && (id.startsWith('fc-') || id.startsWith('fb-'));
}

/* A process-wide counter, so two hooks mounting in the same tick cannot share a
   channel name the way a millisecond timestamp let them. */
let socialChannelSeq = 0;
const nextSocialChannelId = () => ++socialChannelSeq;

const PROFILE_COLUMNS = 'id,user_id,display_name,profile_name,username,avatar_url,profile_picture_url,bio,is_official';

/** PostgREST `in.(...)` wants text values quoted; artist ids are free text. */
const quoteList = (ids: string[]) => ids.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');

/**
 * Turn raw social_posts rows into what the feed renders.
 *
 * One place for the shape, so the feed, a single post opened from a link and
 * a person's profile all agree on what a post looks like. Counts, the
 * viewer's own like, the poster's profile, playlist names and tags are all
 * resolved here.
 */
async function enrichPostRows(rows: any[], viewerId: string | null): Promise<SocialPostWithProfile[]> {
  if (rows.length === 0) return [];

  const postIds = rows.map((p) => p.id);
  const userIds = Array.from(new Set(rows.map((p) => p.user_id).filter(Boolean)));
  const playlistIds = Array.from(new Set(
    rows
      .filter((p) => p.post_type === 'activity' && (p as any).activity_type === 'playlist_created' && p.playlist_id)
      .map((p) => p.playlist_id)
  ));

  // Single profile query covering both id and user_id columns, minimal columns only
  const [profilesRes, likesRes, commentsRes, userLikesRes, playlistsRes, tagsRes] = await Promise.all([
    supabase
      .from('audience_profiles')
      .select(PROFILE_COLUMNS)
      .or(`id.in.(${userIds.join(',')}),user_id.in.(${userIds.join(',')})`),
    supabase.from('post_likes').select('post_id').in('post_id', postIds),
    supabase.from('post_comments').select('post_id').in('post_id', postIds),
    viewerId && !isSyntheticId(viewerId)
      ? supabase.from('post_likes').select('post_id').eq('user_id', viewerId).in('post_id', postIds)
      : Promise.resolve({ data: [] as any[] }),
    playlistIds.length > 0
      ? supabase.from('playlists').select('id,name').in('id', playlistIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('post_tags' as never).select('post_id, tagged_user_id').in('post_id', postIds),
  ]);

  const playlistNamesMap = new Map<string, string>();
  ((playlistsRes.data || []) as any[]).forEach((p: any) => {
    if (p?.id) playlistNamesMap.set(String(p.id), p.name);
  });

  const profilesMap = new Map<string, AudienceProfile>();
  ((profilesRes.data || []) as any[]).forEach((p: any) => {
    profilesMap.set(String(p.id), p as any);
    if (p?.user_id) profilesMap.set(String(p.user_id), p as any);
  });

  const likesCount = new Map<string, number>();
  ((likesRes.data || []) as any[]).forEach((l) => {
    const pid = String(l.post_id);
    likesCount.set(pid, (likesCount.get(pid) || 0) + 1);
  });

  const commentsCount = new Map<string, number>();
  (commentsRes.data || []).forEach((c: any) => {
    const pid = String(c.post_id);
    commentsCount.set(pid, (commentsCount.get(pid) || 0) + 1);
  });

  const userLikedPosts = new Set<string>(((userLikesRes as any).data || []).map((l: any) => String(l.post_id)));

  /* Who was tagged in what.
     The people tagged are usually not the people who posted, so their
     profiles were not in the first lookup. Fetch only the ones actually
     missing rather than widening the query for every feed load. */
  const tagRows = ((tagsRes as any)?.data || []) as { post_id: string; tagged_user_id: string }[];
  const taggedIds = Array.from(new Set(tagRows.map((t) => String(t.tagged_user_id))));
  const missingTagged = taggedIds.filter((id) => !profilesMap.has(id));
  if (missingTagged.length) {
    const { data: extra } = await supabase
      .from('audience_profiles')
      .select(PROFILE_COLUMNS)
      .or(`id.in.(${missingTagged.join(',')}),user_id.in.(${missingTagged.join(',')})`);
    ((extra || []) as any[]).forEach((p: any) => {
      profilesMap.set(String(p.id), p as any);
      if (p?.user_id) profilesMap.set(String(p.user_id), p as any);
    });
  }

  const taggedByPost = new Map<string, TaggedPerson[]>();
  tagRows.forEach((t) => {
    const pid = String(t.post_id);
    const prof = profilesMap.get(String(t.tagged_user_id)) as any;
    const list = taggedByPost.get(pid) ?? [];
    list.push({
      user_id: String(t.tagged_user_id),
      display_name: prof?.display_name || prof?.profile_name || prof?.username || 'Someone',
      username: prof?.username ?? null,
      avatar_url: prof?.profile_picture_url || prof?.avatar_url || null,
    });
    taggedByPost.set(pid, list);
  });

  return rows.map((post) => ({
    id: post.id,
    user_id: post.user_id,
    content: post.content,
    song_id: post.song_id,
    // artist_id: stored directly on the row OR in metadata
    artist_id: (post as any).artist_id ?? (post as any).metadata?.artist_id ?? null,
    playlist_id: post.playlist_id,
    image_url: (post as any).image_url ?? null,
    image_path: (post as any).image_path ?? null,
    media_url: (post as any).media_url ?? null,
    media_source: (post as any).media_source ?? null,
    songcard: (post as any).songcard ?? null,
    media_kind: (post as any).media_kind ?? null,
    media_poster_url: (post as any).media_poster_url ?? null,
    media_id: (post as any).media_id ?? null,
    post_type: post.post_type,
    activity_type: (post as any).activity_type ?? null,
    metadata: (post as any).metadata ?? null,
    created_at: post.created_at,
    updated_at: post.updated_at,
    edited_at: (post as any).edited_at ?? null,
    profile: profilesMap.get(String(post.user_id)),
    likes_count: likesCount.get(String(post.id)) || 0,
    comments_count: commentsCount.get(String(post.id)) || 0,
    is_liked: userLikedPosts.has(String(post.id)),
    artist_is_verified: null,
    playlist_name: post.playlist_id ? playlistNamesMap.get(String(post.playlist_id)) ?? null : null,
    tagged: taggedByPost.get(String(post.id)) ?? [],
  }));
}

/**
 * One post by id, shaped exactly like the feed shapes it.
 *
 * Null when it does not exist, was deleted, or the viewer is not allowed to
 * see it: row level security makes all three look the same from here, and
 * for the person holding the link they are the same thing.
 */
export async function fetchPostById(postId: string, viewerId: string | null): Promise<SocialPostWithProfile | null> {
  if (!postId) return null;
  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', postId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error || !data) return null;
  const [post] = await enrichPostRows([data], viewerId);
  return post ?? null;
}

/**
 * Everything one person has posted, for their profile page.
 *
 * The profile used to filter the viewer's own fifty-post feed by author,
 * which meant a stranger's profile showed whatever of theirs happened to be
 * in the viewer's most recent page, and the Posts count counted the same.
 */
export function useUserPosts(userId: string | null | undefined) {
  const { user } = useAuth();
  const enabled = !!userId && !isSyntheticId(userId);
  const query = useQuery({
    queryKey: ['user-posts', userId, user?.id ?? null],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_posts')
        .select('*')
        .eq('user_id', userId as string)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return enrichPostRows((data as any[]) || [], user?.id ?? null);
    },
  });
  return {
    posts: query.data ?? [],
    isLoading: enabled ? query.isLoading : false,
    refetch: query.refetch,
  };
}

export function useSocial() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<SocialPostWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [following, setFollowing] = useState<string[]>([]);
  const [followers, setFollowers] = useState<string[]>([]);
  const [likedArtistIds, setLikedArtistIds] = useState<string[]>([]);
  const followingRef = useRef<string[]>([]);
  const likedArtistsRef = useRef<string[]>([]);
  // Ref so callbacks don't need user in their deps array — prevents re-renders on token refresh
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;
  // Guards against the same post being written twice by rapid double-submits
  const lastPostRef = useRef<{ sig: string; at: number }>({ sig: '', at: 0 });

  const fetchFollowData = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) {
      setFollowing([]);
      setFollowers([]);
      return;
    }

    if (isSyntheticId(uid)) {
      // No Supabase session — read from local storage only
      const allFollows = listFollows();
      const localFollowing = allFollows[uid] ?? [];
      followingRef.current = localFollowing;
      setFollowing(localFollowing);
      setFollowers([]);
      return;
    }

    const [followingRes, followersRes, likedArtistsRes] = await Promise.all([
      supabase.from('user_follows').select('following_id').eq('follower_id', uid),
      supabase.from('user_follows').select('follower_id').eq('following_id', uid),
      // Following an artist is a liked_artists row, not a user_follows row,
      // and the Following feed has to honour both.
      supabase.from('liked_artists').select('artist_id').eq('user_id', uid),
    ]);

    const newFollowing = (followingRes.data || []).map((r: any) => r.following_id).filter(Boolean);
    followingRef.current = newFollowing;
    setFollowing(newFollowing);
    setFollowers((followersRes.data || []).map((r: any) => r.follower_id).filter(Boolean));
    const newLikedArtists = (likedArtistsRes.data || []).map((r: any) => String(r.artist_id)).filter(Boolean);
    likedArtistsRef.current = newLikedArtists;
    setLikedArtistIds(newLikedArtists);
  }, []); // stable — reads uid from ref

  const fetchPosts = useCallback(async (feedType: 'all' | 'following' = 'all') => {
    const uid = userIdRef.current;
    if (!uid) {
      setPosts([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const currentFollowing = followingRef.current;
    const currentLikedArtists = likedArtistsRef.current;

    if (feedType === 'following' && currentFollowing.length === 0 && currentLikedArtists.length === 0) {
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

      /* Following means two things: people you follow (user_follows) and
         artists you follow (liked_artists). One query, one OR, so the page
         stays a single ordered fifty rather than two lists stitched together. */
      const peopleIds = Array.from(new Set([uid, ...currentFollowing]));
      const followingFilter = [
        `user_id.in.(${peopleIds.join(',')})`,
        currentLikedArtists.length > 0 ? `artist_id.in.(${quoteList(currentLikedArtists)})` : null,
      ].filter(Boolean).join(',');

      const { data: postsData, error: postsError } =
        feedType === 'following'
          ? await baseQuery.or(followingFilter)
          : await baseQuery;

      if (postsError) throw postsError;

      const rows = (postsData as any[]) || [];
      const enriched = await enrichPostRows(rows, uid);

      setPosts(enriched);
    } catch (err) {
      if (import.meta.env.DEV) console.error('fetchPosts failed', err);
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.id) {
      fetchFollowData();
    } else {
      setFollowing([]);
      setFollowers([]);
    }
  }, [user?.id, fetchFollowData]);

  useEffect(() => {
    if (user?.id) {
      fetchPosts();
    } else {
      setPosts([]);
      setIsLoading(false);
    }
  }, [user?.id, fetchPosts]);

  /**
   * Tell people they were tagged.
   *
   * Row level security lets anyone notify anyone, but only as themselves, so
   * from_user_id has to be the signed-in user or the insert is refused. Never
   * let a failure here reach the person posting: they did their part.
   */
  const notifyTagged = useCallback(async (taggedIds: string[], postId: string, fromUserId: string) => {
    try {
      await supabase.from('notifications').insert(
        taggedIds.map((id) => ({
          user_id: id,
          type: 'post_tag',
          from_user_id: fromUserId,
          post_id: postId,
          message: 'tagged you in a post',
        }))
      );
    } catch (e) {
      console.error('tag notifications failed', e);
    }
  }, []);

  const createPost = useCallback(
    async (
      content: string,
      postType: 'text' | 'song_share' | 'playlist_share' | 'listening' = 'text',
      songId?: string,
      playlistId?: string,
      /**
       * A picture or a clip, and the people in it.
       *
       * Optional and last, so every existing caller keeps working untouched.
       * The media is already in the bucket by the time this runs; the composer
       * uploads it first and hands over the finished URL.
       */
      extras?: {
        mediaUrl?: string | null;
        mediaKind?: 'image' | 'video' | null;
        mediaPosterUrl?: string | null;
        mediaId?: string | null;
        /** 'upload' is a real file, artists only. 'songcard' carries no file. */
        mediaSource?: 'upload' | 'songcard' | null;
        songcard?: SongCardData | null;
        tagUserIds?: string[];
      }
    ): Promise<boolean> => {
      if (!isSupabaseConfigured) {
        toast({
          title: 'Cannot post right now',
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
        const uid = userIdRef.current;
        if (!uid) throw new Error('Not authenticated');

        const cleanContent = (content ?? '').trim();
        const cleanSongId = (songId ?? '').trim();
        const cleanPlaylistId = (playlistId ?? '').trim();
        const mediaUrl = (extras?.mediaUrl ?? '').trim();

        // A photograph on its own is a post. Requiring words alongside it would
        // make this the one social app where you cannot just show something.
        if (!cleanContent && !cleanSongId && !cleanPlaylistId && !mediaUrl && !extras?.songcard) {
          toast({ title: 'Post cannot be empty', variant: 'destructive' });
          return false;
        }

        const sig = `${uid}|${postType}|${cleanContent}|${cleanSongId}|${cleanPlaylistId}|${mediaUrl}`;
        const now = Date.now();
        if (lastPostRef.current.sig === sig && now - lastPostRef.current.at < 5000) {
          // Identical post submitted again within 5s — treat as already shared
          return true;
        }
        lastPostRef.current = { sig, at: now };

        const payload: Database['public']['Tables']['social_posts']['Insert'] = {
          user_id: uid,
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

        if (mediaUrl) {
          (payload as Record<string, unknown>).media_url = mediaUrl;
          (payload as Record<string, unknown>).media_kind = extras?.mediaKind ?? null;
          (payload as Record<string, unknown>).media_source = extras?.mediaSource ?? 'upload';
          if (extras?.mediaPosterUrl) {
            (payload as Record<string, unknown>).media_poster_url = extras.mediaPosterUrl;
          }
          if (extras?.mediaId) {
            (payload as Record<string, unknown>).media_id = extras.mediaId;
          }
        }

        // A song card is data, not a file, so it never touches media_url and
        // anybody may post one.
        if (extras?.songcard) {
          (payload as Record<string, unknown>).songcard = extras.songcard;
          (payload as Record<string, unknown>).media_source = 'songcard';
        }

        payloadForLog = payload as any;

        const { data: inserted, error } = await supabase
          .from('social_posts')
          .insert(payload)
          .select('id')
          .single();
        if (error) {
          console.error('social_posts insert failed', { error, payload: payloadForLog });
          throw error;
        }

        // The people in it. Tagging never blocks the post: the post is the
        // thing that matters, and a tag that failed is recoverable by editing,
        // whereas a post lost because a tag failed is just gone.
        const tagIds = [...new Set(extras?.tagUserIds ?? [])].filter((id) => id && id !== uid);
        if (inserted?.id && tagIds.length) {
          const { error: tagError } = await supabase.from('post_tags' as never).insert(
            tagIds.map((tagged) => ({
              post_id: inserted.id,
              tagged_user_id: tagged,
              created_by: uid,
            })) as never
          );
          if (tagError) {
            console.error('post_tags insert failed', tagError);
            toast({
              title: 'Posted, but the tags did not save',
              description: 'You can add them again from the post.',
            });
          } else {
            void notifyTagged(tagIds, inserted.id, uid);
          }
        }

        toast({ title: 'Post shared!' });
        await fetchPosts();
        return true;
      } catch (error: any) {
        // Failed insert should not block an immediate retry
        lastPostRef.current = { sig: '', at: 0 };
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
    [toast, fetchPosts, notifyTagged]
  );

  const deletePost = useCallback(async (postId: string): Promise<boolean> => {
    if (!user) return false;

    /* The post goes first, and alone. This used to fire the post, its likes
       and its comments off together, so a refused post delete (not yours, or
       offline) still stripped a live post of every like and comment it had.
       Only once the post is really gone do the children follow. */
    const { error } = await supabase
      .from('social_posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', user.id);

    if (error) {
      toast({ title: 'Could not delete post', description: error.message, variant: 'destructive' });
      return false;
    }

    await Promise.all([
      supabase.from('post_likes').delete().eq('post_id', postId),
      supabase.from('post_comments').delete().eq('post_id', postId),
    ]);

    setPosts((prev) => prev.filter((p) => p.id !== postId));
    toast({ title: 'Post deleted' });
    return true;
  }, [user, toast]);

  /**
   * Delete one of your own comments.
   *
   * Scoped to your own user_id on the client as well as by policy, so a bad
   * id can never reach anyone else's words. The count on the post comes down
   * with it.
   */
  const deleteComment = useCallback(async (postId: string, commentId: string): Promise<boolean> => {
    if (!user) return false;

    const { error } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', user.id);

    if (error) {
      toast({ title: 'Could not delete comment', description: error.message, variant: 'destructive' });
      return false;
    }

    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p
    ));
    toast({ title: 'Comment deleted' });
    return true;
  }, [user, toast]);

  /**
   * Change the words on your own post.
   *
   * Fixing a typo used to mean deleting the post, which threw away its likes,
   * its comments and its place in everybody's feed. Only the text moves: the
   * media, the tags and the world it was posted in are untouched, and the row
   * is stamped so a reader can see it was edited.
   */
  const editPost = useCallback(async (postId: string, content: string): Promise<boolean> => {
    if (!user) return false;
    const text = content.trim();
    if (!text) return false;
    const { data, error } = await (supabase as any).rpc('edit_my_post', { _post_id: postId, _content: text });
    if (error) {
      toast({ title: 'Could not save that edit', description: error.message, variant: 'destructive' });
      return false;
    }
    const stamp = typeof data === 'string' ? data : new Date().toISOString();
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, content: text, edited_at: stamp } : p)));
    toast({ title: 'Post updated' });
    return true;
  }, [user, toast]);

  /** Same, for one of your own comments. */
  const editComment = useCallback(async (commentId: string, content: string): Promise<boolean> => {
    if (!user) return false;
    const text = content.trim();
    if (!text) return false;
    const { error } = await (supabase as any).rpc('edit_my_comment', { _comment_id: commentId, _content: text });
    if (error) {
      toast({ title: 'Could not save that edit', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Comment updated' });
    return true;
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

      if (isSyntheticId(user.id)) {
        // No Supabase session — persist follow in local storage only
        const allFollows = listFollows();
        if (isCurrentlyFollowing) {
          const next = (allFollows[user.id] ?? []).filter((id) => id !== userId);
          saveFollows({ ...allFollows, [user.id]: next });
          setFollowing((prev) => {
            const n = prev.filter((id) => id !== userId);
            followingRef.current = n;
            return n;
          });
          toast({ title: 'Unfollowed' });
        } else {
          const next = Array.from(new Set([...(allFollows[user.id] ?? []), userId]));
          saveFollows({ ...allFollows, [user.id]: next });
          setFollowing((prev) => {
            const n = Array.from(new Set([...prev, userId]));
            followingRef.current = n;
            return n;
          });
          toast({ title: 'Following!' });
        }
        return;
      }

      if (isCurrentlyFollowing) {
        // Optimistic local update before DB write
        setFollowing((prev) => {
          const next = prev.filter((id) => id !== userId);
          followingRef.current = next;
          return next;
        });
        broadcastCountDelta('follow', { artistId: userId, delta: -1 });

        const { error } = await supabase
          .from('user_follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);

        if (error) {
          // Revert
          setFollowing((prev) => {
            const next = Array.from(new Set([...prev, userId]));
            followingRef.current = next;
            return next;
          });
          broadcastCountDelta('follow', { artistId: userId, delta: 1 });
          toast({
            title: 'Could not unfollow',
            description: error.message || 'Please try again in a moment.',
            variant: 'destructive',
          });
          return;
        }
        toast({ title: 'Unfollowed' });
      } else {
        // Optimistic local update before DB write
        setFollowing((prev) => {
          const next = Array.from(new Set([...prev, userId]));
          followingRef.current = next;
          return next;
        });
        broadcastCountDelta('follow', { artistId: userId, delta: 1 });

        const { error } = await supabase
          .from('user_follows')
          .insert({ follower_id: user.id, following_id: userId } as any);

        if (error) {
          // Revert
          setFollowing((prev) => {
            const next = prev.filter((id) => id !== userId);
            followingRef.current = next;
            return next;
          });
          broadcastCountDelta('follow', { artistId: userId, delta: -1 });
          toast({
            title: 'Could not follow',
            description: error.message || 'Please check your connection and try again.',
            variant: 'destructive',
          });
          return;
        }
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
    const { data: profileData } = await supabase
      .from('audience_profiles')
      .select(PROFILE_COLUMNS)
      .or(`id.in.(${userIds.join(',')}),user_id.in.(${userIds.join(',')})`);
    const profilesMap = new Map<string, AudienceProfile>();
    ((profileData || []) as any[]).forEach((p: any) => {
      profilesMap.set(String(p.id), p);
      if (p?.user_id) profilesMap.set(String(p.user_id), p);
    });

    return rows.map((c) => ({
      id: c.id,
      post_id: c.post_id,
      user_id: c.user_id,
      content: c.content,
      created_at: c.created_at,
      edited_at: (c as any).edited_at ?? null,
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
      // Thrown, not swallowed: the caller shows the comment optimistically and
      // needs to know to take it back down again.
      throw new Error(error.message || 'Failed to add comment');
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
    const uid = user?.id;
    if (!uid) return;
    /*
     * One channel per hook instance, and the name has to be genuinely unique.
     *
     * This used to append Date.now(), which is not unique: every instance that
     * mounts in the same commit shares a millisecond, so they all resolved to
     * ONE channel object. supabase.channel(topic) returns the existing channel
     * on a topic match, so the second caller appended its bindings to a channel
     * that had already subscribed, and the first component to unmount called
     * removeChannel and took feed realtime down for every other holder.
     *
     * A counter cannot collide with itself, which a clock can.
     */
    const channelName = `social-feed-${uid}-${nextSocialChannelId()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_posts' }, () => {
        void fetchPostsRef.current(feedTypeRef.current);
      })
      // Targeted count updates — avoid full 5-query refetch on every like/comment
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, (payload) => {
        const postId = String((payload.new as any)?.post_id || (payload.old as any)?.post_id || '');
        if (!postId) return;
        const delta = payload.eventType === 'INSERT' ? 1 : -1;
        setPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, likes_count: Math.max(0, p.likes_count + delta) } : p
        ));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, (payload) => {
        const postId = String((payload.new as any)?.post_id || (payload.old as any)?.post_id || '');
        if (!postId) return;
        const delta = payload.eventType === 'INSERT' ? 1 : -1;
        setPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count + delta) } : p
        ));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_follows' }, () => {
        void fetchFollowDataRef.current();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]); // only recreate when user ID actually changes, not on token refresh

  const fetchPostsTracked = useCallback((feedType: 'all' | 'following' = 'all') => {
    feedTypeRef.current = feedType;
    return fetchPosts(feedType);
  }, [fetchPosts]);

  /**
   * Take your own name off a post somebody else tagged you in.
   *
   * TagPeople told people they could do this ("they can take their own name off
   * without asking the author") while post_tags only ever had a select and an
   * insert, so the promise could not be kept and a named person had no way out
   * of a post they never chose to be in. Being tagged is not consent to stay
   * tagged, and that is exactly the sort of promise the Terms rest on.
   *
   * Scoped to your own row on purpose: this removes YOUR tag, never anyone
   * else's, so the author cannot use it to quietly untag someone.
   */
  const untagSelf = useCallback(async (postId: string) => {
    const uid = user?.id;
    if (!uid) return false;

    const { error } = await supabase
      .from('post_tags' as never)
      .delete()
      .eq('post_id', postId)
      .eq('tagged_user_id', uid);

    if (error) {
      toast({
        title: 'Could not remove your tag',
        description: 'Give it another go in a moment.',
      });
      return false;
    }

    toast({ title: 'Your name is off that post' });
    await fetchPosts(feedTypeRef.current);
    return true;
  }, [user?.id, fetchPosts]);

  const getPostById = useCallback(
    (postId: string) => fetchPostById(postId, userIdRef.current),
    []
  );

  return {
    posts,
    isLoading,
    following,
    followers,
    likedArtistIds,
    createPost,
    deletePost,
    deleteComment,
    editPost,
    editComment,
    toggleLikePost,
    followUser,
    isFollowing,
    getPostComments,
    addComment,
    untagSelf,
    fetchPostById: getPostById,
    refetchPosts: fetchPostsTracked
  };
}
