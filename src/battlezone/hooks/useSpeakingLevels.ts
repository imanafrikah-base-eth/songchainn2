import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ConnectionState, Room, RoomEvent, type Participant } from "livekit-client";

/**
 * Who is actually talking in a LiveKit room, read from the audio itself.
 *
 * The database flag battle_rooms.is_speaking only means "on stage and not
 * muted". This samples each participant's real audio level while the room is
 * connected and publishes it through a tiny external store, so an avatar
 * re-renders only when its own level moves, never the whole room at 15 Hz.
 *
 * Identities are the Supabase user id in both token routes, which matches
 * battle_rooms.user_id.
 */

export interface SpeakingSnapshot {
  /** Smoothed 0..1, quantised to 5% steps. */
  level: number;
  /** True the instant someone talks, held for HOLD_MS after they stop. */
  speaking: boolean;
  /** LiveKit truth: a microphone track is published and not muted. */
  micOn: boolean;
  /** This identity is in the LiveKit room right now. */
  present: boolean;
}

const EMPTY: SpeakingSnapshot = { level: 0, speaking: false, micOn: false, present: false };
const EMPTY_ACTIVE: string[] = [];
const getEmpty = () => EMPTY;
const SAMPLE_MS = 66; // about 15 Hz
const HOLD_MS = 300;
const ATTACK = 0.65;
const RELEASE = 0.18;
const LOUD_THRESHOLD = 0.08;

type Listener = () => void;

export class SpeakingStore {
  private snaps = new Map<string, SpeakingSnapshot>();
  private subs = new Map<string, Set<Listener>>();
  private activeSubs = new Set<Listener>();
  private active: string[] = EMPTY_ACTIVE;

  subscribe = (id: string, cb: Listener) => {
    let set = this.subs.get(id);
    if (!set) {
      set = new Set();
      this.subs.set(id, set);
    }
    set.add(cb);
    return () => {
      set?.delete(cb);
    };
  };

  get = (id: string): SpeakingSnapshot => this.snaps.get(id) ?? EMPTY;

  subscribeActive = (cb: Listener) => {
    this.activeSubs.add(cb);
    return () => {
      this.activeSubs.delete(cb);
    };
  };

  getActive = () => this.active;

  set(id: string, next: SpeakingSnapshot) {
    const prev = this.get(id);
    if (
      prev.level === next.level &&
      prev.speaking === next.speaking &&
      prev.micOn === next.micOn &&
      prev.present === next.present
    ) {
      return;
    }
    if (next === EMPTY || (!next.present && next.level === 0 && !next.speaking)) this.snaps.delete(id);
    else this.snaps.set(id, next);
    this.subs.get(id)?.forEach((cb) => cb());
  }

  setActive(ids: string[]) {
    if (ids.length === this.active.length && ids.every((id, i) => id === this.active[i])) return;
    this.active = ids.length ? ids : EMPTY_ACTIVE;
    this.activeSubs.forEach((cb) => cb());
  }

  /** Clears everyone not in `keep` (or everyone when no set is given). */
  clear(keep?: Set<string>) {
    for (const id of [...this.snaps.keys()]) {
      if (!keep || !keep.has(id)) this.set(id, EMPTY);
    }
    if (!keep) this.setActive(EMPTY_ACTIVE);
  }
}

export function useSpeakingLevels(room: Room | null): SpeakingStore {
  const [store] = useState(() => new SpeakingStore());

  useEffect(() => {
    if (!room) {
      store.clear();
      return;
    }

    const smoothed = new Map<string, number>();
    const lastLoud = new Map<string, number>();
    const livekitActive = new Set<string>();
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (room.state !== ConnectionState.Connected) return;
      const now = performance.now();
      const seen = new Set<string>();
      const active: string[] = [];
      const everyone: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];

      for (const p of everyone) {
        const id = p.identity;
        if (!id) continue;
        seen.add(id);
        const micOn = p.isMicrophoneEnabled;
        const raw = micOn ? Math.min(1, Math.sqrt(Math.max(0, p.audioLevel || 0))) : 0;
        const prev = smoothed.get(id) ?? 0;
        let next = prev + (raw - prev) * (raw > prev ? ATTACK : RELEASE);
        if (next < 0.02) next = 0;
        smoothed.set(id, next);

        if (micOn && (p.isSpeaking || livekitActive.has(id) || raw > LOUD_THRESHOLD)) lastLoud.set(id, now);
        const speaking = micOn && now - (lastLoud.get(id) ?? -Infinity) < HOLD_MS;
        if (speaking) active.push(id);

        store.set(id, { level: Math.round(next * 20) / 20, speaking, micOn, present: true });
      }

      for (const id of [...smoothed.keys()]) {
        if (!seen.has(id)) {
          smoothed.delete(id);
          lastLoud.delete(id);
        }
      }
      store.clear(seen);
      store.setActive(active.sort());
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(tick, SAMPLE_MS);
      tick();
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      smoothed.clear();
      lastLoud.clear();
      livekitActive.clear();
      store.clear();
    };
    const onActiveSpeakers = (speakers: Participant[]) => {
      livekitActive.clear();
      speakers.forEach((s) => livekitActive.add(s.identity));
      tick();
    };

    room
      .on(RoomEvent.Connected, start)
      .on(RoomEvent.Reconnected, start)
      .on(RoomEvent.Reconnecting, stop)
      .on(RoomEvent.Disconnected, stop)
      .on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakers);
    if (room.state === ConnectionState.Connected) start();

    return () => {
      room
        .off(RoomEvent.Connected, start)
        .off(RoomEvent.Reconnected, start)
        .off(RoomEvent.Reconnecting, stop)
        .off(RoomEvent.Disconnected, stop)
        .off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakers);
      stop();
    };
  }, [room, store]);

  return store;
}

/** One participant's live level. Re-renders only when that participant changes. */
export function useSpeaking(store: SpeakingStore, identity: string): SpeakingSnapshot {
  const subscribe = useCallback((cb: Listener) => store.subscribe(identity, cb), [store, identity]);
  const getSnapshot = useCallback(() => store.get(identity), [store, identity]);
  return useSyncExternalStore(subscribe, getSnapshot, getEmpty);
}

/** Identities speaking right now, sorted. Changes only when the set changes. */
export function useActiveSpeakerIds(store: SpeakingStore): string[] {
  return useSyncExternalStore(store.subscribeActive, store.getActive, () => EMPTY_ACTIVE);
}
