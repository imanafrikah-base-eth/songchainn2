import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

interface CachedSong {
  songId: string;
  title?: string;
  artist?: string;
  duration?: number;
  audioUrl?: string;
  cachedAt: number;
}

const CACHED_SONGS_KEY = 'offline-cached-songs';

export function useOfflineAudio() {
  const [cachedSongs, setCachedSongs] = useState<CachedSong[]>([]);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [cachingInProgress, setCachingInProgress] = useState<string | null>(null);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CACHED_SONGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CachedSong[] | { songId: string; cachedAt: number }[];
        const normalized = Array.isArray(parsed)
          ? parsed.map((s) => ({
              songId: (s as CachedSong).songId,
              title: (s as CachedSong).title,
              artist: (s as CachedSong).artist,
              duration: (s as CachedSong).duration,
              audioUrl: (s as CachedSong).audioUrl,
              cachedAt: (s as CachedSong).cachedAt ?? Date.now(),
            }))
          : [];
        setCachedSongs(normalized);
      }
    } catch {
      setCachedSongs([]);
    }

    try {
      const isStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone);
    } catch {
      setIsInstalled(false);
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      toast({ 
        title: 'You\'re offline', 
        description: 'Only cached songs are available.' 
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        try {
          const isStandalone =
            window.matchMedia?.('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone === true;
          setIsInstalled(isStandalone);
        } catch {
          void 0;
        }
      }
    };

    const handleSwMessage = (event: MessageEvent) => {
      const data = (event as any).data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'AUDIO_CACHED') {
        const { songId } = data;
        const newCachedSong: CachedSong = { songId, cachedAt: Date.now() };
        setCachedSongs(prev => {
          const updated = [...prev.filter(s => s.songId !== songId), newCachedSong];
          localStorage.setItem(CACHED_SONGS_KEY, JSON.stringify(updated));
          return updated;
        });
        setCachingInProgress(null);
        toast({
          title: 'Song saved',
          description: 'This plays even without internet.',
        });
      }
      if (data.type === 'AUDIO_CACHE_STATS' && typeof data.totalBytes === 'number') {
        setStorageUsedBytes(data.totalBytes);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleSwMessage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.active?.postMessage({ type: 'GET_AUDIO_CACHE_STATS' });
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage as any);
    };
  }, []);

  const cacheSong = useCallback(async (songId: string, audioUrl: string, metadata?: { title?: string; artist?: string; duration?: number }) => {
    if (!('serviceWorker' in navigator)) {
      toast({ 
        title: 'Offline mode not supported', 
        variant: 'destructive' 
      });
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) {
      toast({ 
        title: 'Service worker not ready', 
        variant: 'destructive' 
      });
      return false;
    }

    setCachingInProgress(songId);
    
    registration.active.postMessage({
      type: 'CACHE_AUDIO',
      songId,
      url: audioUrl
    });

    setCachedSongs(prev => {
      const newEntry: CachedSong = {
        songId,
        title: metadata?.title,
        artist: metadata?.artist,
        duration: metadata?.duration,
        audioUrl,
        cachedAt: Date.now(),
      };
      const updated = [...prev.filter(s => s.songId !== songId), newEntry];
      localStorage.setItem(CACHED_SONGS_KEY, JSON.stringify(updated));
      return updated;
    });

    return true;
  }, []);

  const removeCachedSong = useCallback(async (songId: string) => {
    const existing = cachedSongs.find(s => s.songId === songId);
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration.active) {
          registration.active.postMessage({
            type: 'REMOVE_CACHED_AUDIO',
            songId,
            url: existing?.audioUrl,
          });
        }
      } catch {
        void 0;
      }
    }
    setCachedSongs(prev => {
      const updated = prev.filter(s => s.songId !== songId);
      localStorage.setItem(CACHED_SONGS_KEY, JSON.stringify(updated));
      return updated;
    });
    toast({ title: 'Song removed from offline library' });
  }, [cachedSongs]);

  const isSongCached = useCallback((songId: string) => {
    return cachedSongs.some(s => s.songId === songId);
  }, [cachedSongs]);

  const getCachedAudioUrl = useCallback(async (songId: string): Promise<string | null> => {
    if (!('serviceWorker' in navigator)) return null;
    
    return new Promise((resolve) => {
      const registration = navigator.serviceWorker.ready.then(reg => {
        if (!reg.active) {
          resolve(null);
          return;
        }

        const handler = (event: MessageEvent) => {
          if (event.data.type === 'CACHED_AUDIO_URL' && event.data.songId === songId) {
            navigator.serviceWorker.removeEventListener('message', handler);
            resolve(event.data.url);
          }
        };

        navigator.serviceWorker.addEventListener('message', handler);
        
        reg.active.postMessage({
          type: 'GET_CACHED_AUDIO',
          songId
        });

        // Timeout after 2 seconds
        setTimeout(() => {
          navigator.serviceWorker.removeEventListener('message', handler);
          resolve(null);
        }, 2000);
      });
    });
  }, []);

  return {
    cachedSongs,
    isOnline,
    isInstalled,
    cachingInProgress,
    storageUsedBytes,
    cacheSong,
    removeCachedSong,
    isSongCached,
    getCachedAudioUrl
  };
}
