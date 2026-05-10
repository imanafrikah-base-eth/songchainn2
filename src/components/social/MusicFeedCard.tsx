import { useState, type SyntheticEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  MessageCircle,
  Share2,
  Play,
  Pause,
  Music,
  UserPlus,
  Check,
  Disc3,
  Copy,
  PartyPopper,
  Sparkles,
  Flame,
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
  const { data: pulseCounts } = usePulseCounts();

  const song = post.song_id ? SONGS.find(s => s.id === post.song_id) : null;
  const artist = song ? ARTISTS.find(a => a.id === song.artistId) : null;
  const postArtist = post.artist_id ? ARTISTS.find(a => a.id === post.artist_id) : null;
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

  const handlePlayPause = () => {
    if (!song) return;
    if (currentSong?.id === song.id) {
      isPlaying ? pause() : play();
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

  // Background derived from post type
  const hasCover = !!(song?.coverImage);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">

      {/* ── Full-bleed background ── */}
      {isWelcomePost ? (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/60 via-purple-600/40 to-pink-600/50" />
      ) : hasCover ? (
        <>
          {/* Blurred ambient layer */}
          <img
            src={song!.coverImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-lg opacity-40"
            aria-hidden
            onError={handleSongImageError}
          />
          <div className="absolute inset-0 bg-black/50" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-background/80 to-primary/10" />
      )}

      {/* ── Gradient overlay for readability ── */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30 pointer-events-none" />

      {/* ── Tap area ── */}
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={song ? handlePlayPause : undefined}
      >
        {/* Center artwork */}
        <div className="absolute inset-0 flex items-center justify-center">
          {isWelcomePost ? (
            <motion.div
              className="text-center px-8"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                <PartyPopper className="w-24 h-24 text-yellow-400 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-1">Welcome!</h2>
              <p className="text-white/80">{post.profile?.profile_name || 'Someone new'}</p>
              <p className="text-white/50 text-sm mt-1">just joined $ongChainn</p>
            </motion.div>
          ) : hasCover ? (
            <motion.div
              className={`rounded-full overflow-hidden shadow-2xl border-4 ${
                isSongLikePost ? 'border-red-500/60 w-52 h-52 md:w-64 md:h-64' : 'border-white/20 w-52 h-52 md:w-64 md:h-64'
              }`}
              animate={isThisSongPlaying ? { rotate: 360 } : {}}
              transition={isThisSongPlaying ? { duration: 3, repeat: Infinity, ease: 'linear' } : {}}
            >
              <img
                src={song!.coverImage}
                alt={song!.title}
                className="w-full h-full object-cover"
                onError={handleSongImageError}
              />
            </motion.div>
          ) : (
            <div className="w-52 h-52 rounded-full bg-primary/20 flex items-center justify-center">
              <Music className="w-20 h-20 text-primary/60" />
            </div>
          )}

          {/* Song like heart badge */}
          {isSongLikePost && (
            <motion.div
              className="absolute -top-2 right-[calc(50%-100px)] bg-red-500 rounded-full p-2.5 shadow-lg"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <Heart className="w-6 h-6 text-white fill-white" />
            </motion.div>
          )}

          {/* Play / Pause indicator */}
          {song && (
            <AnimatePresence>
              {!isThisSongPlaying && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  className="absolute bottom-[42%] left-1/2 -translate-x-1/2 pointer-events-none"
                >
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                    <Play className="w-8 h-8 text-white fill-white ml-1" />
                  </div>
                </motion.div>
              )}
              {isThisSongPlaying && (
                <motion.div
                  key="pause-hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-[42%] left-1/2 -translate-x-1/2 pointer-events-none"
                >
                  <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center">
                    <Pause className="w-8 h-8 text-white fill-white" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ── Right-side action bar ── */}
      <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5 z-10">
        {/* Avatar + follow */}
        <div className="relative mb-1">
          <button onClick={goToProfile}>
            <Avatar className="w-11 h-11 border-2 border-white shadow-lg">
              <AvatarImage src={post.profile?.profile_picture_url || ''} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {post.profile?.profile_name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
          </button>
          {!isOwnPost && (
            <button
              onClick={(e) => { e.stopPropagation(); onFollow(post.user_id); }}
              className={`absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-lg transition-colors ${
                isFollowing ? 'bg-white/30' : 'bg-primary'
              }`}
            >
              {isFollowing
                ? <Check className="w-3 h-3" />
                : <UserPlus className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* Like */}
        <button
          className="flex flex-col items-center gap-1"
          onClick={(e) => { e.stopPropagation(); onLike(post.id); }}
        >
          <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
            post.is_liked ? 'bg-red-500/30' : 'bg-white/10 backdrop-blur-sm'
          }`}>
            <Heart className={`w-6 h-6 ${post.is_liked ? 'text-red-400 fill-red-400' : 'text-white'}`} />
          </div>
          <span className="text-[11px] text-white/90 font-medium">{post.likes_count || 0}</span>
        </button>

        {/* Comment */}
        <button
          className="flex flex-col items-center gap-1"
          onClick={(e) => { e.stopPropagation(); onComment(); }}
        >
          <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-[11px] text-white/90 font-medium">{post.comments_count || 0}</span>
        </button>

        {/* Share */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex flex-col items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <Share2 className="w-6 h-6 text-white" />
              </div>
              <span className="text-[11px] text-white/90 font-medium">Share</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={handleShare} className="gap-2">
              <Share2 className="w-4 h-4" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyLink} className="gap-2">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              Copy link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Spinning disc */}
        <motion.div
          animate={isThisSongPlaying ? { rotate: 360 } : {}}
          transition={isThisSongPlaying ? { duration: 3, repeat: Infinity, ease: 'linear' } : {}}
          className="w-11 h-11 rounded-full border-2 border-white/40 overflow-hidden shadow-lg"
        >
          {song?.coverImage ? (
            <img
              src={song.coverImage}
              alt=""
              className="w-full h-full object-cover"
              onError={handleSongImageError}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center">
              <Disc3 className="w-5 h-5 text-white" />
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Bottom info ── */}
      <div className="absolute bottom-0 left-0 right-16 p-4 z-10">
        {/* Username */}
        <button onClick={goToProfile} className="flex items-center gap-2 mb-2">
          <span className="font-bold text-white text-base truncate max-w-[200px]">
            @{post.profile?.profile_name || (postArtist?.name ?? 'Anonymous')}
          </span>
          {isFollowing && (
            <span className="text-[10px] text-white/50 bg-white/10 px-1.5 py-0.5 rounded-full shrink-0">
              Following
            </span>
          )}
        </button>

        {/* Post content */}
        {isWelcomePost ? (
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-yellow-400 shrink-0" />
            <p className="text-white/90 text-sm">Welcome to the community! Say hello 👋</p>
          </div>
        ) : isSongLikePost && song ? (
          <div className="mb-2">
            <p className="text-white/90 text-sm flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400 shrink-0" />
              liked &quot;{song.title}&quot; by {artist?.name}
            </p>
          </div>
        ) : post.content ? (
          <p className="text-white/90 text-sm mb-2 line-clamp-2">{post.content}</p>
        ) : null}

        {/* Battle live */}
        {battleLiveId && (
          <button
            type="button"
            onClick={() => window.open('https://www.wavewarz.com', '_blank', 'noopener,noreferrer')}
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-rose-300/40 bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-100"
          >
            <Flame className="h-3.5 w-3.5" />
            Live battle on WaveWarz.com{battleLiveTitle ? `: ${battleLiveTitle}` : ''}
          </button>
        )}

        {/* Song ticker */}
        {song && !isWelcomePost && (
          <div className={`flex items-center gap-2 rounded-full py-1.5 px-3 w-fit backdrop-blur-md ${
            isSongLikePost ? 'bg-red-500/20' : 'bg-white/10'
          }`}>
            {isSongLikePost
              ? <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400 shrink-0" />
              : <Music className="w-3.5 h-3.5 text-white shrink-0" />}
            {totalPulses > 0 && (
              <span className="text-[11px] text-white/80 tabular-nums shrink-0">
                ❤️‍🔥 {totalPulses.toLocaleString()}
              </span>
            )}
            <div className="overflow-hidden max-w-[180px]">
              <motion.p
                className="text-xs text-white font-medium whitespace-nowrap"
                animate={isThisSongPlaying ? { x: [0, -120, 0] } : {}}
                transition={isThisSongPlaying ? { duration: 6, repeat: Infinity, ease: 'linear' } : {}}
              >
                {song.title} · {artist?.name ?? song.artist}
              </motion.p>
            </div>
          </div>
        )}

        <p className="text-white/40 text-[11px] mt-2">
          {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
