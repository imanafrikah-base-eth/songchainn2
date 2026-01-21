import { memo, useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ChevronUp, Headphones } from 'lucide-react';
import { usePlayerState, usePlayerActions, usePlayerTime } from '@/context/PlayerContext';
import { useEngagement } from '@/context/EngagementContext';
import { Slider } from '@/components/ui/slider';
import { FullScreenPlayer } from './FullScreenPlayer';
import { SpinningSongArt } from './SpinningSongArt';
import { ShareSongButton } from './ShareSongButton';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';

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
  onSeek 
}: { 
  currentTime: number; 
  duration: number; 
  onSeek: (time: number) => void;
}) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  }, [duration, onSeek]);

  return (
    <div
      className="absolute top-0 left-0 right-0 h-1 bg-muted/30 cursor-pointer group"
      onClick={handleClick}
    >
      <div
        className="h-full gradient-primary relative"
        style={{ width: `${progress}%` }}
      >
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow-glow opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
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
  const { currentSong, isPlaying, isRoomMode, isRoomHidden } = usePlayerState();
  const { currentTime, duration } = usePlayerTime();
  const { togglePlay, seekTo, setVolume, playNext, playPrevious, volume, showRoom } = usePlayerActions();
  const { addPlay } = useEngagement();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const hasCountedPlay = useRef(false);
  const playStartTime = useRef<number | null>(null);
  const accumulatedPlayTime = useRef(0);
  const lastSongId = useRef<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const showReturnToRoom = isRoomMode && isRoomHidden;

  const PLAY_THRESHOLD_SECONDS = 3;

  // Record play to database and local state
  const recordPlay = useCallback(async (songId: string) => {
    if (hasCountedPlay.current) return;
    
    hasCountedPlay.current = true;
    
    // Update local engagement state
    addPlay(songId);
  }, [addPlay]);

  // Reset tracking when song changes
  useEffect(() => {
    if (currentSong?.id !== lastSongId.current) {
      hasCountedPlay.current = false;
      playStartTime.current = null;
      accumulatedPlayTime.current = 0;
      lastSongId.current = currentSong?.id || null;
    }
  }, [currentSong?.id]);

  // Track play time - count after 3 seconds of actual playback
  useEffect(() => {
    if (!currentSong || hasCountedPlay.current) return;

    if (isPlaying) {
      // Start tracking play time
      playStartTime.current = Date.now();
    } else if (playStartTime.current !== null) {
      // Pause - accumulate the time played
      const sessionTime = (Date.now() - playStartTime.current) / 1000;
      accumulatedPlayTime.current += sessionTime;
      playStartTime.current = null;
    }
  }, [isPlaying, currentSong]);

  // Check if threshold reached during playback
  useEffect(() => {
    if (!currentSong || hasCountedPlay.current || !isPlaying) return;

    const checkPlayTime = () => {
      if (playStartTime.current === null) return;
      
      const currentSessionTime = (Date.now() - playStartTime.current) / 1000;
      const totalPlayTime = accumulatedPlayTime.current + currentSessionTime;
      
      if (totalPlayTime >= PLAY_THRESHOLD_SECONDS) {
        recordPlay(currentSong.id);
      }
    };

    // Check immediately and then every 500ms
    checkPlayTime();
    const interval = setInterval(checkPlayTime, 500);
    
    return () => clearInterval(interval);
  }, [currentSong, isPlaying, recordPlay]);

  // Media Session API for background playback
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.townSquare,
        artwork: currentSong.coverImage
          ? [{ src: currentSong.coverImage, sizes: '512x512', type: 'image/jpeg' }]
          : [],
      });

      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
      navigator.mediaSession.setActionHandler('nexttrack', playNext);
    }
  }, [currentSong, togglePlay, playPrevious, playNext]);

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
    setIsFullScreen(true);
  }, []);

  const handleCloseFullScreen = useCallback(() => {
    setIsFullScreen(false);
  }, []);

  if (!currentSong) return null;

  return (
    <>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-0 left-0 right-0 z-50"
      >
        {/* Glass background with safe area padding for mobile */}
        <div className="glass-surface border-t border-border/50 pb-safe">
          {showReturnToRoom && (
            <div className="container mx-auto px-3 sm:px-4 pt-2 pb-1 md:hidden">
              <button
                type="button"
                onClick={() => {
                  showRoom();
                  navigate('/room');
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary text-xs px-3 py-1"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>Return to Room</span>
              </button>
            </div>
          )}
          <ProgressBar currentTime={currentTime} duration={duration} onSeek={seekTo} />

          <div className="container mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              {/* Song info - clickable to expand */}
              <button
                onClick={handleOpenFullScreen}
                className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 text-left group"
              >
                <div className="relative flex-shrink-0">
                  <SpinningSongArt isPlaying={isPlaying} size="md" className="shadow-soft" />
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
                  <p className="font-medium text-foreground truncate text-sm sm:text-base group-hover:text-primary transition-colors">
                    {currentSong.title}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">{currentSong.artist}</p>
                </div>
                <ChevronUp className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              </button>

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
                  onClick={togglePlay}
                  className="p-3 sm:p-3 gradient-primary rounded-full shadow-glow press-effect"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 sm:w-5 sm:h-5 text-primary-foreground" />
                  ) : (
                    <Play className="w-5 h-5 sm:w-5 sm:h-5 text-primary-foreground ml-0.5" />
                  )}
                </motion.button>

                <button
                  onClick={playNext}
                  className="p-2 hover:bg-secondary/80 rounded-full transition-colors press-effect"
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

              {/* Time & Volume - desktop only */}
              <div className="hidden md:flex items-center gap-4 flex-1 justify-end">
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
    </>
  );
});
