import { useState, type SyntheticEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Play, 
  Music,
  UserPlus,
  Check,
  Disc3,
  Copy,
  PartyPopper,
  Sparkles,
  Flame
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SocialPostWithProfile } from '@/types/social';
import { SONGS, ARTISTS } from '@/data/musicData';
import { usePlayer } from '@/context/PlayerContext';
import { useAuth } from '@/context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useShare } from '@/hooks/useShare';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePulseCounts } from '@/hooks/usePopularity';

interface MusicFeedCardProps {
  post: SocialPostWithProfile;
  onLike: (postId: string) => void;
  onFollow: (userId: string) => void;
  isFollowing: boolean;
  onComment: () => void;
}

export function MusicFeedCard({
  post,
  onLike,
  onFollow,
  isFollowing,
  onComment,
}: MusicFeedCardProps) {
  const { user } = useAuth();
  const { currentSong, isPlaying, playSong, pause, play } = usePlayer();
  const navigate = useNavigate();
  const { sharePost, shareSong, copied, getShareUrl, getSongShareUrl, copyToClipboard } = useShare();
  const [showHeart, setShowHeart] = useState(false);
  const { data: pulseCounts } = usePulseCounts();

  const song = post.song_id ? SONGS.find(s => s.id === post.song_id) : null;
  const artist = song ? ARTISTS.find(a => a.id === song.artistId) : null;
  const postArtist = post.artist_id ? ARTISTS.find(a => a.id === post.artist_id) : null;
  const displayName = post.profile?.profile_name || postArtist?.name || 'Anonymous';
  const isOwnPost = user?.id === post.user_id;
  const isThisSongPlaying = currentSong?.id === song?.id && isPlaying;
  const isWelcomePost = post.post_type === 'welcome';
  const isSongLikePost = post.post_type === 'song_like';
  const battleLiveMatch = post.content?.match(/BATTLE_LIVE::([a-zA-Z0-9-]+)::(.*)/);
  const battleLiveId = battleLiveMatch?.[1] ?? null;
  const battleLiveTitle = battleLiveMatch?.[2]?.trim() ?? null;

  const totalPulses = pulseCounts && song
    ? (pulseCounts.find(p => p.song_id === song.id)?.pulse_count || 0)
    : 0;

  const handleSongImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.dataset.fallbackApplied === 'true') return;
    target.dataset.fallbackApplied = 'true';
    target.src = '/placeholder.svg';
  };

  const handleShare = () => {
    if (song && artist) {
      shareSong(song.title, artist.name, song.id, song.coverImage);
    } else {
      sharePost(post.id, post.content || undefined);
    }
  };

  const handleCopyLink = () => {
    const url = song
      ? getSongShareUrl({ id: song.id, title: song.title, artist: artist?.name || song.artist, coverImage: song.coverImage })
      : getShareUrl('post', post.id);
    copyToClipboard(url);
  };

  const handleDoubleTap = () => {
    if (!post.is_liked) {
      onLike(post.id);
    }
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 1000);
  };

  const handlePlayPause = () => {
    if (!song) return;
    
    if (currentSong?.id === song.id) {
      if (isPlaying) {
        pause();
      } else {
        play();
      }
    } else {
      playSong(song);
    }
  };

  const goToProfile = () => {
    if (post.artist_id) {
      navigate(`/artist/${post.artist_id}`);
      return;
    }
    navigate(`/audience/${post.user_id}`);
  };

  return (
    <motion.div
      className="relative w-full min-h-[420px] sm:min-h-[500px] bg-card rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Background Visual */}
      <div 
        className="absolute inset-0 cursor-pointer"
        onClick={song ? handlePlayPause : undefined}
        onDoubleClick={handleDoubleTap}
      >
        {isWelcomePost ? (
          // Welcome post - celebration background
          <div className="relative w-full h-full bg-gradient-to-br from-primary/40 via-purple-500/30 to-pink-500/40 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            <motion.div 
              className="relative z-10 text-center px-8"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                <PartyPopper className="w-24 h-24 text-yellow-400 mx-auto mb-6" />
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-2">Welcome!</h2>
              <p className="text-white/80 text-lg">{post.profile?.profile_name || 'Someone new'}</p>
              <p className="text-white/60 text-sm mt-2">just joined $ongChainn</p>
            </motion.div>
          </div>
        ) : isSongLikePost && song ? (
          // Song like post - show the song with a heart overlay
          <div className="relative w-full h-full">
            <img 
              src={song.coverImage} 
              alt={song.title}
              className="w-full h-full object-contain"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/20" />
            
            {/* Heart animation overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="relative"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 10 }}
              >
                <motion.div
                  className="w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden border-4 border-red-500/50 shadow-2xl"
                  animate={isThisSongPlaying ? { rotate: 360 } : {}}
                  transition={isThisSongPlaying ? { duration: 3, repeat: Infinity, ease: 'linear' } : {}}
                >
                  <img
                    src={song.coverImage}
                    alt={song.title}
                    className="w-full h-full object-cover"
                    onError={handleSongImageError}
                  />
                </motion.div>
                <motion.div
                  className="absolute -top-4 -right-4 bg-red-500 rounded-full p-3"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <Heart className="w-8 h-8 text-white fill-white" />
                </motion.div>
              </motion.div>
            </div>

            {/* Play/Pause Overlay */}
            <AnimatePresence>
              {!isThisSongPlaying && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                    <Play className="w-10 h-10 text-white fill-white ml-1" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : song ? (
          <div className="relative w-full h-full">
            <img 
              src={song.coverImage} 
              alt={song.title}
              className="w-full h-full object-contain"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/20" />
            
            {/* Vinyl Animation */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden border-4 border-foreground/10 shadow-2xl"
                animate={isThisSongPlaying ? { rotate: 360 } : {}}
                transition={isThisSongPlaying ? { duration: 3, repeat: Infinity, ease: 'linear' } : {}}
              >
                <img
                  src={song.coverImage}
                  alt={song.title}
                  className="w-full h-full object-cover"
                  onError={handleSongImageError}
                />
              </motion.div>
              
              {/* Play/Pause Overlay */}
              <AnimatePresence>
                {!isThisSongPlaying && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                      <Play className="w-10 h-10 text-white fill-white ml-1" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/30 via-background to-primary/10 flex items-center justify-center">
            <Music className="w-24 h-24 text-primary/30" />
          </div>
        )}

        {/* Double Tap Heart Animation */}
        <AnimatePresence>
          {showHeart && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1.2 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart className="w-32 h-32 text-red-500 fill-red-500 drop-shadow-2xl" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right Side Actions */}
      <div className="absolute right-2 sm:right-4 bottom-28 sm:bottom-32 flex flex-col items-center gap-4 sm:gap-6">
        {/* Profile */}
        <div className="relative">
          <button onClick={goToProfile}>
            <Avatar className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-white shadow-lg">
              <AvatarImage src={post.profile?.profile_picture_url || ''} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {post.profile?.profile_name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
          </button>
          {!isOwnPost && (
            <button
              onClick={() => onFollow(post.user_id)}
              className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-white shadow-lg ${
                isFollowing ? 'bg-muted' : 'bg-primary'
              }`}
            >
              {isFollowing ? <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <UserPlus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
            </button>
          )}
        </div>

        {/* Like */}
        <button 
          className="flex flex-col items-center gap-1"
          onClick={() => onLike(post.id)}
        >
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${
            post.is_liked ? 'bg-red-500/20' : 'bg-white/10 backdrop-blur-sm'
          }`}>
            <Heart className={`w-5 h-5 sm:w-6 sm:h-6 ${post.is_liked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
          </div>
          <span className="text-xs text-white font-medium">{post.likes_count || 0}</span>
        </button>

        {/* Comment */}
        <button 
          className="flex flex-col items-center gap-1"
          onClick={onComment}
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <span className="text-xs text-white font-medium">{post.comments_count || 0}</span>
        </button>

        {/* Share */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <Share2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <span className="text-xs text-white font-medium">Share</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={handleShare} className="gap-2">
              <Share2 className="w-4 h-4" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyLink} className="gap-2">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              Copy Link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Disc Animation */}
        <motion.div
          animate={isThisSongPlaying ? { rotate: 360 } : {}}
          transition={isThisSongPlaying ? { duration: 3, repeat: Infinity, ease: 'linear' } : {}}
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-white/50 overflow-hidden"
        >
          {song ? (
            <img
              src={song.coverImage}
              alt=""
              className="w-full h-full object-contain"
              onError={handleSongImageError}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center">
              <Disc3 className="w-6 h-6 text-white" />
            </div>
          )}
        </motion.div>
      </div>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-16 sm:right-20 p-3 sm:p-4">
        {/* User Info */}
        <button onClick={goToProfile} className="flex items-center gap-2 mb-3">
          <span className="font-bold text-white text-base sm:text-lg truncate">
            @{post.profile?.profile_name || 'Anonymous'}
          </span>
          {isFollowing && (
            <span className="text-xs text-white/60 bg-white/10 px-2 py-0.5 rounded-full">
              Following
            </span>
          )}
        </button>

        {/* Content based on post type */}
        {isWelcomePost ? (
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            <p className="text-white/90 text-sm">
              Welcome to the community! Say hello 👋
            </p>
          </div>
        ) : isSongLikePost && song ? (
          <div className="mb-3">
            <p className="text-white/90 text-sm flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-500 fill-red-500" />
              liked "{song.title}" by {artist?.name}
            </p>
          </div>
        ) : post.content ? (
          <p className="text-white/90 text-xs sm:text-sm mb-3 line-clamp-3">{post.content}</p>
        ) : null}

        {battleLiveId && (
          <button
            type="button"
            onClick={() => navigate(`/wavewarz-africa/room/${battleLiveId}`)}
            className="mb-3 inline-flex items-center gap-2 rounded-full border border-rose-300/40 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/25"
          >
            <Flame className="h-3.5 w-3.5" />
            Join Live Battle{battleLiveTitle ? `: ${battleLiveTitle}` : ''}
          </button>
        )}

        {/* Song Info */}
        {song && !isWelcomePost && (
          <motion.div 
            className={`flex items-center gap-2 backdrop-blur-md rounded-full py-2 px-3 w-fit ${
              isSongLikePost ? 'bg-red-500/20' : 'bg-white/10'
            }`}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            {isSongLikePost ? (
              <Heart className="w-4 h-4 text-red-400 fill-red-400" />
            ) : (
              <Music className="w-4 h-4 text-white" />
            )}
            {totalPulses > 0 && (
              <span className="text-[11px] text-white/80 tabular-nums">
                ❤️‍🔥 {totalPulses.toLocaleString()}
              </span>
            )}
            <div className="overflow-hidden max-w-[200px]">
              <motion.p 
                className="text-sm text-white font-medium whitespace-nowrap"
                animate={isThisSongPlaying ? { x: [-200, 0] } : {}}
                transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
              >
                {song.title} • {artist?.name}
              </motion.p>
            </div>
          </motion.div>
        )}

        {/* Timestamp */}
        <p className="text-white/50 text-xs mt-2">
          {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
        </p>
        <p className="text-white/70 text-[11px] mt-1">
          Thanks for listening early. Your plays earn points toward future ownership drops.
        </p>
      </div>
    </motion.div>
  );
}
