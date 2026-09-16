import { artistPath } from '@/lib/slugRoutes';
import { memo, useEffect, useRef, useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import { ArtistName } from '@/components/ArtistName';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ChevronDown, ChevronUp, Headphones, X } from 'lucide-react';
import { usePlayerState, usePlayerActions, usePlayerTime } from '@/context/PlayerContext';
import { Slider } from '@/components/ui/slider';
import { FullScreenPlayer } from './FullScreenPlayer';
import { SpinningSongArt } from './SpinningSongArt';
import { thumb } from '@/lib/img';
import { ShareSongButton } from './ShareSongButton';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useRoomOnlineCount } from '@/hooks/useRoomOnlineCount';
import { useArtworkColor } from '@/hooks/useArtworkColor';
import { useSongOwnership } from '@/hooks/useSongOwnership';
import { OwnershipBadge } from '@/components/OwnershipBadge';
import { UnlockSongModal } from '@/components/UnlockSongModal';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Hide the player: it folds down to a small round button in the corner with
 * the cover and play or pause, and the music keeps going. Every page mounts
 * its own AudioPlayer, so the choice lives here, outside any one of them, and
 * stays as the person moves around the app.
 */
let playerHidden = false;
const hiddenListeners = new Set<() => void>();
function setPlayerHidden(value: boolean) {
  playerHidden = value;
  hiddenListeners.forEach((listener) => listener());
}
function subscribePlayerHidden(listener: () => void) {
  hiddenListeners.add(listener);
  return () => {
    hiddenListeners.delete(listener);
  };
}
const getPlayerHidden = () => playerHidden;

/** Every icon button in the bar is this size; play and pause is the one solid control. */
const ICON_BTN =
  'flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary/70 active:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent sm:h-11 sm:w-11';

// Memoized progress bar component - only re-renders on time changes
const ProgressBar = memo(function ProgressBar({
  currentTime,
  duration,
  onSeek,
  disabled = false,
  isPlaying = false,
}: {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
  isPlaying?: boolean;
}) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  }, [duration, onSeek]);

  return (
    <div
      className={`absolute top-0 left-0 right-0 h-1 bg-muted/30 group ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={disabled ? undefined : handleClick}
    >
      <motion.div
        className="h-full gradient-primary-artwork relative"
        style={{ width: `${progress}%` }}
        animate={isPlaying ? {
          boxShadow: [
            '0 0 0px hsl(var(--primary) / 0)',
            '0 0 8px hsl(var(--primary) / 0.6)',
            '0 0 0px hsl(var(--primary) / 0)',
          ],
        } : { boxShadow: '0 0 0px hsl(var(--primary) / 0)' }}
        transition={isPlaying ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      >
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow-glow-artwork opacity-0 group-hover:opacity-100 transition-opacity" />
      </motion.div>
    </div>
  );
});

// Memoized time display
const TimeDisplay = memo(function TimeDisplay({ 
  currentTime, 
  duration 
}: { 
  currentTime: number; 
  duration: number;
}) {
  return (
    <span className="text-xs text-muted-foreground w-20 text-right tabular-nums">
      {formatTime(currentTime)} / {formatTime(duration)}
    </span>
  );
});

export const AudioPlayer = memo(function AudioPlayer() {
  const { currentSong, isPlaying, isRoomMode, isRoomHidden, queue } = usePlayerState();
  const { currentTime, duration } = usePlayerTime();
  const { togglePlay, seekTo, setVolume, playNext, playPrevious, volume, showRoom, stop } = usePlayerActions();
  // What comes after this one, for the small line under the title.
  const nextUp = (() => {
    if (!currentSong || queue.length < 2) return null;
    const i = queue.findIndex((q) => q.id === currentSong.id);
    return i >= 0 ? queue[(i + 1) % queue.length] : queue[0];
  })();
  const { user } = useAuth();
  const navigate = useNavigate();
  const roomOnlineCount = useRoomOnlineCount({ roomId: 'global', viewerUserId: user?.id, isListening: isRoomMode });
  
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | undefined>(user?.user_metadata?.wallet_address);
  const showReturnToRoom = isRoomMode && isRoomHidden;
  const isHidden = useSyncExternalStore(subscribePlayerHidden, getPlayerHidden, getPlayerHidden);
  const { color: artworkColor } = useArtworkColor(currentSong?.coverImage);
  const {
    status: ownershipStatus,
    offlinePlaysRemaining,
    unlockSong,
  } = useSongOwnership(currentSong?.id ?? '');

  const handleWalletConnected = useCallback((address: string) => {
    setWalletAddress(address);
  }, []);

  const nextSong = useMemo(() => {
    if (!currentSong || !queue || queue.length <= 1) return null;
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex === -1) return null;
    const nextIndex = (currentIndex + 1) % queue.length;
    const candidate = queue[nextIndex];
    if (!candidate || candidate.id === currentSong.id) return null;
    return candidate;
  }, [currentSong, queue]);

  // Counting a listen is not this bar's job any more. It lives beside the
  // player itself (StreamCounter in EngagementContext), because this bar is
  // only drawn on some pages: the Room and the feed never draw it, and a
  // listen there used to count nothing at all.

  // Media Session API for background playback
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.volume || '$ongChainn',
        // Android fetches this for the lock screen and notification on every
        // song change. It was the full-size cover; a 384 px copy is plenty.
        // No `type`: the resized copy is WebP, not JPEG.
        artwork: currentSong.coverImage
          ? [{ src: thumb(currentSong.coverImage, 192) ?? currentSong.coverImage, sizes: '384x384' }]
          : [],
      });

      navigator.mediaSession.setActionHandler('play', isRoomMode ? null : togglePlay);
      navigator.mediaSession.setActionHandler('pause', isRoomMode ? null : togglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', isRoomMode ? null : playPrevious);
      navigator.mediaSession.setActionHandler('nexttrack', isRoomMode ? null : playNext);
      try {
        navigator.mediaSession.setActionHandler(
          'seekto',
          isRoomMode
            ? null
            : (details) => {
                if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) {
                  seekTo(details.seekTime);
                }
              },
        );
      } catch {
        // Older browsers throw on unknown actions.
      }
    }
  }, [currentSong, isRoomMode, togglePlay, playPrevious, playNext, seekTo]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  const handleVolumeToggle = useCallback(() => {
    setVolume(volume === 0 ? 0.8 : 0);
  }, [volume, setVolume]);

  const handleVolumeChange = useCallback(([v]: number[]) => {
    setVolume(v / 100);
  }, [setVolume]);

  const handleOpenFullScreen = useCallback(() => {
    if (isRoomMode) return;
    setIsFullScreen(true);
  }, [isRoomMode]);

  const handleCloseFullScreen = useCallback(() => {
    setIsFullScreen(false);
  }, []);

  useEffect(() => {
    if (isRoomMode) {
      setIsFullScreen(false);
    }
  }, [isRoomMode]);

  if (!currentSong) return null;

  if (showReturnToRoom) {
    return (
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-0 left-0 right-0 z-50 lg:left-auto lg:right-6 lg:bottom-6 lg:w-full lg:max-w-sm"
      >
        {/* The Room keeps playing while you look around. This bar is the way
            back: what is on, how many are in there, one clear button. */}
        <div className="glass-surface border-t border-border/50 pb-safe lg:rounded-2xl lg:border lg:border-border/50 lg:pb-0">
          <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <div className="relative h-11 w-11 shrink-0">
              {currentSong.coverImage ? (
                <img src={thumb(currentSong.coverImage, 96) ?? currentSong.coverImage} alt="" className="h-11 w-11 rounded-lg object-cover" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Headphones className="h-5 w-5" />
                </span>
              )}
              <span className="absolute -right-1 -top-1 flex h-3 w-3" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
                <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-background bg-red-500" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-500">
                <span>Live in the Room</span>
                <span className="font-medium normal-case tracking-normal text-muted-foreground tabular-nums">
                  · {roomOnlineCount} listening
                </span>
              </p>
              <p className="truncate text-sm font-semibold text-foreground">{currentSong.title}</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate(artistPath(currentSong.artistId)); }}
                className="block max-w-full truncate text-left text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                <ArtistName name={currentSong.artist} artistId={currentSong.artistId} size={12} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                showRoom();
                navigate('/room');
              }}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              <Headphones className="h-4 w-4" />
              Rejoin
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (isHidden) {
    return (
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed right-3 z-50 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] lg:bottom-6 lg:right-6"
      >
        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card p-1 shadow-soft">
          <button
            type="button"
            onClick={() => setPlayerHidden(false)}
            aria-label="Show the player"
            className="flex h-11 items-center gap-2 rounded-full pl-1 pr-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary/60"
          >
            {currentSong.coverImage ? (
              <img src={thumb(currentSong.coverImage, 96) ?? currentSong.coverImage} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="h-9 w-9 rounded-full bg-secondary" aria-hidden />
            )}
            <ChevronUp className="h-4 w-4" />
            <span>Show</span>
          </button>
          {!isRoomMode && (
            <button
              type="button"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={togglePlay}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background"
            >
              {isPlaying ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />}
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-0 left-0 right-0 z-50 lg:left-auto lg:right-6 lg:bottom-6 lg:w-full lg:max-w-sm"
        style={artworkColor ? ({ '--artwork-glow': artworkColor } as React.CSSProperties) : undefined}
      >
        {/* A labelled tab on the top edge folds the player away. */}
        <button
          type="button"
          onClick={() => setPlayerHidden(true)}
          aria-label="Hide the player"
          title="Hide the player. The music keeps playing."
          className="absolute -top-8 right-4 z-10 inline-flex h-8 items-center gap-1 rounded-t-xl border border-b-0 border-border/50 bg-card px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          <span>Hide</span>
        </button>
        {/* Glass background with safe area padding for mobile; docks as a floating card at lg:+ */}
        <div className="glass-surface border-t border-border/50 pb-safe lg:rounded-2xl lg:border lg:border-border/50 lg:pb-0 overflow-hidden">
          <ProgressBar currentTime={currentTime} duration={duration} onSeek={seekTo} disabled={isRoomMode} isPlaying={isPlaying} />

          <div className="px-4 py-2.5 sm:py-3">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              {/* Song info - clickable to expand */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Open full screen player"
                onClick={handleOpenFullScreen}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenFullScreen(); } }}
                className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 text-left group cursor-pointer"
              >
                <div className="relative flex-shrink-0">
                  <SpinningSongArt isPlaying={isPlaying} size="md" className="shadow-soft" coverImage={currentSong.coverImage} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] px-1.5 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span>Now Playing</span>
                    </span>
                    {isRoomMode && (
                      <span className="text-[10px] text-muted-foreground">
                        The Room
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-foreground truncate text-sm sm:text-base group-hover:text-primary transition-colors">
                      {currentSong.title}
                    </p>
                    {currentSong.isTokenGated && (ownershipStatus === 'owned' || ownershipStatus === 'offline_ready') && (
                      <OwnershipBadge status={ownershipStatus} offlinePlays={offlinePlaysRemaining} size="sm" className="flex-shrink-0" />
                    )}
                    {currentSong.isTokenGated && (ownershipStatus === 'preview' || ownershipStatus === 'preview_used') && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowUnlockModal(true); }}
                        className="text-[10px] font-medium text-primary underline underline-offset-2 hover:text-primary/80 transition-colors flex-shrink-0"
                      >
                        Unlock
                      </button>
                    )}
                  </div>
                  {nextUp && !isRoomMode && (
                    <p className="truncate text-[11px] text-muted-foreground">Up next: {nextUp.title}</p>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); navigate(artistPath(currentSong.artistId)); }}
                    className="text-xs sm:text-sm text-muted-foreground truncate hover:text-primary transition-colors text-left"
                  >
                    <ArtistName name={currentSong.artist} artistId={currentSong.artistId} size={12} />
                  </button>
                  {nextSong && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      Up Next: {nextSong.title} • <ArtistName name={nextSong.artist} artistId={nextSong.artistId} size={10} />
                    </p>
                  )}
                </div>
                <ChevronUp className="hidden w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0 sm:block" />
              </div>

              {/* Controls. Same size for every icon button; play and pause is the one solid control. */}
              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                {isRoomMode ? (
                  <span className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border/60 px-3 text-xs font-medium text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                    Live
                  </span>
                ) : (
                  <>
                    <button type="button" aria-label="Previous track" title="Previous" onClick={playPrevious} className={ICON_BTN}>
                      <SkipBack className="h-[18px] w-[18px]" fill="currentColor" />
                    </button>

                    <motion.button
                      type="button"
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      aria-pressed={isPlaying}
                      title={isPlaying ? 'Pause' : 'Play'}
                      onClick={togglePlay}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background press-effect sm:h-12 sm:w-12"
                      whileTap={{ scale: 0.92 }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {isPlaying ? (
                          <motion.span
                            key="pause"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="block"
                          >
                            <Pause className="h-5 w-5" fill="currentColor" />
                          </motion.span>
                        ) : (
                          <motion.span
                            key="play"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="block"
                          >
                            <Play className="h-5 w-5 translate-x-[1px]" fill="currentColor" />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>

                    <button type="button" aria-label="Next track" title="Next" onClick={playNext} className={ICON_BTN}>
                      <SkipForward className="h-[18px] w-[18px]" fill="currentColor" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  aria-label="Close the player"
                  title="Close the player and stop the music"
                  onClick={(e) => { e.stopPropagation(); stop(); }}
                  className={`${ICON_BTN} text-muted-foreground hover:text-foreground`}
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="hidden sm:block">
                  <ShareSongButton
                    songId={currentSong.id}
                    songTitle={currentSong.title}
                    artistName={currentSong.artist}
                    coverImage={currentSong.coverImage}
                    dropdownSide="top"
                  />
                </div>
              </div>

              {/* Time & Volume - shown in the md-lg range; hidden once docked as a narrow floating card at lg:+ */}
              <div className="hidden md:flex lg:hidden items-center gap-4 flex-1 justify-end">
                <TimeDisplay currentTime={currentTime} duration={duration} />

                <div className="flex items-center gap-2 w-28">
                  <button
                    type="button"
                    aria-label={volume === 0 ? 'Unmute' : 'Mute'}
                    aria-pressed={volume === 0}
                    onClick={handleVolumeToggle}
                    className="p-1 hover:bg-secondary/80 rounded transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
                  >
                    {volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <Slider
                    aria-label="Volume"
                    value={[volume * 100]}
                    onValueChange={handleVolumeChange}
                    max={100}
                    step={1}
                    className="w-20"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Full Screen Player */}
      <FullScreenPlayer isOpen={isFullScreen} onClose={handleCloseFullScreen} />

      {showUnlockModal && (
        <UnlockSongModal
          song={currentSong}
          isOpen={showUnlockModal}
          onClose={() => setShowUnlockModal(false)}
          onUnlock={unlockSong}
          walletAddress={walletAddress}
          onWalletConnected={handleWalletConnected}
        />
      )}
    </>
  );
});
