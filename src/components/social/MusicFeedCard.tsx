import { useState, type SyntheticEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, MessageCircle, Share2, Play, Pause, Music,
  UserPlus, Check, Disc3, Copy, PartyPopper, Sparkles, Flame, UserCheck,
  ListMusic, Headphones,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SocialPostWithProfile } from '@/types/social';
import { SONGS, ARTISTS } from '@/data/musicData';
import { usePlayer } from '@/context/PlayerContext';
import { useAuth } from '@/context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useShare } from '@/hooks/useShare';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePulseCounts } from '@/hooks/usePopularity';
import { getArtistSlugUrl, getSongSlugUrl } from '@/lib/slugRoutes';

function formatPulseTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface MusicFeedCardProps {
  post: SocialPostWithProfile;
  onLike: (postId: string) => void;
  onFollow: (userId: string) => void;
  isFollowing: boolean;
  onComment: () => void;
}

export function MusicFeedCard({ post, onLike, onFollow, isFollowing, onComment }: MusicFeedCardProps) {
  const { user } = useAuth();
  const { currentSong, isPlaying, playSong, pause, play } = usePlayer();
  const navigate = useNavigate();
  const { shareSong, sharePost, copied, getSongShareUrl, getShareUrl, copyToClipboard } = useShare();
  const { data: pulseCounts } = usePulseCounts();
  const [imgErr, setImgErr] = useState(false);

  const song       = post.song_id    ? SONGS.find(s => s.id === post.song_id)      : null;
  const artist     = song            ? ARTISTS.find(a => a.id === song.artistId)    : null;
  const postArtist = post.artist_id  ? ARTISTS.find(a => a.id === post.artist_id)   : null;
  const artistSong = postArtist      ? (SONGS.filter(s => s.artistId === postArtist.id).sort((a,b)=>b.plays-a.plays)[0] ?? null) : null;
  const activeSong = song ?? artistSong;

  const isOwnPost          = user?.id === post.user_id;
  const isThisSongPlaying  = activeSong ? currentSong?.id === activeSong.id && isPlaying : false;
  const isWelcomePost      = post.post_type === 'welcome';
  const isSongLikePost     = post.post_type === 'song_like';
  const isSongPulsePost    = post.post_type === 'song_pulse';
  const isSongCommentPost  = post.post_type === 'song_comment';
  const isArtistFollowPost = post.post_type === 'artist_follow';
  const isPlaylistCreatedPost = post.post_type === 'activity' && post.activity_type === 'playlist_created';
  const isRoomEnteredPost  = post.post_type === 'activity' && post.activity_type === 'room_entered';

  const pulsePositionSeconds = isSongPulsePost && typeof post.metadata?.position_seconds === 'number'
    ? post.metadata.position_seconds
    : null;

  const battleMatch = post.content?.match(/BATTLE_LIVE::([a-zA-Z0-9-]+)::(.*)/);
  const totalPulses = pulseCounts && song ? (pulseCounts.find(p => p.song_id === song.id)?.pulse_count ?? 0) : 0;
  const coverUrl    = isArtistFollowPost ? (postArtist?.profileImage ?? artistSong?.coverImage) : activeSong?.coverImage;

  const handleImgError = (e: SyntheticEvent<HTMLImageElement>) => {
    if ((e.currentTarget as any).dataset.fb === 'true') return;
    (e.currentTarget as any).dataset.fb = 'true';
    e.currentTarget.src = '/placeholder.svg';
    setImgErr(true);
  };

  const handlePlayPause = () => {
    if (!activeSong) return;
    if (currentSong?.id === activeSong.id) {
      if (isPlaying) pause();
      else play();
    } else {
      playSong(activeSong, pulsePositionSeconds !== null ? { startTime: pulsePositionSeconds } : undefined);
    }
  };

  const goToProfile = () => {
    if (post.artist_id) {
      const a = ARTISTS.find(x => x.id === post.artist_id);
      if (a) { navigate(getArtistSlugUrl(a)); return; }
    }
    navigate(`/audience/${post.user_id}`);
  };

  const goToArtist = () => {
    const a = postArtist ?? artist;
    if (a) navigate(getArtistSlugUrl(a));
  };

  const handleShare = () => {
    if (activeSong) shareSong(activeSong.title, activeSong.artist, activeSong.id, activeSong.coverImage);
    else sharePost(post.id, post.content ?? undefined);
  };

  const handleCopyLink = () => {
    const url = activeSong
      ? getSongShareUrl({ id: activeSong.id, title: activeSong.title, artist: activeSong.artist })
      : getShareUrl('post', post.id);
    copyToClipboard(url);
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none">

      {/* Full-bleed blurred background */}
      {isWelcomePost ? (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/60 via-purple-600/40 to-pink-600/50" />
      ) : coverUrl && !imgErr ? (
        <>
          <img src={coverUrl} alt="" aria-hidden onError={handleImgError}
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" />
          <div className="absolute inset-0 bg-black/55" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-background/60 to-primary/10" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-black/40 pointer-events-none" />

      {/* Tap to play */}
      <div className="absolute inset-0 cursor-pointer" onClick={activeSong ? handlePlayPause : undefined}>
        <div className="absolute inset-0 flex items-center justify-center">

          {/* WELCOME */}
          {isWelcomePost && (
            <motion.div className="text-center px-8" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <motion.div animate={{ rotate: [0,10,-10,0] }} transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}>
                <PartyPopper className="w-24 h-24 text-yellow-400 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-1">Welcome!</h2>
              <p className="text-white/80">{post.profile?.profile_name || 'Someone new'}</p>
              <p className="text-white/50 text-sm mt-1">just joined $ongChainn</p>
            </motion.div>
          )}

          {/* PLAYLIST CREATED */}
          {isPlaylistCreatedPost && (
            <motion.div className="text-center px-8" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <div className="w-24 h-24 rounded-3xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <ListMusic className="w-12 h-12 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">New Playlist</h2>
              <p className="text-white/80">{post.playlist_name || 'A new playlist'}</p>
            </motion.div>
          )}

          {/* ROOM ENTERED */}
          {isRoomEnteredPost && (
            <motion.div className="text-center px-8" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <motion.div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4"
                animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                <Headphones className="w-12 h-12 text-primary" />
              </motion.div>
              <h2 className="text-2xl font-bold text-white mb-1">The Room</h2>
              <p className="text-white/80">Live listening session</p>
            </motion.div>
          )}

          {/* ARTIST FOLLOW — large artist pfp */}
          {isArtistFollowPost && postArtist && (
            <div className="flex flex-col items-center gap-5">
              <motion.div
                className="relative w-52 h-52 md:w-64 md:h-64 rounded-full overflow-hidden border-4 border-primary/60 shadow-2xl"
                animate={isThisSongPlaying ? { scale: [1, 1.03, 1] } : {}}
                transition={isThisSongPlaying ? { duration: 2, repeat: Infinity } : {}}
              >
                <img src={postArtist.profileImage ?? '/placeholder.svg'} alt={postArtist.name}
                  className="w-full h-full object-cover" onError={handleImgError} />
                {/* Pulsing ring */}
                <motion.div className="absolute inset-0 rounded-full border-4 border-primary/40"
                  animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity }} />
              </motion.div>
              <AnimatePresence>
                {artistSong && !isThisSongPlaying && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                    <Play className="w-7 h-7 text-white fill-white ml-1" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* SONG — spinning disc artwork */}
          {!isWelcomePost && !isArtistFollowPost && !isPlaylistCreatedPost && !isRoomEnteredPost && (
            <>
              {coverUrl && !imgErr ? (
                <motion.div
                  className={`rounded-full overflow-hidden shadow-2xl border-4 w-52 h-52 md:w-64 md:h-64 ${
                    isSongLikePost ? 'border-red-500/70' : isSongPulsePost ? 'border-primary/70' : isSongCommentPost ? 'border-sky-400/70' : 'border-white/20'
                  }`}
                  animate={isThisSongPlaying ? { rotate: 360 } : {}}
                  transition={isThisSongPlaying ? { duration: 3, repeat: Infinity, ease: 'linear' } : {}}
                >
                  <img src={coverUrl} alt={activeSong?.title ?? ''} className="w-full h-full object-cover" onError={handleImgError} />
                </motion.div>
              ) : (
                <div className="w-52 h-52 rounded-full bg-primary/20 flex items-center justify-center">
                  <Music className="w-20 h-20 text-primary/60" />
                </div>
              )}

              {isSongLikePost && (
                <motion.div className="absolute top-[24%] right-[calc(50%-110px)] bg-red-500 rounded-full p-2.5 shadow-lg"
                  animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                  <Heart className="w-6 h-6 text-white fill-white" />
                </motion.div>
              )}
              {isSongPulsePost && (
                <motion.div className="absolute top-[24%] right-[calc(50%-110px)] bg-primary rounded-full p-2.5 shadow-lg"
                  animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
                  <Sparkles className="w-6 h-6 text-white" />
                </motion.div>
              )}
              {isSongCommentPost && (
                <motion.div className="absolute top-[24%] right-[calc(50%-110px)] bg-sky-500 rounded-full p-2.5 shadow-lg"
                  animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                  <MessageCircle className="w-6 h-6 text-white" />
                </motion.div>
              )}

              {activeSong && (
                <AnimatePresence>
                  {!isThisSongPlaying ? (
                    <motion.div key="play" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
                      className="absolute bottom-[42%] left-1/2 -translate-x-1/2 pointer-events-none">
                      <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                        <Play className="w-8 h-8 text-white fill-white ml-1" />
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="pause" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute bottom-[42%] left-1/2 -translate-x-1/2 pointer-events-none">
                      <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center">
                        <Pause className="w-8 h-8 text-white fill-white" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right action bar */}
      <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5 z-10">
        <div className="relative mb-1">
          <button onClick={goToProfile}>
            <Avatar className="w-11 h-11 border-2 border-white shadow-lg">
              <AvatarImage src={isArtistFollowPost && postArtist ? postArtist.profileImage ?? '' : post.profile?.profile_picture_url ?? ''} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {(isArtistFollowPost ? postArtist?.name : post.profile?.profile_name)?.charAt(0) ?? '?'}
              </AvatarFallback>
            </Avatar>
          </button>
          {!isOwnPost && (
            <button onClick={(e) => { e.stopPropagation(); onFollow(post.user_id); }}
              className={`absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-lg transition-colors ${isFollowing ? 'bg-white/30' : 'bg-primary'}`}>
              {isFollowing ? <Check className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
            </button>
          )}
        </div>

        <button className="flex flex-col items-center gap-1" onClick={(e) => { e.stopPropagation(); onLike(post.id); }}>
          <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${post.is_liked ? 'bg-red-500/30' : 'bg-white/10 backdrop-blur-sm'}`}>
            <Heart className={`w-6 h-6 ${post.is_liked ? 'text-red-400 fill-red-400' : 'text-white'}`} />
          </div>
          <span className="text-[11px] text-white/90 font-medium">{post.likes_count || 0}</span>
        </button>

        <button className="flex flex-col items-center gap-1" onClick={(e) => { e.stopPropagation(); onComment(); }}>
          <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-[11px] text-white/90 font-medium">{post.comments_count || 0}</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex flex-col items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <Share2 className="w-6 h-6 text-white" />
              </div>
              <span className="text-[11px] text-white/90 font-medium">Share</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={handleShare} className="gap-2"><Share2 className="w-4 h-4" />Share</DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyLink} className="gap-2">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              Copy link
            </DropdownMenuItem>
            {activeSong && (
              <DropdownMenuItem onClick={() => navigate(`/song/${activeSong.id}`)} className="gap-2">
                <Music className="w-4 h-4" />View song
              </DropdownMenuItem>
            )}
            {(postArtist ?? artist) && (
              <DropdownMenuItem onClick={goToArtist} className="gap-2">
                <UserCheck className="w-4 h-4" />View artist
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <motion.div
          animate={isThisSongPlaying ? { rotate: 360 } : {}}
          transition={isThisSongPlaying ? { duration: 3, repeat: Infinity, ease: 'linear' } : {}}
          className="w-11 h-11 rounded-full border-2 border-white/40 overflow-hidden shadow-lg"
        >
          {coverUrl && !imgErr ? (
            <img src={coverUrl} alt="" className="w-full h-full object-cover" onError={handleImgError} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center">
              <Disc3 className="w-5 h-5 text-white" />
            </div>
          )}
        </motion.div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-16 p-4 z-10">
        <button onClick={goToProfile} className="flex items-center gap-2 mb-2">
          <span className="font-bold text-white text-base truncate max-w-[220px]">
            @{post.profile?.profile_name || 'Anonymous'}
          </span>
          {isFollowing && <span className="text-[10px] text-white/50 bg-white/10 px-1.5 py-0.5 rounded-full shrink-0">Following</span>}
        </button>

        {isWelcomePost && (
          <p className="text-white/90 text-sm flex items-center gap-1.5 mb-2">
            <Sparkles className="w-4 h-4 text-yellow-400 shrink-0" />Welcome to the community! Say hello 👋
          </p>
        )}
        {isArtistFollowPost && postArtist && (
          <div className="mb-2">
            <p className="text-white/90 text-sm flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
              started following <span className="font-semibold ml-1">{postArtist.name}</span>
            </p>
            {artistSong && (
              <button onClick={goToArtist}
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20 transition-colors">
                <img src={postArtist.profileImage ?? ''} className="w-4 h-4 rounded-full object-cover" alt="" onError={(e)=>{e.currentTarget.style.display='none'}} />
                {postArtist.name} · {postArtist.location}
              </button>
            )}
          </div>
        )}
        {isSongLikePost && song && (
          <p className="text-white/90 text-sm flex items-center gap-1.5 mb-2">
            <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400 shrink-0" />
            likes {artist?.name} - {song.title}
          </p>
        )}
        {isSongPulsePost && song && (
          <p className="text-white/90 text-sm flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            just pulsed {song.title}{pulsePositionSeconds !== null ? ` at ${formatPulseTime(pulsePositionSeconds)}` : ''}
          </p>
        )}
        {isPlaylistCreatedPost && (
          <p className="text-white/90 text-sm flex items-center gap-1.5 mb-2">
            <ListMusic className="w-3.5 h-3.5 text-primary shrink-0" />
            just created the {post.playlist_name || 'new'} playlist
          </p>
        )}
        {isRoomEnteredPost && (
          <div className="mb-2">
            <p className="text-white/90 text-sm flex items-center gap-1.5">
              <Headphones className="w-3.5 h-3.5 text-primary shrink-0" />
              just entered the room
            </p>
            <button onClick={(e) => { e.stopPropagation(); navigate('/room'); }}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20 transition-colors">
              <Headphones className="w-3.5 h-3.5" />
              Join the Room
            </button>
          </div>
        )}
        {isSongCommentPost && song && (
          <div className="mb-2">
            <p className="text-white/90 text-sm flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              commented on &quot;{song.title}&quot; by {artist?.name}
            </p>
            {post.content && (
              <p className="text-white/70 text-sm mt-1 line-clamp-2 italic">&quot;{post.content}&quot;</p>
            )}
          </div>
        )}
        {!isWelcomePost && !isArtistFollowPost && !isSongLikePost && !isSongPulsePost && !isSongCommentPost
          && !isPlaylistCreatedPost && !isRoomEnteredPost && post.content && (
          <p className="text-white/90 text-sm mb-2 line-clamp-2">{post.content}</p>
        )}

        {battleMatch && (
          <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/wavewarz-africa/room/${battleMatch[1]}`); }}
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-rose-300/40 bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-100">
            <Flame className="h-3.5 w-3.5" />
            Live on WaveWarz{battleMatch[2]?.trim() ? `: ${battleMatch[2].trim()}` : ''}
          </button>
        )}

        {activeSong && !isWelcomePost && (
          <div className={`flex items-center gap-2 rounded-full py-1.5 px-3 w-fit backdrop-blur-md ${
            isSongLikePost ? 'bg-red-500/20' : isSongPulsePost ? 'bg-primary/20' : isSongCommentPost ? 'bg-sky-500/20' : 'bg-white/10'
          }`}>
            {isSongLikePost ? <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400 shrink-0" />
              : isSongPulsePost ? <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              : isSongCommentPost ? <MessageCircle className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              : <Music className="w-3.5 h-3.5 text-white shrink-0" />}
            {totalPulses > 0 && <span className="text-[11px] text-white/80 tabular-nums shrink-0">❤️‍🔥 {totalPulses.toLocaleString()}</span>}
            <div className="overflow-hidden max-w-[180px]">
              <motion.p
                className="text-xs text-white font-medium whitespace-nowrap"
                animate={isThisSongPlaying ? { x: [0, -120, 0] } : {}}
                transition={isThisSongPlaying ? { duration: 6, repeat: Infinity, ease: 'linear' } : {}}
              >
                {activeSong.title} · {(isArtistFollowPost ? postArtist?.name : artist?.name) ?? activeSong.artist}
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
