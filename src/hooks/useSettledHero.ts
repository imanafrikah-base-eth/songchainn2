import { useRef } from 'react';

/**
 * Stopping the front page from flashing the wrong record.
 *
 * The hero is picked from Hot Today first, and from the newest music only when
 * Hot Today has nothing. On the very first render Hot Today has not arrived
 * yet, so the newest release won the pick, showed for a moment, and was then
 * replaced by the real number one. That flash is what this removes.
 *
 * Until the counts have actually landed, nothing new is shown. Whatever was
 * already on screen stays there, so a background refresh never blanks the page
 * either.
 */
export function useSettledHero<T>(pick: T | null, ready: boolean): T | null {
  const held = useRef<T | null>(null);
  if (ready) held.current = pick;
  return held.current;
}
