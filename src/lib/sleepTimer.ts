import { useSyncExternalStore } from 'react';

/**
 * The sleep timer's state, kept outside React.
 *
 * AudioPlayer (and with it FullScreenPlayer) is mounted by each page, so a
 * timer held in component state would reset every time you changed page. A
 * module-level store survives navigation; FullScreenPlayer owns the effect
 * that actually pauses playback when it fires.
 */
export interface SleepTimerState {
  /** Wall-clock time the timer fires, or null when it is a song-end timer or off. */
  endsAt: number | null;
  /** Pause when the song that was playing when this was armed ends. */
  atSongEnd: boolean;
  armedSongId: string | null;
}

const OFF: SleepTimerState = { endsAt: null, atSongEnd: false, armedSongId: null };

let state: SleepTimerState = OFF;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSleepTimer(): SleepTimerState {
  return state;
}

export function setSleepTimerMinutes(minutes: number) {
  state = { endsAt: Date.now() + minutes * 60_000, atSongEnd: false, armedSongId: null };
  emit();
}

export function setSleepTimerAtSongEnd(songId: string) {
  state = { endsAt: null, atSongEnd: true, armedSongId: songId };
  emit();
}

export function clearSleepTimer() {
  if (state === OFF) return;
  state = OFF;
  emit();
}

export function isSleepTimerActive(s: SleepTimerState = state) {
  return s.endsAt !== null || s.atSongEnd;
}

export function useSleepTimer(): SleepTimerState {
  return useSyncExternalStore(subscribe, getSleepTimer, getSleepTimer);
}
