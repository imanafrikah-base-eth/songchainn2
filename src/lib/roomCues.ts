import { useSyncExternalStore } from 'react';

/**
 * The Room's sounds: someone walks in, you walk in, a message lands, somebody
 * reacts. They are drawn with Web Audio rather than loaded as files, so they
 * cost nothing to download and start the instant they are asked for. Only a
 * device that is in the Room at that moment ever hears one (RoomCues decides
 * that); this file only knows how each one sounds.
 */

export type RoomCueKind = 'join' | 'self-join' | 'message' | 'reaction';

const SOUNDS_KEY = 'songchainn:room-sounds';
const SOUNDS_EVENT = 'songchainn:room-sounds';

function readSoundsOn(): boolean {
  try {
    return localStorage.getItem(SOUNDS_KEY) !== 'off';
  } catch {
    return true;
  }
}

let soundsOn = readSoundsOn();

export function roomSoundsOn() {
  return soundsOn;
}

export function setRoomSoundsOn(on: boolean) {
  soundsOn = on;
  try {
    localStorage.setItem(SOUNDS_KEY, on ? 'on' : 'off');
  } catch {
    void 0;
  }
  window.dispatchEvent(new Event(SOUNDS_EVENT));
}

export function useRoomSoundsOn() {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(SOUNDS_EVENT, notify);
      return () => window.removeEventListener(SOUNDS_EVENT, notify);
    },
    () => soundsOn,
    () => true,
  );
}

/* ---------- the audio graph ---------- */

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let echoIn: GainNode | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();

    // Everything goes through a gentle compressor, so a burst of reactions
    // never clips on top of a loud song.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    comp.connect(ctx.destination);

    bus = ctx.createGain();
    bus.gain.value = 0.9;
    bus.connect(comp);

    // A short, bright echo that the chimes are sent into, so they sparkle and
    // trail off instead of stopping dead.
    echoIn = ctx.createGain();
    echoIn.gain.value = 0.32;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.17;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    const tone = ctx.createBiquadFilter();
    tone.type = 'highpass';
    tone.frequency.value = 700;
    echoIn.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(bus);
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Browsers start audio switched off until the person touches the page. The
 * tap that starts the Room's music is that touch, so wake the sounds on any
 * tap and stop listening once they are awake.
 */
export function primeRoomCues() {
  const wake = () => {
    const c = context();
    if (!c) return;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    if (c.state === 'running') detach();
  };
  const events = ['pointerdown', 'touchend', 'keydown'] as const;
  const detach = () => events.forEach((e) => window.removeEventListener(e, wake, true));
  events.forEach((e) => window.addEventListener(e, wake, true));
  return detach;
}

type Voice = {
  freq: number;
  at: number;
  type?: OscillatorType;
  peak?: number;
  attack?: number;
  decay?: number;
  glideTo?: number;
  glideTime?: number;
  echo?: number;
};

function voice(c: AudioContext, v: Voice) {
  if (!bus || !echoIn) return;
  const start = c.currentTime + v.at;
  const attack = v.attack ?? 0.006;
  const decay = v.decay ?? 0.5;
  const peak = v.peak ?? 0.2;

  const osc = c.createOscillator();
  osc.type = v.type ?? 'sine';
  osc.frequency.setValueAtTime(v.freq, start);
  if (v.glideTo) osc.frequency.exponentialRampToValueAtTime(v.glideTo, start + (v.glideTime ?? 0.08));

  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(peak, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);

  osc.connect(amp);
  amp.connect(bus);
  if (v.echo) {
    const send = c.createGain();
    send.gain.value = v.echo;
    amp.connect(send);
    send.connect(echoIn);
  }
  osc.start(start);
  osc.stop(start + attack + decay + 0.05);
}

/** A soft rising air sweep, like a door opening onto the room. */
function whoosh(c: AudioContext, at: number, length: number, peak: number) {
  if (!bus) return;
  const start = c.currentTime + at;
  const frames = Math.floor(c.sampleRate * length);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(380, start);
  band.frequency.exponentialRampToValueAtTime(5200, start + length);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(peak, start + length * 0.8);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
  src.connect(band);
  band.connect(amp);
  amp.connect(bus);
  src.start(start);
  src.stop(start + length + 0.02);
}

/** A bell: a tone with a quiet octave above it, sent into the echo. */
function bell(c: AudioContext, freq: number, at: number, peak: number, decay = 0.75) {
  voice(c, { freq, at, type: 'triangle', peak, decay, echo: 0.9 });
  voice(c, { freq: freq * 2, at, type: 'sine', peak: peak * 0.35, decay: decay * 0.6, echo: 0.6 });
}

// C major pentatonic, high enough to sit above most of a mix.
const PENTATONIC = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];

function noteFor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return PENTATONIC[h % PENTATONIC.length];
}

const lastAt: Partial<Record<RoomCueKind, number>> = {};
const MIN_GAP: Record<RoomCueKind, number> = { join: 900, 'self-join': 2000, message: 380, reaction: 140 };

/**
 * Plays one Room sound. Says whether it played, so the caller can dip the
 * music only when there was something to hear.
 */
export function playRoomCue(kind: RoomCueKind, seed = ''): boolean {
  if (!soundsOn) return false;
  const now = Date.now();
  if (now - (lastAt[kind] ?? 0) < MIN_GAP[kind]) return false;
  const c = context();
  if (!c) return false;
  if (c.state === 'suspended') void c.resume().catch(() => undefined);
  if (c.state === 'closed') return false;
  lastAt[kind] = now;

  switch (kind) {
    case 'join':
      // Somebody walked in: the door opens, then a rising two note chime.
      whoosh(c, 0, 0.26, 0.05);
      bell(c, 783.99, 0.2, 0.22);
      bell(c, 1174.66, 0.33, 0.24, 0.9);
      break;
    case 'self-join':
      // You are in: the door, then a quick climb up the chord.
      whoosh(c, 0, 0.3, 0.06);
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(c, f, 0.22 + i * 0.075, 0.17 + i * 0.02, i === 3 ? 1 : 0.45));
      break;
    case 'message':
      // A message: a ping, the way a phone pings. Two bright bells a breath
      // apart, high enough to sit over a record rather than under it. The
      // round little pop this replaced was lost the moment the music got
      // loud (founder, 16 Sep 2026).
      bell(c, 1318.51, 0, 0.3, 0.5);
      bell(c, 1760, 0.075, 0.34, 0.75);
      voice(c, { freq: 2637, at: 0.075, type: 'sine', peak: 0.1, attack: 0.002, decay: 0.3, echo: 0.5 });
      break;
    case 'reaction': {
      // A reaction: one pluck, and each emoji has its own note, so a run of
      // reactions plays a little tune instead of the same blip on repeat.
      const f = noteFor(seed);
      voice(c, { freq: f, at: 0, type: 'sine', peak: 0.16, attack: 0.003, decay: 0.22, echo: 0.7 });
      voice(c, { freq: f * 1.5, at: 0, type: 'triangle', peak: 0.05, attack: 0.003, decay: 0.12 });
      break;
    }
  }
  return true;
}

/* ---------- the way out: Room.tsx sends, RoomCues carries ---------- */

export type RoomCueEvent =
  | { event: 'message'; id?: string }
  | { event: 'reaction'; emoji: string; id?: string };

type Sender = (cue: RoomCueEvent) => void;
let sender: Sender | null = null;

export function setRoomCueSender(next: Sender | null) {
  sender = next;
}

/** Lets everyone else in the Room hear that this person did something. */
export function sendRoomCue(cue: RoomCueEvent) {
  sender?.(cue);
}

const NAME_EVENT = 'songchainn:room-name';

/** Room.tsx says when this person's Room name is known or changes. */
export function announceRoomName(name: string) {
  window.dispatchEvent(new CustomEvent(NAME_EVENT, { detail: name }));
}

export function onRoomNameAnnounced(handler: (name: string) => void) {
  const listener = (e: Event) => {
    const name = (e as CustomEvent<string>).detail;
    if (typeof name === 'string') handler(name);
  };
  window.addEventListener(NAME_EVENT, listener);
  return () => window.removeEventListener(NAME_EVENT, listener);
}
