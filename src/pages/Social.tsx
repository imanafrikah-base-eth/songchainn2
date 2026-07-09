import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Headphones,
  Plus,
  Compass,
  Search,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PostComposer } from '@/components/social/PostComposer';
import { MusicFeedCard } from '@/components/social/MusicFeedCard';
import { CommentSheet } from '@/components/social/CommentSheet';
import { useSocial } from '@/hooks/useSocial';
import { useAuth } from '@/context/AuthContext';
import { AudienceProfile } from '@/types/database';
import { SocialPostWithProfile, PostComment } from '@/types/social';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useSafePlayerState, usePlayerActions } from '@/context/PlayerContext';
import { SONGS } from '@/data/musicData';

export default function Social() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const {
    posts,
    isLoading,
    following,
    followers,
    createPost,
    toggleLikePost,
    followUser,
    isFollowing,
    getPostComments,
    addComment,
    refetchPosts,
  } = useSocial();
  const playerState = useSafePlayerState();
  const { playSong } = usePlayerActions();
  const playSongRef = useRef(playSong);
  playSongRef.current = playSong;
  const postsToRenderRef = useRef<SocialPostWithProfile[]>([]);

  const [feedType, setFeedType] = useState<'foryou' | 'following'>('foryou');
  const [suggestedUsers, setSuggestedUsers] = useState<AudienceProfile[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [sharedPost, setSharedPost] = useState<SocialPostWithProfile | null>(null);
  const [isLoadingSharedPost, setIsLoadingSharedPost] = useState(false);
  const [commentSheet, setCommentSheet] = useState<{ isOpen: boolean; postId: string | null }>({
    isOpen: false,
    postId: null,
  });
  const [currentComments, setCurrentComments] = useState<PostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const sharedPostId = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return params.id || searchParams.get('post') || null;
  }, [location.search, params.id]);

  const shareSongId = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('song');
  }, [location.search]);

  useEffect(() => {
    const fetchSuggestedUsers = async () => {
      if (!user) return;
      setLoadingSuggestions(true);
      const { data } = await supabase
        .from('audience_profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      const profiles = ((data as any[]) || []).filter(
        (p) => p?.id && p.id !== user.id,
      ) as AudienceProfile[];
      setSuggestedUsers(profiles.filter((p) => !following.includes(p.id)).slice(0, 5));
      setLoadingSuggestions(false);
    };
    void fetchSuggestedUsers();
  }, [user, following]);

  useEffect(() => {
    refetchPosts(feedType === 'following' ? 'following' : 'all');
  }, [feedType, refetchPosts]);

  useEffect(() => {
    if (shareSongId) setShowComposer(true);
  }, [shareSongId]);

  useEffect(() => {
    if (!sharedPostId) {
      setSharedPost(null);
      setIsLoadingSharedPost(false);
      return;
    }
    const idx = posts.findIndex((p) => p.id === sharedPostId);
    if (idx >= 0) {
      setSharedPost(null);
      const container = feedRef.current;
      if (container) {
        container.scrollTo({ top: idx * container.clientHeight, behavior: 'auto' });
      }
      return;
    }
    const load = async () => {
      setIsLoadingSharedPost(true);
      try {
        setSharedPost(posts.find((p) => p.id === sharedPostId) || null);
      } finally {
        setIsLoadingSharedPost(false);
      }
    };
    void load();
  }, [posts, sharedPostId]);

  const filteredPosts = feedType === 'following'
    ? posts.filter((p) => following.includes(p.user_id) || p.user_id === user?.id)
    : posts;

  const postsToRender = sharedPost ? [sharedPost] : filteredPosts;
  postsToRenderRef.current = postsToRender;
  const effectiveIsLoading = isLoading || isLoadingSharedPost;

  // Auto-play / pause as posts scroll into/out of view (TikTok behaviour) —
  // driven by a real IntersectionObserver per card rather than scrollTop
  // arithmetic, so "stop when scrolled past" is based on actual visibility.
  const pauseRef = useRef(() => {});
  const { pause: pauseFn } = usePlayerActions();
  pauseRef.current = pauseFn;

  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleRatiosRef = useRef(new Map<string, number>());
  const activePostIdRef = useRef<string | null>(null);

  const resolvePostSong = useCallback((post: SocialPostWithProfile) => {
    let songToPlay = post.song_id ? SONGS.find(s => s.id === post.song_id) : null;
    if (!songToPlay && post.post_type === 'artist_follow' && post.artist_id) {
      const artistSongs = SONGS.filter(s => s.artistId === post.artist_id).sort((a, b) => b.plays - a.plays);
      songToPlay = artistSongs[0] ?? null;
    }
    return songToPlay;
  }, []);

  const decideActiveCard = useCallback(() => {
    let bestId: string | null = null;
    let bestRatio = 0;
    for (const [id, ratio] of visibleRatiosRef.current.entries()) {
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestId = id;
      }
    }
    if (bestRatio < 0.5) bestId = null;
    if (bestId === activePostIdRef.current) return;
    activePostIdRef.current = bestId;

    const post = bestId ? postsToRenderRef.current.find(p => p.id === bestId) : null;
    if (!post) {
      pauseRef.current();
      return;
    }

    const songToPlay = resolvePostSong(post);
    if (!songToPlay) {
      pauseRef.current();
      return;
    }

    const startTime = post.post_type === 'song_pulse' && typeof post.metadata?.position_seconds === 'number'
      ? post.metadata.position_seconds
      : undefined;
    playSongRef.current(songToPlay, typeof startTime === 'number' ? { startTime } : undefined);
  }, [resolvePostSong]);

  const decideActiveCardRef = useRef(decideActiveCard);
  decideActiveCardRef.current = decideActiveCard;

  const postIdsKey = useMemo(() => postsToRender.map(p => p.id).join(','), [postsToRender]);

  useEffect(() => {
    const container = feedRef.current;
    if (!container) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const id = (entry.target as HTMLElement).dataset.postId;
        if (!id) return;
        visibleRatiosRef.current.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
      });
      decideActiveCardRef.current();
    }, { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] });

    observerRef.current = observer;
    cardRefs.current.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      observerRef.current = null;
      visibleRatiosRef.current.clear();
      activePostIdRef.current = null;
    };
  }, [postIdsKey]);

  const registerCardRef = useCallback((postId: string, el: HTMLDivElement | null) => {
    const existing = cardRefs.current.get(postId);
    if (existing && observerRef.current) observerRef.current.unobserve(existing);
    if (el) {
      cardRefs.current.set(postId, el);
      observerRef.current?.observe(el);
    } else {
      cardRefs.current.delete(postId);
    }
  }, []);

  const handleOpenComments = async (postId: string) => {
    setCommentSheet({ isOpen: true, postId });
    setLoadingComments(true);
    const comments = await getPostComments(postId);
    setCurrentComments(comments);
    setLoadingComments(false);
  };

  const handleAddComment = async (content: string) => {
    if (!commentSheet.postId) return;
    await addComment(commentSheet.postId, content);
    const comments = await getPostComments(commentSheet.postId);
    setCurrentComments(comments);
  };

  const closeComposer = useCallback(() => {
    setShowComposer(false);
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.has('song')) {
      searchParams.delete('song');
      navigate({ pathname: location.pathname, search: searchParams.toString() }, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  return (
    <div className="h-dvh bg-black relative overflow-hidden">

      {/* ── Scrollable feed ── */}
      <div
        ref={feedRef}
        className="absolute inset-0 overflow-y-scroll overscroll-none snap-y snap-mandatory"
      >
        {effectiveIsLoading && postsToRender.length === 0 ? (
          /* Skeleton cards — render 3 immediately so the screen isn't blank */
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-full w-full snap-start bg-black flex items-center justify-center relative">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent animate-pulse" />
                <div className="flex flex-col items-center gap-4 opacity-30">
                  <div className="w-52 h-52 rounded-full bg-white/10" />
                  <div className="h-3 w-36 rounded bg-white/10" />
                  <div className="h-2 w-24 rounded bg-white/10" />
                </div>
              </div>
            ))}
          </>
        ) : postsToRender.length === 0 ? (
          <div className="h-full flex items-center justify-center px-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center max-w-sm"
            >
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/10 flex items-center justify-center">
                {feedType === 'following'
                  ? <Users className="w-10 h-10 text-white/70" />
                  : <Compass className="w-10 h-10 text-white/70" />}
              </div>
              <h3 className="font-bold text-xl text-white mb-2">
                {feedType === 'following' ? 'Follow music fans' : 'Be the first!'}
              </h3>
              <p className="text-white/60 mb-6">
                {feedType === 'following'
                  ? 'Follow people to see their music shares here'
                  : "Share what you're listening to and start the conversation"}
              </p>
              <div className="flex gap-3 justify-center">
                {feedType === 'following' ? (
                  <Button onClick={() => setFeedType('foryou')}>
                    <Compass className="w-4 h-4 mr-2" />
                    Discover
                  </Button>
                ) : (
                  <Button onClick={() => setShowComposer(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Post
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        ) : (
          postsToRender.map((post) => (
            <div
              key={post.id}
              data-post-id={post.id}
              ref={(el) => registerCardRef(post.id, el)}
              className="h-full w-full snap-start"
            >
              <MusicFeedCard
                post={post}
                onLike={toggleLikePost}
                onFollow={followUser}
                isFollowing={isFollowing(post.user_id)}
                onComment={() => handleOpenComments(post.id)}
              />
            </div>
          ))
        )}
      </div>

      {/* ── Overlay header ── */}
      <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
        <div className="bg-gradient-to-b from-black/70 to-transparent">
          <div className="max-w-lg mx-auto px-4 pt-3 pb-8">
            <div className="flex items-center justify-between pointer-events-auto">
              {/* Back + title */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(-1)}
                  className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center"
                >
                  <ArrowLeft className="w-4 h-4 text-white" />
                </button>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-white/80" />
                  <span className="font-semibold text-white">Feed</span>
                </div>
              </div>

              {/* Feed tabs + discover */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-white/10 backdrop-blur-sm rounded-full p-0.5">
                  <button
                    onClick={() => setFeedType('foryou')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      feedType === 'foryou'
                        ? 'bg-white text-black'
                        : 'text-white/70'
                    }`}
                  >
                    For You
                  </button>
                  <button
                    onClick={() => setFeedType('following')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      feedType === 'following'
                        ? 'bg-white text-black'
                        : 'text-white/70'
                    }`}
                  >
                    Following
                  </button>
                </div>

                {/* Discover */}
                <Sheet>
                  <SheetTrigger asChild>
                    <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                      <Search className="w-4 h-4 text-white" />
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-80">
                    <SheetHeader>
                      <SheetTitle>Discover People</SheetTitle>
                    </SheetHeader>
                    <ScrollArea className="h-[calc(100vh-100px)] mt-4">
                      <div className="space-y-3 pr-4">
                        {loadingSuggestions ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <Skeleton className="w-12 h-12 rounded-full" />
                              <div className="flex-1">
                                <Skeleton className="h-4 w-24 mb-1" />
                                <Skeleton className="h-3 w-16" />
                              </div>
                            </div>
                          ))
                        ) : suggestedUsers.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            No suggestions right now
                          </p>
                        ) : (
                          suggestedUsers.map((profile) => (
                            <motion.div
                              key={profile.id}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors cursor-pointer"
                              onClick={() => navigate(`/audience/${profile.user_id}`)}
                            >
                              <Avatar className="w-12 h-12">
                                <AvatarImage src={profile.profile_picture_url || ''} />
                                <AvatarFallback className="bg-primary/20 text-primary">
                                  {profile.profile_name?.charAt(0) || '?'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold truncate">{profile.profile_name}</p>
                                {profile.bio && (
                                  <p className="text-xs text-muted-foreground truncate">{profile.bio}</p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant={isFollowing(profile.user_id) ? 'secondary' : 'default'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  followUser(profile.user_id);
                                }}
                              >
                                {isFollowing(profile.user_id) ? 'Following' : 'Follow'}
                              </Button>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {/* Room banner */}
            {playerState?.isRoomMode && playerState.currentSong && (
              <div className="mt-3 rounded-2xl border border-primary/30 bg-black/50 backdrop-blur-md px-3 py-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
                  {playerState.currentSong.coverImage && (
                    <img
                      src={playerState.currentSong.coverImage}
                      alt={playerState.currentSong.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-primary flex items-center gap-1 mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Now Playing in The Room
                  </div>
                  <p className="text-sm font-medium text-white truncate">{playerState.currentSong.title}</p>
                </div>
                <button onClick={() => navigate('/room')}>
                  <Headphones className="w-4 h-4 text-primary" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Floating create button ── */}
      <motion.button
        className="absolute right-4 bottom-24 w-12 h-12 rounded-full bg-primary text-white shadow-xl flex items-center justify-center z-30"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        onClick={() => setShowComposer(true)}
      >
        <Plus className="w-5 h-5" />
      </motion.button>

      {/* ── Post composer sheet ── */}
      <AnimatePresence>
        {showComposer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={closeComposer}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-background rounded-t-3xl z-50 p-4 pb-8"
            >
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>
              <PostComposer
                onPost={async (content, type, songId) => {
                  const ok = await createPost(content, type, songId);
                  if (ok !== false) closeComposer();
                }}
                initialType={shareSongId ? 'song_share' : 'text'}
                initialSongId={shareSongId ?? undefined}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Comment sheet ── */}
      <CommentSheet
        isOpen={commentSheet.isOpen}
        onClose={() => setCommentSheet({ isOpen: false, postId: null })}
        comments={currentComments}
        isLoading={loadingComments}
        onAddComment={handleAddComment}
        commentsCount={currentComments.length}
      />
    </div>
  );
}
