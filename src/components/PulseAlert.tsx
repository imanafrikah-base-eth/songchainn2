import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { usePlayerActions } from '@/context/PlayerContext';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { SONGS, type Song } from '@/data/musicData';
import { songPath } from '@/lib/slugRoutes';

/**
 * Somebody just pulsed a song, and you can hear it from the exact second they
 * did.
 *
 * A pulse used to be a rose pill saying "X got pulsed" for three seconds, with
 * no artwork, nothing to tap and nothing to do about it. It is the most social
 * thing in the app: a person hearing a moment and throwing it to everyone
 * else. So it now looks like the record it came from, and tapping it drops you
 * into that song at that moment.
 *
 * Three rules the founder set:
 *   - it can be tapped
 *   - it stays a little longer
 *   - at most one every three seconds, however many people are pulsing
 * The rest of the room's pulses are not queued behind it. A pulse is a live
 * thing; a stale one shown a minute later would be a lie.
 */

/** One alert at a time, and no more often than this however busy the app is. */
const MIN_GAP_MS = 3000;
/** Long enough to read the title and reach for it, short enough to stay out of the way. */
const SHOW_MS = 6000;

interface PulseRow {
  song_id?: string | null;
  user_id?: string | null;
  position_seconds?: number | null;
  event_type?: string | null;
}

interface Pulsed {
  song: Song;
  atSeconds: number | null;
  key: number;
}

function formatMoment(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function PulseAlert() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { playSong } = usePlayerActions();
  const { songs: publishedSongs } = usePublishedCatalog();
  const [pulsed, setPulsed] = useState<Pulsed | null>(null);
  const lastShownRef = useRef(0);
  const hideTimerRef = useRef<number | null>(null);
  const catalogRef = useRef<Song[]>(SONGS);
  catalogRef.current = publishedSongs.length ? [...SONGS, ...publishedSongs] : SONGS;

  const show = useCallback((row: PulseRow) => {
    if (!row?.song_id) return;
    // One every three seconds. Anything arriving inside the gap is dropped
    // rather than queued, because a pulse is a live moment.
    const now = Date.now();
    if (now - lastShownRef.current < MIN_GAP_MS) return;

    const song = catalogRef.current.find((s) => String(s.id) === String(row.song_id));
    if (!song) return;

    lastShownRef.current = now;
    setPulsed({
      song,
      atSeconds: typeof row.position_seconds === 'number' ? row.position_seconds : null,
      key: now,
    });

    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setPulsed(null), SHOW_MS);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('pulse-alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'song_analytics' },
        (payload) => {
          const row = (payload as { new?: PulseRow })?.new;
          if (!row || row.event_type !== 'pulse') return;
          // Your own pulse is not news to you.
          if (row.user_id && user?.id && row.user_id === user.id) return;
          show(row);
        },
      )
      .subscribe();

    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [show, user?.id]);

  const hear = useCallback(() => {
    if (!pulsed) return;
    const { song, atSeconds } = pulsed;
    setPulsed(null);
    playSong(song, atSeconds != null && atSeconds > 0 ? { startTime: atSeconds } : undefined);
    navigate(songPath(song));
  }, [pulsed, playSong, navigate]);

  const moment = pulsed ? formatMoment(pulsed.atSeconds) : '';

  return (
    <AnimatePresence>
      {pulsed && (
        <motion.div
          key={pulsed.key}
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-3 sm:px-4"
        >
          <button
            type="button"
            onClick={hear}
            aria-label={`${pulsed.song.title} by ${pulsed.song.artist} was just pulsed${moment ? ` at ${moment}` : ''}. Play it from there.`}
            className="pointer-events-auto flex min-h-14 w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-card p-2 pr-3 text-left shadow-lg transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <span className="relative shrink-0">
              <img
                src={pulsed.song.coverImage}
                alt=""
                aria-hidden="true"
                className="h-11 w-11 rounded-xl object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
              {/* One ring, going out once, the way a pulse actually behaves. */}
              <motion.span
                aria-hidden="true"
                initial={{ opacity: 0.55, scale: 1 }}
                animate={{ opacity: 0, scale: 1.6 }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
                className="pointer-events-none absolute inset-0 rounded-xl border-2 border-primary"
              />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{pulsed.song.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                Pulsed{moment ? ` at ${moment}` : ''} · tap to hear it from there
              </span>
            </span>

            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" />
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PulseAlert;
