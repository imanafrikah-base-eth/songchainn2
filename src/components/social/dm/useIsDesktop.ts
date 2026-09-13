import { useSyncExternalStore } from 'react';

/**
 * True at the lg breakpoint and up, where the inbox shows the list and the
 * thread side by side. Decided in JS rather than with CSS alone because only
 * one thread may ever be mounted: two would open the same realtime channel.
 */
const QUERY = '(min-width: 1024px)';

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener?.('change', onChange);
  return () => mql.removeEventListener?.('change', onChange);
}

function getSnapshot() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
