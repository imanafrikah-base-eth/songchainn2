import { type UIEvent, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Headphones,
  Plus,
  Compass,
  Search,
  Sparkles,
  ArrowLeft
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
import { useSafePlayerState } from '@/context/PlayerContext';
import { AnimatedBackground } from '@/components/ui/animated-background';

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
    deletePost,
    toggleLikePost,
    followUser,
    isFollowing,
    getPostComments,
    addComment,
    refetchPosts
  } = useSocial();
  const playerState = useSafePlayerState();

  const [feedType, setFeedType] = useState<'foryou' | 'following'>('foryou');
  const [suggestedUsers, setSuggestedUsers] = useState<AudienceProfile[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [currentPostIndex, setCurrentPostIndex] = useState(0);
  const [sharedPost, setSharedPost] = useState<SocialPostWithProfile | null>(null);
  const [isLoadingSharedPost, setIsLoadingSharedPost] = useState(false);
  const [commentSheet, setCommentSheet] = useState<{ isOpen: boolean; postId: string | null }>({
    isOpen: false,
    postId: null
  });
  const [currentComments, setCurrentComments] = useState<PostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const sharedPostId = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return params.id || searchParams.get('post');
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

      const profiles = ((data as any[]) || []).filter((p) => p?.id && p.id !== user.id) as AudienceProfile[];
      const notFollowing = profiles.filter((p) => !following.includes(p.id));
      setSuggestedUsers(notFollowing.slice(0, 5));
      setLoadingSuggestions(false);
    };

    fetchSuggestedUsers();
  }, [user, following]);

  useEffect(() => {
    refetchPosts(feedType === 'following' ? 'following' : 'all');
  }, [feedType, refetchPosts]);

  useEffect(() => {
    if (shareSongId) {
      setShowComposer(true);
    }
  }, [shareSongId]);

  useEffect(() => {
    if (!sharedPostId) {
      setSharedPost(null);
      setIsLoadingSharedPost(false);
      return;
    }

    const attemptScrollToPost = () => {
      const postIndex = posts.findIndex(p => p.id === sharedPostId);
      if (postIndex < 0) return false;
      const container = feedRef.current;
      if (!container) return false;
      const itemHeight = container.clientHeight;
      container.scrollTo({ top: postIndex * itemHeight, behavior: 'auto' });
      setCurrentPostIndex(postIndex);
      return true;
    };

    if (attemptScrollToPost()) return;

    const fetchSharedPost = async () => {
      setIsLoadingSharedPost(true);
      try {
        const candidate = posts.find((p) => p.id === sharedPostId) || null;
        setSharedPost(candidate);
        setCurrentPostIndex(0);
      } finally {
        setIsLoadingSharedPost(false);
      }
    };

    fetchSharedPost();
  }, [posts, sharedPostId, user]);

  const filteredPosts = feedType === 'following' 
    ? posts.filter(p => following.includes(p.user_id) || p.user_id === user?.id)
    : posts;

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

  const currentPost = filteredPosts[currentPostIndex];
  const currentCommentsCount = currentPost?.comments_count || 0;

  const closeComposer = useCallback(() => {
    setShowComposer(false);
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.has('song')) {
      searchParams.delete('song');
      navigate({ pathname: location.pathname, search: searchParams.toString() }, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (sharedPostId) return;
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    const itemHeight = container.clientHeight;
    const newIndex = Math.round(scrollTop / itemHeight);
    if (newIndex !== currentPostIndex && newIndex >= 0 && newIndex < filteredPosts.length) {
      setCurrentPostIndex(newIndex);
    }
  }, [currentPostIndex, filteredPosts.length, sharedPostId]);

  const goToProfile = async (userId: string) => {
    navigate(`/audience/${userId}`);
  };

  const postsToRender = sharedPost ? [sharedPost] : filteredPosts;
  const effectiveIsLoading = isLoading || isLoadingSharedPost;
  const effectiveCommentsCount = sharedPost ? sharedPost.comments_count : currentCommentsCount;
  const totalPosts = posts.length;
  const followingCount = following.length;
  const followersCount = followers.length;

  return (
    <div className="h-dvh bg-background relative overflow-hidden">
      <AnimatedBackground variant="default" />
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full border border-border/60 bg-background/70 mr-1"
                    onClick={() => navigate(-1)}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h1 className="font-bold text-lg">Feed</h1>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    TikTok-style music feed with autoplay moments.
                  </p>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="icon" className="relative">
                        <Search className="w-5 h-5" />
                      </Button>
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
                            suggestedUsers.map(profile => (
                              <motion.div
                                key={profile.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors cursor-pointer"
                                onClick={() => void goToProfile(profile.user_id)}
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

              <div className="flex items-center justify-center gap-1 bg-muted rounded-full p-1 w-full">
                <button
                  onClick={() => setFeedType('foryou')}
                  className={`flex-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    feedType === 'foryou' 
                      ? 'bg-background text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  For You
                </button>
                <button
                  onClick={() => setFeedType('following')}
                  className={`flex-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    feedType === 'following' 
                      ? 'bg-background text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Following
                </button>
              </div>
            </div>
          </div>
          {playerState?.isRoomMode && playerState.currentSong && (
            <div className="max-w-lg mx-auto px-4 pb-3">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-black/40 overflow-hidden flex-shrink-0">
                  {playerState.currentSong.coverImage ? (
                    <img
                      src={playerState.currentSong.coverImage}
                      alt={playerState.currentSong.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[11px] text-primary mb-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span>Now Playing in The Room</span>
                    </span>
                  </div>
                  <div className="text-sm font-medium text-foreground truncate">
                    {playerState.currentSong.title}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {playerState.currentSong.artist}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="flex-shrink-0"
                  onClick={() => navigate('/room')}
                >
                  <Headphones className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {!effectiveIsLoading && (
          <div className="bg-background/80 backdrop-blur-sm border-b border-border/60">
            <div className="max-w-lg mx-auto px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Headphones className="w-3.5 h-3.5 text-primary" />
                  <span>{totalPosts} listener moments</span>
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>{followingCount} people you follow</span>
                </span>
                <span className="hidden sm:inline-flex items-center gap-1">
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{followersCount} people vibing with you</span>
                </span>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-1"
                onClick={() => setShowComposer(true)}
              >
                <Plus className="w-3 h-3" />
                <span>Share what you&apos;re playing with the crowd</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Feed - Vertical Scroll Snap */}
        <div
          ref={feedRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain snap-y snap-mandatory scroll-smooth fast-tap"
          onScroll={handleScroll}
          style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {effectiveIsLoading ? (
            <div className="h-[calc(100vh-180px)] flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading your feed...</p>
              </div>
            </div>
          ) : postsToRender.length === 0 ? (
            <div className="h-[calc(100vh-180px)] flex items-center justify-center px-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center max-w-sm"
              >
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                  {feedType === 'following' ? (
                    <Users className="w-10 h-10 text-primary" />
                  ) : (
                    <Compass className="w-10 h-10 text-primary" />
                  )}
                </div>
                <h3 className="font-bold text-xl mb-2">
                  {feedType === 'following' ? 'Follow music fans' : 'Be the first!'}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {feedType === 'following' 
                    ? 'Follow people to see their music shares and activity here'
                    : 'Share what you&apos;re listening to and start the conversation'}
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
            <div className="max-w-lg mx-auto px-2">
              {postsToRender.map((post, index) => (
                <div
                  key={post.id}
                  className="snap-start snap-always h-[calc(100dvh-12rem)]"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <MusicFeedCard
                    post={post}
                    onLike={toggleLikePost}
                    onFollow={followUser}
                    isFollowing={isFollowing(post.user_id)}
                    onComment={() => handleOpenComments(post.id)}
                    isVisible={sharedPost ? true : index === currentPostIndex}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Floating Create Button */}
        <motion.button
          className="fixed right-4 bottom-24 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center z-30"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowComposer(true)}
        >
          <Plus className="w-6 h-6" />
        </motion.button>

        {/* Post Composer Modal */}
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
                    await createPost(content, type, songId);
                    closeComposer();
                  }}
                  initialType={shareSongId ? 'song_share' : 'text'}
                  initialSongId={shareSongId ?? undefined}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Comment Sheet */}
        <CommentSheet
          isOpen={commentSheet.isOpen}
          onClose={() => setCommentSheet({ isOpen: false, postId: null })}
          comments={currentComments}
          isLoading={loadingComments}
          onAddComment={handleAddComment}
          commentsCount={effectiveCommentsCount}
        />

      </div>
    </div>
  );
}
