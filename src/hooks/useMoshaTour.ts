import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useSafePlayerState } from '@/context/PlayerContext';
import { advanceTour, nextBeatFor, tourFinished, type TourSignal } from '@/lib/moshaTour';

/**
 * Drives Mo$ha's first-run tour off things the user actually does.
 *
 * Mount once, high in the tree. It watches playback and navigation, and when a
 * signal earns the next beat it dispatches the same `songchainn:mosha-prompt`
 * event everything else uses, so the interruption budget still has the last
 * word. See src/lib/moshaTour.ts for why the old timer-based welcome went.
 */
export function useMoshaTour() {
  const { user, audienceProfile } = useAuth();
  const location = useLocation();
  const player = useSafePlayerState();
  const firedRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<number[]>([]);

  const userId = user?.id ?? '';
  const displayName = audienceProfile?.display_name ?? undefined;
  const song = player?.currentSong;

  // One place that turns a signal into a beat, so every path is paced the same.
  const fire = useRef((signal: TourSignal, ctx: { songTitle?: string; artistName?: string }) => {});
  fire.current = (signal, ctx) => {
    if (!userId || tourFinished(userId)) return;
    const beat = nextBeatFor(userId, signal);
    if (!beat || firedRef.current.has(beat.id)) return;
    firedRef.current.add(beat.id);

    const timer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('songchainn:mosha-prompt', {
          detail: {
            text: beat.line({ displayName, ...ctx }),
            ctaLabel: beat.ctaLabel,
            ctaPath: beat.ctaPath,
          },
        }),
      );
      // Engagement is read back from whether they tapped the CTA; the agent
      // reports that separately. Treat a plain show as not-yet-engaged, which
      // is what makes an ignored tour stop on its own.
      advanceTour(userId, false);
    }, beat.delayMs ?? 4000);
    timersRef.current.push(timer);
  };

  // Signal: the first record they play.
  useEffect(() => {
    if (!song || !player?.isPlaying) return;
    fire.current('played-first-song', { songTitle: song.title, artistName: song.artist });
  }, [song, player?.isPlaying]);

  // Signal: they opened an artist.
  useEffect(() => {
    if (location.pathname.startsWith('/artist/')) fire.current('opened-artist', {});
    if (location.pathname.startsWith('/social') || location.pathname.startsWith('/feed')) {
      fire.current('reached-feed', {});
    }
  }, [location.pathname]);

  // Signal: they have been here a while and are still looking around.
  useEffect(() => {
    if (!userId) return;
    const timer = window.setTimeout(() => fire.current('browsed-a-while', {}), 90_000);
    timersRef.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [userId]);

  useEffect(
    () => () => {
      for (const t of timersRef.current) window.clearTimeout(t);
      timersRef.current = [];
    },
    [],
  );
}
