import { useEffect, useRef } from 'react';
import { usePlayerActions, useSafePlayerState, useSafePlayerTime } from '@/context/PlayerContext';

/**
 * A card in the feed plays a piece of a record, not the whole thing.
 *
 * A pulse is a moment somebody threw to the room, so it plays the ten seconds
 * around that moment, over and over, the way a clip does. The Room's card
 * plays half a minute of whatever is on in there. Scrolling to the next card
 * ends it; nothing here ever takes the player somewhere the person did not ask
 * to go.
 *
 * It lives in its own component so the time ticking does not re-render a feed
 * full of cards every second.
 */
export function ClipLooper({
  songId,
  startSeconds,
  windowSeconds,
}: {
  /** The song this window belongs to. A different song playing means the window is stale. */
  songId: string;
  startSeconds: number;
  windowSeconds: number;
}) {
  const state = useSafePlayerState();
  const time = useSafePlayerTime();
  const { seekTo } = usePlayerActions();
  const seekingRef = useRef(false);

  const playingId = state?.currentSong?.id ?? null;
  const currentTime = time?.currentTime ?? 0;

  useEffect(() => {
    if (!songId || playingId !== songId) return;
    const start = Math.max(0, startSeconds);
    const end = start + Math.max(4, windowSeconds);
    if (currentTime < end && currentTime >= start - 1) {
      seekingRef.current = false;
      return;
    }
    // One seek per overshoot: without this the next tick seeks again while the
    // first is still settling and the audio stutters.
    if (seekingRef.current) return;
    seekingRef.current = true;
    seekTo(start);
  }, [currentTime, playingId, seekTo, songId, startSeconds, windowSeconds]);

  return null;
}

export default ClipLooper;
