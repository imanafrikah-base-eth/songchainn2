import { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ChevronUp, Headphones } from 'lucide-react';
import { usePlayerState, usePlayerActions, usePlayerTime } from '@/context/PlayerContext';
import { useEngagement } from '@/context/EngagementContext';
import { Slider } from '@/components/ui/slider';
import { FullScreenPlayer } from './FullScreenPlayer';
import { SpinningSongArt } from './SpinningSongArt';
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
  const { togglePlay, seekTo, setVolume, playNext, playPrevious, volume, showRoom } = usePlayerActions();
  const { addPlay, addOfflinePlay } = useEngagement();
  const { user } = useAuth();
  const navigate = useNavigate();
  const roomOnlineCount = useRoomOnlineCount({ roomId: 'global', viewerUserId: user?.id, isListening: isRoomMode });
  
  const hasCountedPlay = useRef(false);
  const lastSongId = useRef<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | undefined>(user?.user_metadata?.wallet_address);
  const showReturnToRoom = isRoomMode && isRoomHidden;
  const { color: artworkColor } = useArtworkColor(currentSong?.coverImage);
  const {
    status: ownershipStatus,
    offlinePlaysRemaining,
    unlockSong,
  } = useSongOwnership(currentSong?.id ?? '');

  const handleWalletConnected = useCallback((address: string) => {
    setWalletAddress(address);
  }, []);

  const PLAY_THRESHOLD_SECONDS = 3;

  const nextSong = useMemo(() => {
    if (!currentSong || !queue || queue.length <= 1) return null;
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex === -1) return null;
    const nextIndex = (currentIndex + 1) % queue.length;
    const candidate = queue[nextIndex];
    if (!candidate || candidate.id === currentSong.id) return null;
    return candidate;
  }, [currentSong, queue]);

  // Reset tracking when song changes
  useEffect(() => {
    if (currentSong?.id !== lastSongId.current) {
      hasCountedPlay.current = false;
      lastSongId.current = currentSong?.id || null;
    }
  }, [currentSong?.id]);

  // Count play when audio position reaches 3 seconds — uses actual audio time from PlayerContext,
  // not a manual wall-clock timer, so it can't be fooled by pausing/resuming or effect re-runs.
  useEffect(() => {
    if (!currentSong || hasCountedPlay.current || !isPlaying) return;
    if (currentTime >= PLAY_THRESHOLD_SECONDS) {
      hasCountedPlay.current = true;
      addPlay(currentSong.id);
      if (!navigator.onLine) {
        addOfflinePlay(currentSong.id, currentTime);
      }
    }
  }, [currentTime, currentSong, isPlaying, addPlay, addOfflinePlay]);

  // Media Session API for background playback
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.volume || '$ongChainn',
        artwork: currentSong.coverImage
          ? [{ src: currentSong.coverImage, sizes: '512x512', type: 'image/jpeg' }]
          : [],
      });

      navigator.mediaSession.setActionHandler('play', isRoomMode ? null : togglePlay);
      navigator.mediaSession.setActionHandler('pause', isRoomMode ? null : togglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', isRoomMode ? null : playPrevious);
      navigator.mediaSession.setActionHandler('nexttrack', isRoomMode ? null : playNext);
    }
  }, [currentSong, isRoomMode, togglePlay, playPrevious, playNext]);

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
        <div className="glass-surface border-t border-border/50 pb-safe lg:rounded-2xl lg:border lg:border-border/50 lg:pb-0">
          <div className="px-4 py-2.5 sm:py-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  showRoom();
                  navigate('/room');
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary text-xs px-3 py-1 font-semibold shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>Return to Room</span>
                <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] leading-none">
                  {roomOnlineCount} live
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">{currentSong.title}</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); navigate(`/artist/${currentSong.artistId}`); }}
                  className="text-[11px] text-muted-foreground truncate hover:text-primary transition-colors text-left"
                >
                  {currentSong.artist}
                </button>
              </div>
            </div>
          </div>
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
        {/* Glass background with safe area padding for mobile; docks as a floating card at lg:+ */}
        <div className="glass-surface border-t border-border/50 pb-safe lg:rounded-2xl lg:border lg:border-border/50 lg:pb-0 overflow-hidden">
          <ProgressBar currentTime={currentTime} duration={duration} onSeek={seekTo} disabled={isRoomMode} isPlaying={isPlaying} />

          <div className="px-4 py-2.5 sm:py-3">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              {/* Song info - clickable to expand */}
              <div
                role="button"
                tabIndex={0}
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
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); navigate(`/artist/${currentSong.artistId}`); }}
                    className="text-xs sm:text-sm text-muted-foreground truncate hover:text-primary transition-colors text-left"
                  >
                    {currentSong.artist}
                  </button>
                  {nextSong && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      Up Next: {nextSong.title} • {nextSong.artist}
                    </p>
                  )}
                </div>
                <ChevronUp className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              </div>

              {/* Controls - more prominent on mobile */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={isRoomMode ? undefined : playPrevious}
                  className="p-2 hover:bg-secondary/80 rounded-full transition-colors press-effect hidden sm:flex disabled:opacity-40 disabled:hover:bg-transparent"
                  disabled={isRoomMode}
                >
                  <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
                </button>

                <motion.button
                  onClick={isRoomMode ? undefined : togglePlay}
                  disabled={isRoomMode}
                  className="p-3 sm:p-3 gradient-primary-artwork rounded-full shadow-glow-artwork press-effect disabled:opacity-40"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
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
                        <Pause className="w-5 h-5 sm:w-5 sm:h-5 text-primary-foreground" />
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
                        <Play className="w-5 h-5 sm:w-5 sm:h-5 text-primary-foreground ml-0.5" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>

                <button
                  onClick={isRoomMode ? undefined : playNext}
                  disabled={isRoomMode}
                  className="p-2 hover:bg-secondary/80 rounded-full transition-colors press-effect disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
                </button>

                <ShareSongButton
                  songId={currentSong.id}
                  songTitle={currentSong.title}
                  artistName={currentSong.artist}
                  coverImage={currentSong.coverImage}
                  dropdownSide="top"
                />
              </div>

              {/* Time & Volume - shown in the md-lg range; hidden once docked as a narrow floating card at lg:+ */}
              <div className="hidden md:flex lg:hidden items-center gap-4 flex-1 justify-end">
                <TimeDisplay currentTime={currentTime} duration={duration} />

                <div className="flex items-center gap-2 w-28">
                  <button
                    onClick={handleVolumeToggle}
                    className="p-1 hover:bg-secondary/80 rounded transition-colors"
                  >
                    {volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <Slider
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
