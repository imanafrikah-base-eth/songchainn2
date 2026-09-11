import { supabase } from '@/integrations/supabase/client';

/**
 * The plumbing of a world's live station: opening and closing a session,
 * getting a pass to its room, and recording it on the host's own device.
 *
 * Recording happens in the host's browser rather than on a recording server:
 * the host's microphone and every voice they bring on are mixed into one
 * track, captured while the session runs, and kept as an episode through the
 * ordinary upload path once they end it.
 */

export interface OpenedSession {
  id: string;
  room_name: string;
}

export class VoiceOffError extends Error {}

/** Put the station on air. The database decides whether this person may. */
export async function openSession(worldSlug: string, worldId: string | null, title: string, hostId: string): Promise<OpenedSession> {
  const roomName = `world-${worldSlug}-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from('world_voice_sessions' as never)
    .insert({ world_slug: worldSlug, world_id: worldId, title: title.trim(), room_name: roomName, host_id: hostId } as never)
    .select('id, room_name')
    .single();
  if (error || !data) {
    throw new Error('The station could not go on air. Voice is on for the first ten worlds, and only for the artist.');
  }
  return data as unknown as OpenedSession;
}

/** Take the station off air. Safe to call more than once. */
export async function closeSession(sessionId: string): Promise<void> {
  await supabase
    .from('world_voice_sessions' as never)
    .update({ status: 'ended', ended_at: new Date().toISOString() } as never)
    .eq('id', sessionId)
    .eq('status', 'live');
}

export interface StationPass {
  token: string;
  wsUrl: string;
  roomName: string;
  role: 'host' | 'listener';
}

/** A pass to the session's room: to speak for its host, to listen for everyone else. */
export async function stationPass(sessionId: string, participantName: string): Promise<StationPass> {
  const { data, error } = await supabase.functions.invoke('world-voice-token', { body: { sessionId, participantName } });
  if (error || !data?.token) {
    const raw = (error as { context?: { body?: string; status?: number } } | null)?.context;
    let parsed: { error?: string; code?: string } | null = null;
    try {
      parsed = typeof raw?.body === 'string' ? JSON.parse(raw.body) : (data as { error?: string; code?: string } | null);
    } catch {
      parsed = null;
    }
    if (parsed?.code === 'voice_off') throw new VoiceOffError('Live voice is not switched on yet.');
    throw new Error(parsed?.error || 'Could not reach the station. Try again in a moment.');
  }
  return data as StationPass;
}

/**
 * Records the session on the host's device: every audio track added is mixed
 * into one stream, and stopping hands back the whole recording.
 */
export class SessionRecorder {
  private ctx: AudioContext;
  private dest: MediaStreamAudioDestinationNode;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private sources = new Map<string, MediaStreamAudioSourceNode>();

  constructor() {
    this.ctx = new AudioContext();
    this.dest = this.ctx.createMediaStreamDestination();
  }

  /** Whether this browser can record at all. */
  static supported(): boolean {
    return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined';
  }

  addTrack(id: string, track: MediaStreamTrack): void {
    if (this.sources.has(id)) return;
    const source = this.ctx.createMediaStreamSource(new MediaStream([track]));
    source.connect(this.dest);
    this.sources.set(id, source);
  }

  removeTrack(id: string): void {
    this.sources.get(id)?.disconnect();
    this.sources.delete(id);
  }

  start(): void {
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(this.dest.stream, type ? { mimeType: type } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.startedAt = Date.now();
    // A slice every few seconds, so a crash near the end still leaves most of it.
    this.recorder.start(5000);
    void this.ctx.resume();
  }

  /** Stops, and resolves with the recording and how long it ran. */
  stop(): Promise<{ blob: Blob; seconds: number } | null> {
    const recorder = this.recorder;
    if (!recorder) return Promise.resolve(null);
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const seconds = Math.round((Date.now() - this.startedAt) / 1000);
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
        this.sources.forEach((s) => s.disconnect());
        this.sources.clear();
        void this.ctx.close();
        resolve(blob.size > 0 ? { blob, seconds } : null);
      };
      if (recorder.state !== 'inactive') recorder.stop();
      else recorder.onstop?.(new Event('stop'));
    });
  }
}
