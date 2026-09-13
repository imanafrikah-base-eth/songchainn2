import { useSyncExternalStore } from "react";

/**
 * Sound in the battle room, without ever asking.
 *
 * Browsers refuse to start audio until the person has tapped something. In a
 * battle room nobody gets a choice about listening, so the tap that brings them
 * into the room is used as that gesture: a capture listener on the whole
 * battlezone primes one shared AudioContext (which LiveKit uses for voices via
 * webAudioMix) and one shared <audio> element (which BattleStage uses for the
 * battle music). On iOS an element or context unlocked inside a gesture stays
 * unlocked, so later src changes and later voices just play.
 *
 * Only when a browser still refuses (a shared link opened straight into the
 * room with no tap anywhere) does the room show its "Tap anywhere" overlay,
 * which calls primeBattleAudio again from inside that tap.
 */

/* A few samples of silence, enough for play() to count as having played. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let ctx: AudioContext | null = null;
let el: HTMLAudioElement | null = null;
let blocked = false;
const listeners = new Set<() => void>();

export function getBattleAudioContext(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  if (!ctx || ctx.state === "closed") {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    ctx = new Ctor();
  }
  return ctx;
}

/** The one element the battle music plays through, so an unlock on it sticks. */
export function getBattleAudioElement(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  if (!el) {
    el = new Audio();
    el.preload = "auto";
    el.setAttribute("playsinline", "");
  }
  return el;
}

/** Call from inside a user gesture. Safe to call as often as you like. */
export function primeBattleAudio() {
  const c = getBattleAudioContext();
  if (c && c.state !== "running") {
    void c.resume().catch(() => undefined);
    try {
      const buffer = c.createBuffer(1, 1, 22050);
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.connect(c.destination);
      source.start(0);
    } catch {
      /* an old browser without a usable context; the element still unlocks */
    }
  }

  const a = getBattleAudioElement();
  if (!a) return;

  // The stage wants music right now and the browser held it back: this tap starts it.
  if (a.dataset.track && a.dataset.wantPlaying === "1") {
    if (a.paused) {
      void a
        .play()
        .then(() => setBattleAudioBlocked(false))
        .catch(() => undefined);
    }
    return;
  }

  if (a.dataset.primed === "1" || a.dataset.track) return;
  a.src = SILENT_WAV;
  void a
    .play()
    .then(() => {
      a.dataset.primed = "1";
      if (!a.dataset.track) a.pause();
    })
    .catch(() => undefined);
}

export function setBattleAudioBlocked(value: boolean) {
  if (blocked === value) return;
  blocked = value;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getBlocked = () => blocked;
const getServerBlocked = () => false;

/** True while the browser is refusing to play the battle music. */
export function useBattleAudioBlocked(): boolean {
  return useSyncExternalStore(subscribe, getBlocked, getServerBlocked);
}

let appWideInstalled = false;

/**
 * The same unlock for taps OUTSIDE the battlezone that lead into a battle: a
 * SONGCHAINN notification, a feed card, the Home hero. Scoped on purpose: an
 * unlock plays a silent sound on a second media element, and on an iPhone that
 * can pause a song already playing in the main player, so it only fires on a
 * battle page or on a link whose address goes into a battle room.
 */
export function installAppWideBattleAudioUnlock() {
  if (appWideInstalled || typeof document === "undefined") return;
  appWideInstalled = true;
  const onGesture = (e: Event) => {
    const onBattlePage = /^\/wavewarz-africa\/(room|battle|live|entry)\b/.test(window.location.pathname);
    const target = e.target as Element | null;
    const link = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    const intoRoom = Boolean(link && /\/wavewarz-africa\/(room|battle|live|entry)\//.test(link.getAttribute("href") || ""));
    if (onBattlePage || intoRoom) primeBattleAudio();
  };
  for (const type of ["pointerup", "touchend", "click", "keydown"]) {
    document.addEventListener(type, onGesture, { capture: true, passive: true });
  }
}

let installed = false;

/** Any tap or key press anywhere in the battlezone primes audio. Install once. */
export function installBattleAudioGestureUnlock() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const onGesture = () => primeBattleAudio();
  for (const type of ["pointerup", "touchend", "click", "keydown"]) {
    document.addEventListener(type, onGesture, { capture: true, passive: true });
  }
}
