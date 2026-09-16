import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Headphones,
  Plus,
  Compass,
  Search,
  ArrowLeft,
  Clapperboard,
  Images,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PostComposer } from '@/components/social/PostComposer';
import { MusicFeedCard } from '@/components/social/MusicFeedCard';
import { CommentSheet } from '@/components/social/CommentSheet';
import { useSocial } from '@/hooks/useSocial';
import { useAuth } from '@/context/AuthContext';
import { AudienceProfile } from '@/types/database';
import { SocialPostWithProfile, PostComment } from '@/types/social';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useSafePlayerState, usePlayerActions } from '@/context/PlayerContext';
import { FeedPostCard } from '@/components/social/FeedPostCard';
import { useFeedCatalog, isShowablePost, postInSection, resolvePostSong as songOfPost, type FeedSection } from '@/lib/feedPosts';
import { ClipLooper } from '@/components/social/ClipLooper';
import { useCommentPreviews } from '@/hooks/useCommentPreviews';
import { useMentions } from '@/hooks/useMentions';
import { useFeedReactions } from '@/hooks/useFeedReactions';
import type { MentionPerson } from '@/lib/mentions';

export default function Social() {
  const { user, audienceProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const {
    posts,
    isLoading,
    following,
    likedArtistIds,
    createPost,
    deletePost,
    deleteComment,
    toggleLikePost,
    followUser,
    isFollowing,
    getPostComments,
    addComment,
    untagSelf,
    fetchPostById,
    refetchPosts,
    editPost,
    editComment,
  } = useSocial();
  const playerState = useSafePlayerState();
  const { playSong } = usePlayerActions();
  const playSongRef = useRef(playSong);
  playSongRef.current = playSong;
  const postsToRenderRef = useRef<SocialPostWithProfile[]>([]);

  /* For you and Following swipe full screen like TikTok, Videos is clips only,
     Photos scrolls like Instagram and Facebook (founder, 15 Sep 2026). */
  const [feedType, setFeedType] = useState<FeedSection>('foryou');
  const catalog = useFeedCatalog();
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

  // Claim the right edge while the feed is open. The like/comment/share rail
  // lives there, and the Mo$ha launcher docks to the same corner, so on a phone
  // the launcher sat on top of the share button. See .agent-dock in index.css.
  useEffect(() => {
    document.body.dataset.feedOpen = 'true';
    return () => {
      delete document.body.dataset.feedOpen;
    };
  }, []);

  useEffect(() => {
    if (shareSongId) setShowComposer(true);
  }, [shareSongId]);

  /**
   * A link to one post.
   *
   * If it is in the page already loaded, scroll to it. If not, fetch it by
   * id and pin it above the feed. This used to "load" it by running the same
   * find that had just failed, so every shared link to a post older than the
   * latest fifty opened onto the plain feed with no explanation.
   */
  const sharedLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sharedPostId) {
      setSharedPost(null);
      setIsLoadingSharedPost(false);
      sharedLoadedRef.current = null;
      return;
    }
    if (isLoading) return;
    const idx = posts.findIndex((p) => p.id === sharedPostId);
    if (idx >= 0) {
      setSharedPost(null);
      sharedLoadedRef.current = null;
      const container = feedRef.current;
      if (container) {
        container.scrollTo({ top: idx * container.clientHeight, behavior: 'auto' });
      }
      return;
    }
    // Already pinned; a feed refresh behind it is no reason to fetch again.
    if (sharedLoadedRef.current === sharedPostId) return;

    let cancelled = false;
    const load = async () => {
      setIsLoadingSharedPost(true);
      try {
        const post = await fetchPostById(sharedPostId);
        if (cancelled) return;
        if (!post) {
          toast({ title: 'That post is gone' });
          navigate('/social', { replace: true });
          return;
        }
        sharedLoadedRef.current = sharedPostId;
        setSharedPost(post);
      } finally {
        if (!cancelled) setIsLoadingSharedPost(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [posts, sharedPostId, isLoading, fetchPostById, navigate]);

  const filteredPosts = (feedType === 'following'
    ? posts.filter((p) =>
        following.includes(p.user_id)
        || p.user_id === user?.id
        || (!!p.artist_id && likedArtistIds.includes(p.artist_id)))
    : posts)
    // Nothing is drawn as a placeholder: a post with nothing to look at stays out.
    .filter((p) => isShowablePost(p, catalog) && postInSection(p, feedType));
  const isPhotos = feedType === 'photos' && !sharedPost;

  const postsToRender = sharedPost
    ? [sharedPost, ...filteredPosts.filter((p) => p.id !== sharedPost.id)]
    : filteredPosts;

  const { previews, addPreview, removePreview, replacePreviews } = useCommentPreviews(
    postsToRender.map((p) => p.id),
  );
  const renderedPostIds = postsToRender.map((p) => p.id);
  const { data: postMentions } = useMentions('post', renderedPostIds);
  const { reactions: postReactions, toggle: togglePostReaction } = useFeedReactions('post', renderedPostIds);
  const handleReact = useCallback((postId: string, emoji: string) => {
    void togglePostReaction(postId, emoji);
  }, [togglePostReaction]);

  const backToFeed = useCallback(() => {
    navigate('/social', { replace: true });
  }, [navigate]);

  /* The feed plays a song as soon as a card shows, and the tab bar steps aside
     whenever a song is playing. The feed mounts no mini player either, so on a
     phone this button is the only way out (founder, 15 Sep 2026). It goes back
     where the person came from, or Home when the feed was the first page. */
  const leaveFeed = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  }, [navigate]);

  const handleDeletePost = useCallback(async (postId: string) => {
    const ok = await deletePost(postId);
    if (ok && sharedLoadedRef.current === postId) backToFeed();
  }, [deletePost, backToFeed]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    const postId = commentSheet.postId;
    if (!postId) return false;
    const ok = await deleteComment(postId, commentId);
    if (ok) {
      setCurrentComments((prev) => prev.filter((c) => c.id !== commentId));
      removePreview(postId, commentId);
    }
    return ok;
  }, [commentSheet.postId, deleteComment, removePreview]);

  /**
   * A comment typed straight into a feed card. It shows under the caption at
   * once and is taken back down, with the text returned to the box, if the
   * insert fails.
   */
  const handleQuickComment = useCallback(async (postId: string, content: string, mentions?: MentionPerson[]) => {
    if (!user) return false;
    const pending: PostComment = {
      id: `pending-${Date.now()}`,
      user_id: user.id,
      post_id: postId,
      content,
      created_at: new Date().toISOString(),
      profile: audienceProfile ?? undefined,
      likes_count: 0,
      is_liked: false,
    };
    addPreview(pending);
    try {
      await addComment(postId, content, mentions);
      const comments = await getPostComments(postId);
      replacePreviews(postId, comments);
      return true;
    } catch {
      removePreview(postId, pending.id);
      toast({ title: 'Your comment did not send', variant: 'destructive' });
      return false;
    }
  }, [user, audienceProfile, addPreview, addComment, getPostComments, replacePreviews, removePreview]);
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

  /** The window of the record the card in view is playing, if it plays a piece of one. */
  const [clip, setClip] = useState<{ songId: string; startSeconds: number; windowSeconds: number } | null>(null);

  const resolvePostSong = useCallback((post: SocialPostWithProfile) => songOfPost(post, catalog), [catalog]);

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

    // A pulse is a moment, so the card plays that moment and loops ten seconds
    // of it. The Room's card plays half a minute of what is on in there.
    // Anything else plays from the top, as it always has.
    const isPulse = post.post_type === 'song_pulse';
    const isRoom = post.post_type === 'activity' && post.activity_type === 'room_entered';
    const pulsedAt = typeof post.metadata?.position_seconds === 'number' ? post.metadata.position_seconds : 0;
    const clipStart = Math.max(0, pulsedAt - 2);
    playSongRef.current(songToPlay, isPulse ? { startTime: clipStart } : undefined);
    setClip(
      isPulse
        ? { songId: songToPlay.id, startSeconds: clipStart, windowSeconds: 10 }
        : isRoom
          ? { songId: songToPlay.id, startSeconds: 0, windowSeconds: 30 }
          : null,
    );
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

  /**
   * Post a comment and show it immediately.
   *
   * This used to await the insert and then await a full refetch before
   * anything appeared, while the input had already cleared. Two round trips of
   * nothing on screen reads as "my comment vanished", and the database agrees:
   * one comment across eighty-eight posts. Liking and following were already
   * optimistic; this was the one interaction that still made you wait.
   *
   * The comment goes up instantly against the real profile, then the refetch
   * reconciles it. If the write fails, it is pulled back out and said so.
   */
  const handleAddComment = async (content: string, mentions?: MentionPerson[]) => {
    if (!commentSheet.postId || !user) return;
    const postId = commentSheet.postId;
    const tempId = `pending-${Date.now()}`;

    const pending: PostComment = {
      id: tempId,
      user_id: user.id,
      post_id: postId,
      content,
      created_at: new Date().toISOString(),
      profile: audienceProfile ?? undefined,
      likes_count: 0,
      is_liked: false,
    };
    setCurrentComments((prev) => [...prev, pending]);

    try {
      await addComment(postId, content, mentions);
      const comments = await getPostComments(postId);
      setCurrentComments(comments);
      replacePreviews(postId, comments);
    } catch {
      setCurrentComments((prev) => prev.filter((c) => c.id !== tempId));
      toast({ title: 'Your comment did not send', variant: 'destructive' });
    }
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
    <div className="screen-h bg-black relative overflow-hidden">
      {/* Holds the card in view to its own piece of the record. */}
      {clip && (
        <ClipLooper songId={clip.songId} startSeconds={clip.startSeconds} windowSeconds={clip.windowSeconds} />
      )}

      {/* ── Scrollable feed ── */}
      <div
        ref={feedRef}
        className={isPhotos
          ? 'absolute inset-0 overflow-y-auto overscroll-contain bg-background pb-28 pt-16'
          : 'absolute inset-0 overflow-y-scroll overscroll-none snap-y snap-mandatory'}
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
              <h3 className={`font-bold text-xl mb-2 ${isPhotos ? 'text-foreground' : 'text-white'}`}>
                {feedType === 'following'
                  ? 'Follow music fans'
                  : feedType === 'videos'
                    ? 'No clips yet'
                    : feedType === 'photos'
                      ? 'No posts yet'
                      : 'Be the first'}
              </h3>
              <p className={`mb-6 ${isPhotos ? 'text-muted-foreground' : 'text-white/60'}`}>
                {feedType === 'following'
                  ? 'Follow people and their posts show up here.'
                  : feedType === 'videos'
                    ? 'Post a clip with a song on it and it lands here.'
                    : feedType === 'photos'
                      ? 'Post a picture or a song and it lands here.'
                      : 'Share what you are listening to and start the conversation.'}
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
          isPhotos ? (
            <div className="mx-auto w-full max-w-xl sm:px-2">
              {postsToRender.map((post) => (
                <FeedPostCard
                  key={post.id}
                  post={post}
                  catalog={catalog}
                  previewComments={previews[post.id]}
                  onLike={toggleLikePost}
                  onComment={() => handleOpenComments(post.id)}
                  onFollow={followUser}
                  isFollowing={isFollowing(post.user_id) || post.user_id === user?.id}
                />
              ))}
            </div>
          ) : postsToRender.map((post) => (
            <div
              key={post.id}
              data-post-id={post.id}
              ref={(el) => registerCardRef(post.id, el)}
              className="h-full w-full snap-start"
            >
              <MusicFeedCard
                post={post}
                previewComments={previews[post.id]}
                onQuickComment={handleQuickComment}
                mentions={postMentions?.[post.id]}
                reactions={postReactions[post.id]}
                onReact={handleReact}
                onLike={toggleLikePost}
                onFollow={followUser}
                isFollowing={isFollowing(post.user_id)}
                onComment={() => handleOpenComments(post.id)}
                onDelete={handleDeletePost}
                onEdit={editPost}
                onUntagSelf={untagSelf}
              />
            </div>
          ))
        )}
      </div>

      {/* ── Top bar ──
          One line at every width: the sections as text tabs, search and create
          on the right. No title, no pills: "Feed" and "For You" used to wrap onto
          two lines on a phone. Over the full screen sections it floats on a
          shade; over Photos it is solid, like any list app. */}
      <div className={`absolute top-0 left-0 right-0 z-30 ${isPhotos ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div className={isPhotos ? 'border-b border-border/60 bg-background/95 backdrop-blur-md' : 'bg-gradient-to-b from-black/75 via-black/35 to-transparent'}>
          <div className="mx-auto max-w-3xl px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
            <div className="flex items-center gap-2 pointer-events-auto">
              {sharedPost ? (
                <button
                  type="button"
                  onClick={backToFeed}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white/10 pl-2 pr-3 text-sm font-semibold text-white backdrop-blur-sm"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={leaveFeed}
                  aria-label="Leave the feed"
                  title="Leave the feed"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full lg:hidden ${isPhotos ? 'bg-secondary text-foreground' : 'bg-white/10 text-white backdrop-blur-sm'}`}
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}

              <nav aria-label="Feed sections" className="min-w-0 flex-1 overflow-x-auto scrollbar-hide">
                <div className="flex w-max items-center gap-3.5 px-0.5 sm:gap-5">
                  {([
                    { key: 'foryou', label: 'For you' },
                    { key: 'following', label: 'Following' },
                    { key: 'videos', label: 'Videos', icon: Clapperboard },
                    { key: 'photos', label: 'Posts', icon: Images },
                  ] as Array<{ key: FeedSection; label: string; icon?: typeof Images }>).map((tab) => {
                    const on = feedType === tab.key && !sharedPost;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => {
                          if (sharedPost) backToFeed();
                          setFeedType(tab.key);
                          feedRef.current?.scrollTo({ top: 0 });
                        }}
                        aria-pressed={on}
                        className={`relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap text-[14px] transition-colors sm:text-[15px] ${
                          on
                            ? isPhotos ? 'font-bold text-foreground' : 'font-bold text-white'
                            : isPhotos ? 'font-semibold text-muted-foreground hover:text-foreground' : 'font-semibold text-white/60 hover:text-white'
                        }`}
                      >
                        {tab.icon && <tab.icon className="hidden h-4 w-4 sm:block" />}
                        {tab.label}
                        {on && (
                          <span className={`absolute -bottom-0.5 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full ${isPhotos ? 'bg-foreground' : 'bg-white'}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </nav>

              <button
                type="button"
                aria-label="Create a post"
                onClick={() => setShowComposer(true)}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isPhotos ? 'bg-primary text-primary-foreground' : 'bg-white text-black'}`}
              >
                <Plus className="h-5 w-5" />
              </button>

              {/* Discover */}
              <Sheet>
                <SheetTrigger asChild>
                  <button
                    aria-label="Find people"
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isPhotos ? 'bg-muted text-foreground' : 'bg-white/10 text-white backdrop-blur-sm'}`}
                  >
                    <Search className="h-4 w-4" />
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
                                <p className="font-semibold truncate"><ArtistName name={profile.profile_name} userId={profile.user_id} size={14} /></p>
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

            {/* Room banner */}
            {playerState?.isRoomMode && playerState.currentSong && (
              <div className="mt-3 rounded-2xl border border-border bg-black/50 backdrop-blur-md px-3 py-2 flex items-center gap-3">
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
                onPost={async (content, type, songId, extras) => {
                  const ok = await createPost(content, type, songId, undefined, extras);
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
        onDeleteComment={handleDeleteComment}
        onEditComment={editComment}
        commentsCount={currentComments.length}
      />
    </div>
  );
}
