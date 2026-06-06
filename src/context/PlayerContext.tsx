import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode, useMemo } from 'react';
import { Song, SONGS, ARTISTS, CATALOGS } from '@/data/musicData';
import { supabase } from '@/integrations/supabase/client';
import { syncPublicSongsInBackground } from '@/lib/publicSongsSync';

// Split context for better performance - components only re-render for what they need
interface PlayerStateContext {
  currentSong: Song | null;
  isPlaying: boolean;
  queue: Song[];
  isRoomMode: boolean;
  isRoomHidden: boolean;
}

interface PlayerTimeContext {
  currentTime: number;
  duration: number;
}

interface PlayerActionsContext {
  playSong: (song: Song, options?: { userAddress?: string; hasOwnership?: boolean; force?: boolean }) => void;
  togglePlay: () => void;
  pause: () => void;
  play: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  addToQueue: (song: Song) => void;
  playQueue: (songs: Song[], options?: { startIndex?: number }) => void;
  volume: number;
  repeatMode: 'off' | 'all' | 'one';
  setRepeatMode: (mode: 'off' | 'all' | 'one') => void;
  shuffleMode: boolean;
  toggleShuffle: () => void;
  enterRoomMode: (playlist: Song[], options?: { startIndex?: number; startTime?: number }) => Promise<boolean>;
  exitRoomMode: () => Promise<void>;
  hideRoom: () => void;
  showRoom: () => void;
}

const PlayerStateCtx = createContext<PlayerStateContext | undefined>(undefined);
const PlayerTimeCtx = createContext<PlayerTimeContext | undefined>(undefined);
const PlayerActionsCtx = createContext<PlayerActionsContext | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [queue, setQueue] = useState<Song[]>(SONGS);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const [audioVersion, setAudioVersion] = useState(0);
  const [isRoomMode, setIsRoomMode] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [shuffleMode, setShuffleMode] = useState(false);
  const [isRoomHidden, setIsRoomHidden] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('room_hidden') === 'true';
    } catch {
      return false;
    }
  });
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const playNextRef = useRef<() => void>(() => {});
  const crossfadeTriggeredRef = useRef(false);
  const isCrossfadingRef = useRef(false);
  const volumeRef = useRef(0.8);
  const queueRef = useRef<Song[]>(SONGS);
  const currentSongRef = useRef<Song | null>(null);
  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const isRoomModeRef = useRef(false);
  const recoverInFlightRef = useRef(false);
  const recoverAttemptsRef = useRef(0);
  const lastRecoverAtRef = useRef(0);
  const stallTimerRef = useRef<number | null>(null);
  const roomRestoreRef = useRef<{
    queue: Song[];
    currentSong: Song | null;
    isPlaying: boolean;
    currentTime: number;
  } | null>(null);
  const crossfadeDuration = 2600;
  const crossfadeThreshold = 2.6;

  // Initialize audio elements - runs once on mount
  useEffect(() => {
    const current = new Audio();
    current.preload = 'auto';
    current.volume = volumeRef.current;

    const next = new Audio();
    next.preload = 'auto';
    next.volume = 0;

    audioRef.current = current;
    nextAudioRef.current = next;
    setAudioVersion(v => v + 1);

    return () => {
      current.pause();
      current.src = '';
      next.pause();
      next.src = '';
      audioRef.current = null;
      nextAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    volumeRef.current = volume;
    const current = audioRef.current;
    if (!current) return;
    if (!isCrossfading) current.volume = volume;
  }, [volume, isCrossfading, audioVersion]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    isRoomModeRef.current = isRoomMode;
  }, [isRoomMode]);

  const bootstrapSongSources = useMemo(() => {
    const byId = new Map<string, Song>();
    for (const song of SONGS) {
      byId.set(song.id, song);
    }
    for (const catalog of CATALOGS) {
      for (const songId of catalog.songIds) {
        const song = byId.get(songId);
        if (song) byId.set(song.id, song);
      }
    }
    return Array.from(byId.values());
  }, []);

  // Background sync of all current app song sources (SONGS + catalog-referenced songs).
  useEffect(() => {
    void syncPublicSongsInBackground(bootstrapSongSources, ARTISTS);
  }, [bootstrapSongSources]);

  useEffect(() => {
    recoverAttemptsRef.current = 0;
    lastRecoverAtRef.current = 0;
  }, [currentSong?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      crossfadeTriggeredRef.current = false;
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [audioVersion]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      
      // Trigger crossfade when approaching end of song
      const timeRemaining = audio.duration - audio.currentTime;
      if (
        !crossfadeTriggeredRef.current && 
        audio.duration > 0 && 
        timeRemaining <= crossfadeThreshold && 
        timeRemaining > 0
      ) {
        crossfadeTriggeredRef.current = true;
        playNextRef.current();
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [audioVersion]);

  // Handle song ended - lock preview songs after they finish
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      // Only trigger next song if crossfade wasn't already started
      if (!crossfadeTriggeredRef.current) {
        playNextRef.current();
      }
      crossfadeTriggeredRef.current = false;
    };

    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioVersion]);

  // Crossfade transition function
  const crossfadeToSong = useCallback(async (song: Song) => {
    if (!audioRef.current || !nextAudioRef.current || isCrossfadingRef.current) return;

    isCrossfadingRef.current = true;
    setIsCrossfading(true);
    const currentAudio = audioRef.current;
    const nextAudio = nextAudioRef.current;
    
    // Set up next track
    nextAudio.pause();
    nextAudio.currentTime = 0;
    nextAudio.src = song.audioUrl;
    nextAudio.volume = 0;
    nextAudio.load();

    try {
      await nextAudio.play();
    } catch {
      try {
        currentAudio.src = song.audioUrl;
        currentAudio.currentTime = 0;
        currentAudio.volume = volumeRef.current;
        await currentAudio.play();
        setCurrentSong(song);
        isCrossfadingRef.current = false;
        setIsCrossfading(false);
        setIsPlaying(true);
        setAudioVersion(v => v + 1);
      } catch {
        isCrossfadingRef.current = false;
        setIsCrossfading(false);
        setIsPlaying(false);
      }
      return;
    }
    
    // Update state immediately for UI
    setCurrentSong(song);
    setIsPlaying(true);
    setCurrentTime(0);
    
    const steps = 20;
    const stepDuration = crossfadeDuration / steps;
    let step = 0;
    
    const fadeInterval = setInterval(() => {
      step++;
      const progress = step / steps;
      const targetVolume = volumeRef.current;
      
      // Fade out current, fade in next
      currentAudio.volume = Math.max(0, targetVolume * (1 - progress));
      nextAudio.volume = Math.min(targetVolume, targetVolume * progress);
      
      if (step >= steps) {
        clearInterval(fadeInterval);

        currentAudio.pause();
        currentAudio.src = '';

        // Swap refs — next audio becomes current
        const temp = audioRef.current;
        audioRef.current = nextAudioRef.current;
        nextAudioRef.current = temp;

        isCrossfadingRef.current = false;
        setIsCrossfading(false);
        setAudioVersion(v => v + 1);
      }
    }, stepDuration);
  }, [crossfadeDuration]);

  const forceSetSong = useCallback(async (
    song: Song,
    options?: { startTime?: number; shouldPlay?: boolean }
  ) => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.preload = 'auto';
      audio.volume = volumeRef.current;
      audioRef.current = audio;
      setAudioVersion(v => v + 1);
    }

    setCurrentSong(song);
    setCurrentTime(0);
    audio.src = song.audioUrl;
    audio.currentTime = 0;
    audio.volume = volumeRef.current;
    setAudioVersion(v => v + 1);

    const startTime =
      typeof options?.startTime === 'number' && Number.isFinite(options.startTime) && options.startTime > 0
        ? options.startTime
        : 0;

    if (startTime > 0) {
      const waitForMetadata = () =>
        new Promise<void>((resolve) => {
          if (Number.isFinite(audio.duration) && audio.duration > 0) return resolve();
          const onLoaded = () => {
            audio.removeEventListener('loadedmetadata', onLoaded);
            resolve();
          };
          audio.addEventListener('loadedmetadata', onLoaded);
          window.setTimeout(() => {
            audio.removeEventListener('loadedmetadata', onLoaded);
            resolve();
          }, 1500);
        });

      try {
        audio.load();
      } catch {
        void 0;
      }

      await waitForMetadata();
      try {
        const clamped = Math.max(0, Math.min(startTime, Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.25) : startTime));
        audio.currentTime = clamped;
        setCurrentTime(clamped);
      } catch {
        setCurrentTime(0);
      }
    }

    if (options?.shouldPlay === false) {
      audio.pause();
      nextAudioRef.current?.pause();
      setIsPlaying(false);
      return true;
    }

    try {
      await audio.play();
      setIsPlaying(true);
      return true;
    } catch {
      setIsPlaying(false);
      return false;
    }
  }, []);

  const recoverRoomPlayback = useCallback(async () => {
    if (!isRoomModeRef.current) return;
    if (recoverInFlightRef.current) return;
    const song = currentSongRef.current;
    const audio = audioRef.current;
    if (!song || !audio) return;

    const now = Date.now();
    if (now - lastRecoverAtRef.current < 4000) return;
    if (recoverAttemptsRef.current >= 4) return;

    recoverInFlightRef.current = true;
    lastRecoverAtRef.current = now;
    recoverAttemptsRef.current += 1;

    const targetTime = Number.isFinite(audio.currentTime) ? audio.currentTime : currentTimeRef.current;
    try {
      await forceSetSong(song, { shouldPlay: true, startTime: targetTime });
    } finally {
      recoverInFlightRef.current = false;
    }
  }, [forceSetSong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const clearStallTimer = () => {
      if (!stallTimerRef.current) return;
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    };

    const scheduleRecovery = () => {
      if (!isRoomModeRef.current) return;
      clearStallTimer();
      stallTimerRef.current = window.setTimeout(() => {
        stallTimerRef.current = null;
        const a = audioRef.current;
        if (!a) return;
        if (!isRoomModeRef.current) return;
        if (a.paused) return;
        if (a.readyState >= 3) return;
        void recoverRoomPlayback();
      }, 2500);
    };

    const onError = () => {
      if (!isRoomModeRef.current) return;
      void recoverRoomPlayback();
    };

    const onStalled = () => scheduleRecovery();
    const onWaiting = () => scheduleRecovery();
    const onPlaying = () => clearStallTimer();
    const onCanPlay = () => clearStallTimer();

    audio.addEventListener('error', onError);
    audio.addEventListener('stalled', onStalled);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      clearStallTimer();
      audio.removeEventListener('error', onError);
      audio.removeEventListener('stalled', onStalled);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [audioVersion, recoverRoomPlayback]);

  const playSong = useCallback((song: Song, options?: { userAddress?: string; hasOwnership?: boolean; force?: boolean }) => {
    if (isRoomModeRef.current && !options?.force) return;
    if (audioRef.current) {
      if (isPlayingRef.current && currentSongRef.current) {
        crossfadeToSong(song);
      } else {
        void forceSetSong(song, { shouldPlay: true });
      }
    }
  }, [crossfadeToSong, forceSetSong]);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
        });
      } else {
        audioRef.current.pause();
        nextAudioRef.current?.pause();
        setIsPlaying(false);
      }
    }
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      nextAudioRef.current?.pause();
      setIsPlaying(false);
    }
  }, []);

  const play = useCallback(() => {
    if (audioRef.current && currentSong) {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  }, [currentSong]);

  const seekTo = useCallback((time: number) => {
    if (isRoomModeRef.current) return;
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    volumeRef.current = newVolume;
    setVolumeState(newVolume);
    if (!isCrossfading) {
      if (audioRef.current) audioRef.current.volume = newVolume;
    }
  }, [isCrossfading]);

  const fadeVolume = useCallback((from: number, to: number, durationMs: number) => {
    const audio = audioRef.current;
    if (!audio) return Promise.resolve();
    const clampedFrom = Math.max(0, Math.min(1, from));
    const clampedTo = Math.max(0, Math.min(1, to));
    const steps = 12;
    const stepDuration = durationMs / steps;
    let step = 0;
    audio.volume = clampedFrom;
    return new Promise<void>((resolve) => {
      const interval = window.setInterval(() => {
        step += 1;
        const progress = step / steps;
        const v = clampedFrom + (clampedTo - clampedFrom) * progress;
        audio.volume = Math.max(0, Math.min(1, v));
        if (step >= steps) {
          window.clearInterval(interval);
          resolve();
        }
      }, stepDuration);
    });
  }, []);

  const advanceToNext = useCallback(() => {
    if (!currentSong || queue.length === 0) return;

    if (repeatMode === 'one') {
      if (isPlaying) crossfadeToSong(currentSong);
      else playSong(currentSong, { force: true });
      return;
    }

    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    let nextIndex: number;

    if (shuffleMode) {
      let randomIndex: number;
      do { randomIndex = Math.floor(Math.random() * queue.length); }
      while (queue.length > 1 && randomIndex === currentIndex);
      nextIndex = randomIndex;
    } else if (currentIndex === queue.length - 1) {
      nextIndex = repeatMode === 'all' ? 0 : currentIndex;
    } else {
      nextIndex = currentIndex + 1;
    }

    const nextSong = queue[nextIndex];
    if (isPlaying) crossfadeToSong(nextSong);
    else playSong(nextSong, { force: isRoomMode });
  }, [currentSong, queue, repeatMode, shuffleMode, isPlaying, crossfadeToSong, playSong, isRoomMode]);

  useEffect(() => {
    playNextRef.current = advanceToNext;
  }, [advanceToNext]);

  const advanceToPrevious = useCallback(() => {
    if (currentSong && queue.length > 0) {
      const currentIndex = queue.findIndex(s => s.id === currentSong.id);
      const prevIndex = currentIndex === 0 ? queue.length - 1 : currentIndex - 1;
      const prevSong = queue[prevIndex];
      
      if (isPlaying) {
        crossfadeToSong(prevSong);
      } else {
        playSong(prevSong, { force: isRoomMode });
      }
    }
  }, [currentSong, queue, isPlaying, crossfadeToSong, playSong, isRoomMode]);

  const playNext = useCallback(() => {
    advanceToNext();
  }, [advanceToNext]);

  const playPrevious = useCallback(() => {
    advanceToPrevious();
  }, [advanceToPrevious]);

  const addToQueue = useCallback((song: Song) => {
    setQueue(prev => [...prev, song]);
  }, []);

  const playQueue = useCallback((songs: Song[], options?: { startIndex?: number }) => {
    if (songs.length === 0) return;
    const startIndex = typeof options?.startIndex === 'number' && Number.isFinite(options.startIndex)
      ? Math.max(0, Math.min(songs.length - 1, Math.floor(options.startIndex)))
      : 0;
    setQueue(songs);
    setIsCrossfading(false);
    crossfadeTriggeredRef.current = false;
    const nextSong = songs[startIndex];
    if (isPlaying && currentSong) {
      crossfadeToSong(nextSong);
    } else {
      void forceSetSong(nextSong, { shouldPlay: true });
    }
  }, [crossfadeToSong, currentSong, forceSetSong, isPlaying]);

  const enterRoomMode = useCallback(async (playlist: Song[], options?: { startIndex?: number; startTime?: number }) => {
    if (playlist.length === 0) return false;

    if (!roomRestoreRef.current) {
      roomRestoreRef.current = {
        queue: queueRef.current,
        currentSong: currentSongRef.current,
        isPlaying: isPlayingRef.current,
        currentTime: currentTimeRef.current,
      };
    }

    setIsRoomHidden(false);
    setIsRoomMode(true);
    setQueue(playlist);
    setIsCrossfading(false);
    crossfadeTriggeredRef.current = false;

    const startIndex = typeof options?.startIndex === 'number' && Number.isFinite(options.startIndex)
      ? Math.max(0, Math.min(playlist.length - 1, Math.floor(options.startIndex)))
      : 0;

    const startTime = typeof options?.startTime === 'number' && Number.isFinite(options.startTime) && options.startTime > 0
      ? options.startTime
      : 0;

    return forceSetSong(playlist[startIndex], { shouldPlay: true, startTime });
  }, [forceSetSong]);

  const exitRoomMode = useCallback(async () => {
    const previousVolume = volumeRef.current;
    const audio = audioRef.current;
    if (audio && !audio.paused && previousVolume > 0) {
      await fadeVolume(audio.volume, 0, 220);
    }

    setIsRoomMode(false);
    setIsRoomHidden(false);
    const snapshot = roomRestoreRef.current;
    roomRestoreRef.current = null;

    if (!snapshot) {
      if (audio) {
        audio.volume = previousVolume;
      }
      return;
    }

    setQueue(snapshot.queue);
    setIsCrossfading(false);
    crossfadeTriggeredRef.current = false;

    if (!snapshot.currentSong) {
      audioRef.current?.pause();
      nextAudioRef.current?.pause();
      setCurrentSong(null);
      setIsPlaying(false);
      setCurrentTime(0);
      if (audioRef.current) {
        audioRef.current.volume = previousVolume;
      }
      return;
    }

    await forceSetSong(snapshot.currentSong, {
      shouldPlay: false,
      startTime: snapshot.currentTime,
    });

    const restoredAudio = audioRef.current;
    if (!restoredAudio) return;

    if (!snapshot.isPlaying) {
      restoredAudio.pause();
      restoredAudio.volume = previousVolume;
      setIsPlaying(false);
      return;
    }

    restoredAudio.volume = 0;
    try {
      await restoredAudio.play();
      setIsPlaying(true);
      await fadeVolume(0, previousVolume, 220);
    } catch {
      restoredAudio.volume = previousVolume;
      setIsPlaying(false);
    }
  }, [fadeVolume, forceSetSong]);

  const hideRoom = useCallback(() => {
    if (!isRoomModeRef.current) return;
    setIsRoomHidden(true);
    try {
      localStorage.setItem('room_hidden', 'true');
    } catch {
      void 0;
    }
  }, []);

  const showRoom = useCallback(() => {
    setIsRoomHidden(false);
    try {
      localStorage.removeItem('room_hidden');
    } catch {
      void 0;
    }
  }, []);

  // Memoize context values to prevent unnecessary re-renders
  const stateValue = useMemo(() => ({
    currentSong,
    isPlaying,
    queue,
    isRoomMode,
    isRoomHidden,
  }), [currentSong, isPlaying, isRoomMode, isRoomHidden, queue]);

  const timeValue = useMemo(() => ({
    currentTime,
    duration,
  }), [currentTime, duration]);

  const toggleShuffle = useCallback(() => {
    setShuffleMode(prev => !prev);
  }, []);

  const actionsValue = useMemo(() => ({
    playSong,
    togglePlay,
    pause,
    play,
    seekTo,
    setVolume,
    playNext,
    playPrevious,
    addToQueue,
    playQueue,
    volume,
    repeatMode,
    setRepeatMode,
    shuffleMode,
    toggleShuffle,
    enterRoomMode,
    exitRoomMode,
    hideRoom,
    showRoom,
  }), [addToQueue, enterRoomMode, exitRoomMode, hideRoom, showRoom, pause, play, playNext, playPrevious, playQueue, playSong, repeatMode, seekTo, setRepeatMode, setVolume, shuffleMode, togglePlay, toggleShuffle, volume]);

  return (
    <PlayerStateCtx.Provider value={stateValue}>
      <PlayerTimeCtx.Provider value={timeValue}>
        <PlayerActionsCtx.Provider value={actionsValue}>
          {children}
        </PlayerActionsCtx.Provider>
      </PlayerTimeCtx.Provider>
    </PlayerStateCtx.Provider>
  );
}

// Hook for components that need player state (song, playing status)
export function usePlayerState() {
  const context = useContext(PlayerStateCtx);
  if (context === undefined) {
    throw new Error('usePlayerState must be used within a PlayerProvider');
  }
  return context;
}

// Safe hook that returns undefined if not in provider (for optional usage)
export function useSafePlayerState() {
  return useContext(PlayerStateCtx);
}

// Hook for components that need time updates (progress bar, time display)
export function usePlayerTime() {
  const context = useContext(PlayerTimeCtx);
  if (context === undefined) {
    throw new Error('usePlayerTime must be used within a PlayerProvider');
  }
  return context;
}

// Hook for components that need player actions
export function usePlayerActions() {
  const context = useContext(PlayerActionsCtx);
  if (context === undefined) {
    throw new Error('usePlayerActions must be used within a PlayerProvider');
  }
  return context;
}

// Combined hook for backwards compatibility
export function usePlayer() {
  const state = usePlayerState();
  const time = usePlayerTime();
  const actions = usePlayerActions();
  
  return {
    ...state,
    ...time,
    ...actions,
  };
}
