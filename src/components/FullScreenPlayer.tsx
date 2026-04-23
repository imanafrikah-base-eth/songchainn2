import { memo, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Heart, Share2, ListMusic, Shuffle, Repeat, Repeat1, Copy, Check, MessageCircle } from 'lucide-react';
import { usePlayerState, usePlayerActions, usePlayerTime } from '@/context/PlayerContext';
import { useEngagement } from '@/context/EngagementContext';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useShare } from '@/hooks/useShare';
import { toast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOfflineAudio } from '@/hooks/useOfflineAudio';
import { getDeferredInstallPrompt, clearDeferredInstallPrompt } from '@/components/DownloadAppBanner';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface FullScreenPlayerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullScreenPlayer = memo(function FullScreenPlayer({ isOpen, onClose }: FullScreenPlayerProps) {
  const { currentSong, isPlaying, queue, isRoomMode } = usePlayerState();
  const { currentTime, duration } = usePlayerTime();
  const { togglePlay, seekTo, setVolume, playNext, playPrevious, volume, repeatMode, setRepeatMode, shuffleMode, toggleShuffle } = usePlayerActions();

  const { toggleLike, isLiked, sendPulse } = useEngagement();
  const { cacheSong, isSongCached, cachingInProgress, isOnline, isInstalled } = useOfflineAudio();
  const { copied, shareSong, copyToClipboard, shareToX, getSongShareUrl } = useShare();
  const [showQueue, setShowQueue] = useState(false);
  const [pulseRipples, setPulseRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [showPulseHint, setShowPulseHint] = useState(false);
  const [showSoftHint, setShowSoftHint] = useState(false);
  const [showPulseSent, setShowPulseSent] = useState(false);

  const pulsePointerDownRef = useRef(false);
  const pulseTimerRef = useRef<number | null>(null);
  const pulseIdRef = useRef(0);
  const lastSoftHintAtRef = useRef(0);
  const lastHintSongIdRef = useRef<string | null>(null);
  const hasShownInitialHintRef = useRef(false);
  const hasShownPulseSentRef = useRef(false);
  const pulseButtonRef = useRef<HTMLButtonElement | null>(null);

  const liked = currentSong ? isLiked(currentSong.id) : false;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isSaved = currentSong ? isSongCached(currentSong.id) : false;
  const isSaving = currentSong ? cachingInProgress === currentSong.id : false;
  const hasPlayedEnoughToSave = currentTime >= 20;

  const handleKeepThis = useCallback(async () => {
    if (!currentSong) return;
    if (!isInstalled) {
      const deferredPrompt = getDeferredInstallPrompt();
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            toast({
              title: 'Installing $ongChainn...',
              description: 'The app will appear on your home screen shortly.',
            });
          }
        } finally {
          clearDeferredInstallPrompt();
        }
      } else {
        toast({
          title: 'To keep songs on your device, add $ongChainn to your home screen.',
        });
      }
      return;
    }
    if (!hasPlayedEnoughToSave) {
      toast({
        title: 'Play this song once to save it.',
      });
      return;
    }
    if (!isOnline) {
      toast({
        title: 'Offline – not saved',
        description: 'Reconnect to save this song for offline playback.',
      });
      return;
    }
    if (isSaved || isSaving) return;
    await cacheSong(currentSong.id, currentSong.audioUrl, {
      title: currentSong.title,
      artist: currentSong.artist,
      duration,
    });
  }, [currentSong, isInstalled, hasPlayedEnoughToSave, isOnline, isSaved, isSaving, cacheSong, duration]);

  const handleNativeShare = async () => {
    if (currentSong) {
      await shareSong(currentSong.title, currentSong.artist, currentSong.id, currentSong.coverImage);
    }
  };

  const handleCopyLink = async () => {
    if (currentSong) {
      const url = getSongShareUrl({ id: currentSong.id, title: currentSong.title, artist: currentSong.artist, coverImage: currentSong.coverImage });
      await copyToClipboard(url);
    }
  };

  const handleShareToX = () => {
    if (currentSong) {
      const text = `🎵 Listening to "${currentSong.title}" by ${currentSong.artist} on @$ongChainn`;
      const url = getSongShareUrl({ id: currentSong.id, title: currentSong.title, artist: currentSong.artist, coverImage: currentSong.coverImage });
      shareToX(text, url);
    }
  };

  const handleShareToWhatsApp = () => {
    if (!currentSong) return;
    const url = getSongShareUrl({ id: currentSong.id, title: currentSong.title, artist: currentSong.artist, coverImage: currentSong.coverImage });
    const text = `Check out "${currentSong.title}" by ${currentSong.artist} on $ongChainn!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank');
  };

  const handleShareToTelegram = () => {
    if (!currentSong) return;
    const url = getSongShareUrl({ id: currentSong.id, title: currentSong.title, artist: currentSong.artist, coverImage: currentSong.coverImage });
    const text = `Check out "${currentSong.title}" by ${currentSong.artist} on $ongChainn!`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const toggleRepeat = () => {
    setRepeatMode(repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off');
  };

  const handleToggleShuffle = () => {
    toggleShuffle();
    toast({ title: !shuffleMode ? 'Shuffle on' : 'Shuffle off' });
  };

  // Media Session API for lock screen / notification controls
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
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          seekTo(details.seekTime);
        }
      });
    }
  }, [currentSong, togglePlay, playPrevious, playNext, seekTo]);

  // Update playback state
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  useEffect(() => {
    try {
      const seen = localStorage.getItem('songchainn_pulse_sent_once');
      if (seen === '1') {
        hasShownPulseSentRef.current = true;
      }
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    if (!currentSong || hasShownInitialHintRef.current) return;
    try {
      const seen = localStorage.getItem('songchainn_pulse_hint_seen');
      if (seen === '1') {
        hasShownInitialHintRef.current = true;
        return;
      }
    } catch {
      void 0;
    }
    hasShownInitialHintRef.current = true;
    setShowPulseHint(true);
    window.setTimeout(() => {
      setShowPulseHint(false);
      try {
        localStorage.setItem('songchainn_pulse_hint_seen', '1');
      } catch {
        void 0;
      }
    }, 3200);
  }, [currentSong]);

  useEffect(() => {
    if (!currentSong) {
      setShowSoftHint(false);
      return;
    }
    const now = Date.now();
    const songId = currentSong.id;
    if (lastHintSongIdRef.current !== songId) {
      lastHintSongIdRef.current = songId;
      lastSoftHintAtRef.current = 0;
    }
    if (!isPlaying || !duration || duration <= 0) return;
    const fraction = duration > 0 ? currentTime / duration : 0;
    if (fraction > 0.25 && fraction < 0.35 && now - lastSoftHintAtRef.current > 90_000) {
      lastSoftHintAtRef.current = now;
      setShowSoftHint(true);
      window.setTimeout(() => setShowSoftHint(false), 2200);
    }
  }, [currentSong, currentTime, duration, isPlaying]);

  const handlePulseTrigger = useCallback((clientX: number, clientY: number) => {
    if (!currentSong || !isPlaying) return;
    const id = pulseIdRef.current++;
    setPulseRipples(prev => [...prev, { id, x: clientX, y: clientY }]);
    window.setTimeout(() => {
      setPulseRipples(prev => prev.filter(r => r.id !== id));
    }, 600);
    sendPulse(currentSong.id);
    if (!hasShownPulseSentRef.current) {
      hasShownPulseSentRef.current = true;
      setShowPulseSent(true);
      window.setTimeout(() => setShowPulseSent(false), 2200);
      try {
        localStorage.setItem('songchainn_pulse_sent_once', '1');
      } catch {
        void 0;
      }
    }
  }, [currentSong, isPlaying, sendPulse]);

  const handlePulseButtonClick = useCallback(() => {
    const node = pulseButtonRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    handlePulseTrigger(x, y);
  }, [handlePulseTrigger]);

  const handlePulsePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!currentSong || !isPlaying) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, input, textarea, a, [data-no-pulse]')) return;
    pulsePointerDownRef.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    if (pulseTimerRef.current) {
      window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = null;
    }
    pulseTimerRef.current = window.setTimeout(() => {
      if (!pulsePointerDownRef.current) return;
      handlePulseTrigger(startX, startY);
    }, 1000);
  }, [currentSong, isPlaying, handlePulseTrigger]);

  const clearPulsePointer = useCallback(() => {
    pulsePointerDownRef.current = false;
    if (pulseTimerRef.current) {
      window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = null;
    }
  }, []);

  // Subscribe to incoming pulses from other users and show ripple animations
  useEffect(() => {
    if (!isOpen || !currentSong) return;
    const channel = supabase
      .channel('pulse-global')
      .on('broadcast', { event: 'pulse' }, (msg) => {
        const { songId: pulseSongId } = (msg.payload ?? {}) as { songId?: string };
        if (!pulseSongId || pulseSongId !== currentSong.id) return;
        const id = pulseIdRef.current++;
        const x = Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400);
        const y = Math.random() * (typeof window !== 'undefined' ? window.innerHeight * 0.6 : 300);
        setPulseRipples(prev => [...prev, { id, x, y }]);
        window.setTimeout(() => {
          setPulseRipples(prev => prev.filter(r => r.id !== id));
        }, 600);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isOpen, currentSong]);

  if (!currentSong) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-0 z-[100] bg-background"
        >
          {/* Animated background blur based on cover */}
          <div className="absolute inset-0 overflow-hidden">
            {currentSong.coverImage && (
              <>
                <motion.img
                  key={currentSong.id}
                  src={currentSong.coverImage}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ filter: 'blur(100px) saturate(1.5)', opacity: 0.3 }}
                  initial={{ scale: 1.1, opacity: 0 }}
                  animate={{ scale: 1, opacity: 0.3 }}
                  transition={{ duration: 1 }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
              </>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          </div>

          {/* Content */}
          <div
            className="relative h-full flex flex-col"
            onPointerDown={handlePulsePointerDown}
            onPointerUp={clearPulsePointer}
            onPointerCancel={clearPulsePointer}
            onPointerLeave={clearPulsePointer}
          >
            {/* Header */}
            <motion.header
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center justify-between p-4 safe-top gap-3"
            >
              <button
                onClick={onClose}
                className="p-2 rounded-full glass hover:bg-secondary/50 transition-colors press-effect"
              >
                <X className="w-6 h-6 text-foreground" />
              </button>
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Now Playing</p>
                  <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                    {currentSong.townSquare}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isSaved && (
                  <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                    On device
                  </span>
                )}
                <motion.button
                  ref={pulseButtonRef}
                  type="button"
                  onClick={handlePulseButtonClick}
                  className="relative w-8 h-8 rounded-full bg-primary/10 border border-primary/40 flex items-center justify-center shadow-glow-intense"
                  animate={{ scale: [1, 1.08, 1], boxShadow: ['0 0 0 0 rgba(56,189,248,0.0)', '0 0 18px 4px rgba(56,189,248,0.5)', '0 0 0 0 rgba(56,189,248,0.0)'] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <span className="w-3 h-3 rounded-full bg-primary" />
                </motion.button>
                <button
                  onClick={() => setShowQueue(!showQueue)}
                  className={cn(
                    "p-2 rounded-full glass transition-colors press-effect",
                    showQueue ? "bg-primary/20 text-primary" : "hover:bg-secondary/50"
                  )}
                >
                  <ListMusic className="w-6 h-6" />
                </button>
              </div>
            </motion.header>

            {/* Main content */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 pb-8 overflow-hidden relative">
              {/* Album Art */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 20, stiffness: 200, delay: 0.1 }}
                className="relative w-full max-w-[320px] aspect-square mb-8"
              >
                <div className="absolute inset-0 rounded-3xl shadow-glow-intense opacity-60" />
                <div className="relative w-full h-full rounded-3xl overflow-hidden glass-card shine-overlay">
                  {currentSong.coverImage ? (
                    <img
                      src={currentSong.coverImage}
                      alt={currentSong.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/40 to-primary/10" />
                  )}
                </div>

                {/* Vinyl ring effect (optional decorative) */}
                <div className="absolute inset-0 rounded-3xl border border-foreground/5 pointer-events-none" />
              </motion.div>

              {/* Song Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="w-full max-w-[320px] text-center mb-6"
              >
                <h2 className="font-heading text-2xl font-bold text-foreground mb-1 truncate">
                  {currentSong.title}
                </h2>
                <p className="text-lg text-muted-foreground truncate">{currentSong.artist}</p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    onClick={handleKeepThis}
                    disabled={isSaved || isSaving}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-medium border transition-colors",
                      isSaved
                        ? "border-primary/30 bg-primary/10 text-primary cursor-default"
                        : "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    {isSaved ? 'Saved' : isSaving ? 'Saving…' : 'Keep this'}
                  </button>
                  {!hasPlayedEnoughToSave && (
                    <span className="text-[11px] text-muted-foreground">
                      Play this song once to save it.
                    </span>
                  )}
                </div>
              </motion.div>

              {/* Progress Bar */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="w-full max-w-[320px] mb-6"
              >
                <Slider
                  value={[progress]}
                  onValueChange={([v]) => seekTo((v / 100) * duration)}
                  max={100}
                  step={0.1}
                  className="mb-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </motion.div>

              {/* Controls */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="flex items-center justify-center gap-6 mb-8"
              >
                <button
                  onClick={handleToggleShuffle}
                  className={cn(
                    "p-2 transition-colors press-effect",
                    shuffleMode ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Shuffle className="w-5 h-5" />
                </button>

                <button
                  onClick={isRoomMode ? undefined : playPrevious}
                  disabled={isRoomMode}
                  className="p-3 rounded-full glass hover:bg-secondary/50 transition-all hover-scale press-effect disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <SkipBack className="w-6 h-6 text-foreground" />
                </button>

                <motion.button
                  onClick={togglePlay}
                  className="p-5 gradient-primary rounded-full shadow-glow-intense press-effect"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8 text-primary-foreground" />
                  ) : (
                    <Play className="w-8 h-8 text-primary-foreground ml-1" />
                  )}
                </motion.button>

                <button
                  onClick={isRoomMode ? undefined : playNext}
                  disabled={isRoomMode}
                  className="p-3 rounded-full glass hover:bg-secondary/50 transition-all hover-scale press-effect disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <SkipForward className="w-6 h-6 text-foreground" />
                </button>

                <button 
                  onClick={toggleRepeat}
                  className={cn(
                    "p-2 transition-colors press-effect",
                    repeatMode !== 'off' ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 className="w-5 h-5" />
                  ) : (
                    <Repeat className="w-5 h-5" />
                  )}
                </button>
              </motion.div>

              {/* Secondary Controls */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex items-center justify-center gap-8 w-full max-w-[320px]"
              >
                <button
                  onClick={() => toggleLike(currentSong.id)}
                  className={cn(
                    "p-3 rounded-full glass transition-all press-effect",
                    liked ? "bg-primary/20 text-primary" : "hover:bg-secondary/50 text-muted-foreground"
                  )}
                >
                  <Heart className={cn("w-5 h-5", liked && "fill-current")} />
                </button>

                {/* Volume */}
                <div className="flex items-center gap-2 flex-1 max-w-[140px]">
                  <button
                    onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {volume === 0 ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                  <Slider
                    value={[volume * 100]}
                    onValueChange={([v]) => setVolume(v / 100)}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-3 rounded-full glass hover:bg-secondary/50 transition-all press-effect text-muted-foreground">
                      <Share2 className="w-5 h-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={handleNativeShare} className="gap-2">
                      <Share2 className="w-4 h-4" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyLink} className="gap-2">
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      Copy Link
                    </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShareToX} className="gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    Share on X
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShareToWhatsApp} className="gap-2">
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShareToTelegram} className="gap-2">
                    <Share2 className="w-4 h-4" />
                    Telegram
                  </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.div>
              <div className="mt-6 w-full max-w-[320px] text-xs text-muted-foreground text-center">
                {queue.length > 1 && (
                  (() => {
                    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
                    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % queue.length : 0;
                    const nextSong = queue[nextIndex];
                    if (!nextSong || nextSong.id === currentSong.id) return null;
                    return (
                      <div>
                        <span className="uppercase tracking-wide text-[10px] text-muted-foreground/80">
                          Up Next
                        </span>
                        <div className="mt-1 text-foreground text-sm truncate">
                          {nextSong.title} <span className="text-muted-foreground">• {nextSong.artist}</span>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              {pulseRipples.map(ripple => (
                <motion.div
                  key={ripple.id}
                  className="pointer-events-none fixed inset-0 z-[1]"
                  initial={{ opacity: 0.4, scale: 0 }}
                  animate={{ opacity: 0, scale: 2 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{
                    left: 0,
                    top: 0,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: ripple.x - 80,
                      top: ripple.y - 80,
                      width: 160,
                      height: 160,
                      borderRadius: '9999px',
                      background:
                        'radial-gradient(circle, rgba(56,189,248,0.35) 0%, rgba(56,189,248,0.0) 70%)',
                      pointerEvents: 'none',
                    }}
                  />
                </motion.div>
              ))}

              <div className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-1 z-[2]">
                {showPulseHint && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.3 }}
                    className="px-3 py-1.5 rounded-full bg-background/80 text-[11px] text-muted-foreground border border-primary/20"
                  >
                    Feeling this part? Send a Pulse.
                  </motion.div>
                )}
                {showSoftHint && !showPulseHint && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.3 }}
                    className="px-3 py-1.5 rounded-full bg-background/80 text-[11px] text-muted-foreground border border-primary/20"
                  >
                    Send a Pulse
                  </motion.div>
                )}
                {showPulseSent && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.3 }}
                    className="px-3 py-1.5 rounded-full bg-background/90 text-[11px] text-foreground border border-primary/40"
                  >
                    Pulse sent. Others feel this too.
                  </motion.div>
                )}
              </div>
            </div>

            {/* Queue Panel (slide in from right) */}
            <AnimatePresence>
              {showQueue && (
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  className="absolute right-0 top-0 bottom-0 w-full max-w-sm glass-surface border-l border-border z-10"
                >
                  <div className="h-full flex flex-col">
                    <div className="flex items-center justify-between p-4 border-b border-border">
                      <h3 className="font-heading font-semibold text-foreground">Up Next</h3>
                      <button
                        onClick={() => setShowQueue(false)}
                        className="p-2 rounded-full hover:bg-secondary/50 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin">
                      {queue.map((song, index) => (
                        <motion.div
                          key={song.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer",
                            currentSong.id === song.id
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-secondary/50"
                          )}
                        >
                          <div className="w-10 h-10 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                            {song.coverImage ? (
                              <img
                                src={song.coverImage}
                                alt={song.title}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <div className="w-full h-full gradient-primary opacity-60" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                "font-medium text-sm truncate",
                                currentSong.id === song.id ? "text-primary" : "text-foreground"
                              )}
                            >
                              {song.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
