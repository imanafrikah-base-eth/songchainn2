import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ARTISTS, SONGS, Song } from '@/data/musicData';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useAudienceInteractions } from '@/hooks/useAudienceInteractions';

type CtaKind = 'follow-artist' | 'similar-song';

interface CtaItem {
  id: string;
  kind: CtaKind;
  title: string;
  body: string;
  ctaLabel: string;
  ctaPath: string;
  artistId?: string;
  songId?: string;
}

// Gentle-touch pacing: popups should feel like a friend nudging once in a
// while, never like the app imposing. Long cooldowns, big gaps between any
// two popups, quick auto-dismiss, and a hard per-session cap.
const AUTO_DISMISS_MS = 7_000;
const FOLLOW_PROMPT_COOLDOWN_MS = 1000 * 60 * 45;
const SUGGESTION_COOLDOWN_MS = 1000 * 60 * 25;
const CTA_MIN_GAP_MS = 1000 * 60 * 5;
const MAX_CTAS_PER_SESSION = 2;
const SESSION_CTA_COUNT_KEY = 'songchainn_cta_count_session';

function sessionCtaCount(): number {
  try {
    return Number(sessionStorage.getItem(SESSION_CTA_COUNT_KEY) || 0);
  } catch {
    return 0;
  }
}

function bumpSessionCtaCount(): void {
  try {
    sessionStorage.setItem(SESSION_CTA_COUNT_KEY, String(sessionCtaCount() + 1));
  } catch {
    /* storage unavailable: fail open, cooldowns still apply */
  }
}

function uniqueSongCountWithinWindow(songs: Array<{ songId: string; at: number }>, windowMs: number) {
  const cutoff = Date.now() - windowMs;
  const unique = new Set<string>();
  songs.forEach((entry) => {
    if (entry.at >= cutoff) unique.add(entry.songId);
  });
  return unique.size;
}

function selectSimilarSong(params: {
  sourceSong: Song;
  recentlyPlayedSongIds: Set<string>;
}): Song | null {
  const { sourceSong, recentlyPlayedSongIds } = params;
  const candidates = SONGS.filter((song) => {
    if (song.id === sourceSong.id) return false;
    if (song.artistId === sourceSong.artistId) return false;
    if (song.genre !== sourceSong.genre) return false;
    if (recentlyPlayedSongIds.has(song.id)) return false;
    return true;
  });

  if (!candidates.length) return null;
  return candidates[0];
}

export function BehaviorCtaPopups() {
  const location = useLocation();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { user } = useAuth();
  const { isArtistLiked, toggleLikeArtist } = useAudienceInteractions();

  const [activeItem, setActiveItem] = useState<CtaItem | null>(null);
  const queueRef = useRef<CtaItem[]>([]);
  const recentPlaysByArtistRef = useRef<Record<string, Array<{ songId: string; at: number }>>>({});
  const recentGlobalPlaysRef = useRef<Array<{ songId: string; at: number }>>([]);
  const followPromptedAtRef = useRef<Record<string, number>>({});
  const suggestionPromptedAtRef = useRef(0);
  const moshaPromptUntilRef = useRef(0);
  const lastQueuedAtRef = useRef(0);

  const isMoshaContext = useMemo(() => {
    const inRoom = location.pathname.startsWith('/room');
    const now = Date.now();
    if (now < moshaPromptUntilRef.current) return true;
    if (typeof window === 'undefined') return inRoom;
    try {
      const mode = localStorage.getItem('songchainn_vibe_agent_mode_v2');
      const isVibeMode = Boolean(mode && mode !== 'unset' && mode !== 'music');
      return inRoom || isVibeMode;
    } catch {
      return inRoom;
    }
  }, [location.pathname]);

  const showNextInQueue = useCallback(() => {
    if (activeItem) return;
    if (sessionCtaCount() >= MAX_CTAS_PER_SESSION) return;
    const next = queueRef.current.shift() || null;
    if (!next) return;
    bumpSessionCtaCount();
    setActiveItem(next);
  }, [activeItem]);

  const enqueue = useCallback((item: CtaItem) => {
    if (sessionCtaCount() >= MAX_CTAS_PER_SESSION) return;
    if (activeItem?.id === item.id) return;
    if (queueRef.current.some((queued) => queued.id === item.id)) return;
    queueRef.current.push(item);
    if (!activeItem) {
      const next = queueRef.current.shift() || null;
      if (next) bumpSessionCtaCount();
      setActiveItem(next);
    }
  }, [activeItem]);

  const dismissActive = useCallback(() => {
    setActiveItem(null);
  }, []);

  const shellTransition = useMemo(
    () =>
      shouldReduceMotion
        ? { duration: 0.01 }
        : { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.72 },
    [shouldReduceMotion],
  );
  const contentTransition = useMemo(
    () =>
      shouldReduceMotion
        ? { duration: 0.01 }
        : { duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    [shouldReduceMotion],
  );
  const timerDurationSeconds = shouldReduceMotion ? 0 : AUTO_DISMISS_MS / 1000;

  useEffect(() => {
    if (!activeItem) {
      showNextInQueue();
      return;
    }
    const timeout = window.setTimeout(() => {
      dismissActive();
    }, AUTO_DISMISS_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeItem, dismissActive, showNextInQueue]);

  useEffect(() => {
    const handleMoshaPrompt = () => {
      moshaPromptUntilRef.current = Date.now() + 1000 * 60 * 2;
    };

    window.addEventListener('songchainn:open-mosha', handleMoshaPrompt as EventListener);
    window.addEventListener('songchainn:mosha-prompt', handleMoshaPrompt as EventListener);
    return () => {
      window.removeEventListener('songchainn:open-mosha', handleMoshaPrompt as EventListener);
      window.removeEventListener('songchainn:mosha-prompt', handleMoshaPrompt as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`behavior-ctas-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'song_analytics', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = (payload as any)?.new as { event_type?: string; song_id?: string } | undefined;
          if (!row || row.event_type !== 'play' || !row.song_id) return;

          const song = SONGS.find((entry) => entry.id === row.song_id);
          if (!song) return;

          const now = Date.now();
          recentGlobalPlaysRef.current = [...recentGlobalPlaysRef.current, { songId: song.id, at: now }].slice(-30);

          const perArtist = recentPlaysByArtistRef.current[song.artistId] || [];
          const nextArtistPlays = [...perArtist, { songId: song.id, at: now }].slice(-12);
          recentPlaysByArtistRef.current[song.artistId] = nextArtistPlays;

          const artistUniqueCount = uniqueSongCountWithinWindow(nextArtistPlays, 1000 * 60 * 90);
          const followCooldownAt = followPromptedAtRef.current[song.artistId] || 0;
          const canPromptFollow = now - followCooldownAt > FOLLOW_PROMPT_COOLDOWN_MS;
          const canQueueCta = now - lastQueuedAtRef.current > CTA_MIN_GAP_MS;

          if (artistUniqueCount >= 2 && canPromptFollow && canQueueCta && !isArtistLiked(song.artistId)) {
            const artist = ARTISTS.find((entry) => entry.id === song.artistId);
            if (artist) {
              followPromptedAtRef.current[song.artistId] = now;
              lastQueuedAtRef.current = now;
              enqueue({
                id: `follow-${artist.id}-${Math.floor(now / 1000)}`,
                kind: 'follow-artist',
                artistId: artist.id,
                title: isMoshaContext ? `Mo$ha cue: you are on ${artist.name}` : `${artist.name} matches your lane`,
                body: isMoshaContext
                  ? `Keep your $ongChainn vibe neat. Follow now and I will keep this artist close in your picks.`
                  : `You just ran two tracks from ${artist.name}. Follow to keep new drops in your flow.`,
                ctaLabel: 'Follow Now',
                ctaPath: `/artist/${artist.id}`,
              });
            }
          }

          const playsInWindow = recentGlobalPlaysRef.current.filter((entry) => now - entry.at < 1000 * 60 * 15);
          const canPromptSuggestion = now - suggestionPromptedAtRef.current > SUGGESTION_COOLDOWN_MS;
          const canQueueSuggestion = now - lastQueuedAtRef.current > CTA_MIN_GAP_MS;
          if (playsInWindow.length >= 2 && canPromptSuggestion && canQueueSuggestion) {
            const recentlyPlayedIds = new Set(playsInWindow.map((entry) => entry.songId));
            const suggestion = selectSimilarSong({ sourceSong: song, recentlyPlayedSongIds: recentlyPlayedIds });
            if (suggestion) {
              suggestionPromptedAtRef.current = now;
              lastQueuedAtRef.current = now;
              enqueue({
                id: `similar-${suggestion.id}-${Math.floor(now / 1000)}`,
                kind: 'similar-song',
                songId: suggestion.id,
                title: isMoshaContext ? `Mo$ha pick for your vibe` : `Smart next track`,
                body: isMoshaContext
                  ? `Quick switch: "${suggestion.title}" keeps this ${suggestion.genre} energy clean and locked in.`
                  : `Try "${suggestion.title}" next. It fits your recent listening pattern on $ongChainn.`,
                ctaLabel: 'Play Next',
                ctaPath: `/song/${suggestion.id}`,
              });
            }
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enqueue, isArtistLiked, isMoshaContext, user?.id]);

  if (!user || !activeItem) return null;

  return (
    <div className="fixed z-[72] bottom-24 right-2 left-2 sm:left-auto sm:right-4 md:right-6 md:bottom-6 sm:w-[22rem]">
      <AnimatePresence mode="wait">
        {activeItem ? (
          <motion.div
            layout
            key={activeItem.id}
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.992 }}
            transition={shellTransition}
            className="relative overflow-hidden rounded-2xl border border-primary/35 bg-background/95 backdrop-blur shadow-2xl p-3 sm:p-3.5"
          >
            <motion.div
              key={`timer-${activeItem.id}`}
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: timerDurationSeconds, ease: 'linear' }}
              className="absolute top-0 left-0 h-0.5 bg-primary/60"
            />
            <motion.div
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...contentTransition, delay: shouldReduceMotion ? 0 : 0.02 }}
              className="flex items-start justify-between gap-2"
            >
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                <Sparkles className="w-3.5 h-3.5" />
                <span>$ongChainn Smart Cue</span>
              </div>
              <button
                type="button"
                onClick={dismissActive}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...contentTransition, delay: shouldReduceMotion ? 0 : 0.05 }}
              className="mt-2.5 space-y-1.5"
            >
              <p className="text-sm font-semibold text-foreground">{activeItem.title}</p>
              <p className="text-xs text-muted-foreground">{activeItem.body}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...contentTransition, delay: shouldReduceMotion ? 0 : 0.08 }}
              className="mt-3 grid grid-cols-2 gap-2"
            >
              <Button
                type="button"
                className="h-8 text-xs"
                onClick={async () => {
                  if (activeItem.kind === 'follow-artist' && activeItem.artistId && !isArtistLiked(activeItem.artistId)) {
                    await toggleLikeArtist(activeItem.artistId);
                  }
                  dismissActive();
                }}
              >
                {activeItem.kind === 'follow-artist' ? <UserPlus className="w-3.5 h-3.5 mr-1.5" /> : null}
                {activeItem.ctaLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  navigate(activeItem.ctaPath);
                  dismissActive();
                }}
              >
                Open
              </Button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
