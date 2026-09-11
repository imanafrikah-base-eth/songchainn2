import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Headphones, Loader2, Mic, MicOff, Radio, Square } from 'lucide-react';
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant } from 'livekit-client';
import { useAuth } from '@/context/AuthContext';
import { EpisodeList } from './EpisodeList';
import { keepEpisode } from './episodes';
import { SessionRecorder, VoiceOffError, closeSession, openSession, stationPass } from './station';
import { useCanHostVoice, useLiveSession, useVoiceFree } from './useWorldVoice';

/**
 * A world's station, on the world itself.
 *
 * The artist puts it on air from here, talks, and ends it; ending offers to
 * keep the session as an episode, which then stands in the list below for
 * anyone to play. Everybody else sees when it is on air and can listen live,
 * signed in or not. Voice is on for the first ten worlds made and for World
 * #001; the database decides that, never this component.
 */

type Mode = 'idle' | 'connecting' | 'hosting' | 'listening' | 'ending';

export function StationPanel({ worldSlug, worldId }: { worldSlug: string; worldId: string | null }) {
  const { user, displayName } = useAuth() as ReturnType<typeof useAuth> & { displayName?: string | null };
  const queryClient = useQueryClient();
  const { data: live } = useLiveSession(worldSlug);
  const { data: canHost = false } = useCanHostVoice(worldSlug);
  const { data: voiceFree } = useVoiceFree(worldSlug);

  const [mode, setMode] = useState<Mode>('idle');
  const [title, setTitle] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [listeners, setListeners] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [kept, setKept] = useState<{ blob: Blob; seconds: number; sessionId: string } | null>(null);
  const [keepTitle, setKeepTitle] = useState('');
  const [keeping, setKeeping] = useState<number | null>(null);

  const room = useRef<Room | null>(null);
  const recorder = useRef<SessionRecorder | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);

  const refreshLive = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['world-voice-live', worldSlug] }),
    [queryClient, worldSlug],
  );

  const leaveRoom = useCallback(() => {
    room.current?.disconnect();
    room.current = null;
    if (audioBox.current) audioBox.current.innerHTML = '';
    setListeners(0);
  }, []);

  useEffect(() => () => leaveRoom(), [leaveRoom]);

  const connect = useCallback(
    async (sessionId: string, asHost: boolean) => {
      const pass = await stationPass(sessionId, displayName || (asHost ? 'Host' : 'Listener'));
      const r = new Room({ adaptiveStream: true, dynacast: true });
      const count = () => setListeners(r.remoteParticipants.size);
      r.on(RoomEvent.ParticipantConnected, count);
      r.on(RoomEvent.ParticipantDisconnected, count);
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        audioBox.current?.appendChild(el);
        recorder.current?.addTrack(`${participant.identity}:${track.sid}`, track.mediaStreamTrack);
      });
      r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        track.detach().forEach((el) => el.remove());
        recorder.current?.removeTrack(`${participant.identity}:${track.sid}`);
      });
      await r.connect(pass.wsUrl, pass.token);
      room.current = r;
      count();
      if (asHost && pass.role === 'host') {
        await r.localParticipant.setMicrophoneEnabled(true);
        const mic = r.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
        if (mic && SessionRecorder.supported()) {
          recorder.current = new SessionRecorder();
          recorder.current.addTrack('host-mic', mic);
          recorder.current.start();
        }
      }
      return pass.role;
    },
    [displayName],
  );

  const goLive = async () => {
    if (!user) return;
    setNote(null);
    setMode('connecting');
    let opened: string | null = null;
    try {
      const session = await openSession(worldSlug, worldId, title || 'On air', user.id);
      opened = session.id;
      sessionRef.current = session.id;
      await connect(session.id, true);
      setMicOn(true);
      setMode('hosting');
      void refreshLive();
    } catch (err) {
      if (opened) await closeSession(opened);
      leaveRoom();
      setMode('idle');
      setNote(err instanceof VoiceOffError ? 'Live voice is not switched on yet on our side. Your station is ready the moment it is.' : (err as Error).message);
      void refreshLive();
    }
  };

  const rejoin = async (sessionId: string) => {
    setNote(null);
    setMode('connecting');
    try {
      sessionRef.current = sessionId;
      await connect(sessionId, true);
      setMode('hosting');
    } catch (err) {
      leaveRoom();
      setMode('idle');
      setNote(err instanceof VoiceOffError ? 'Live voice is not switched on yet on our side.' : (err as Error).message);
    }
  };

  const listen = async (sessionId: string) => {
    setNote(null);
    setMode('connecting');
    try {
      await connect(sessionId, false);
      setMode('listening');
    } catch (err) {
      leaveRoom();
      setMode('idle');
      setNote(err instanceof VoiceOffError ? 'Live voice is not switched on yet.' : (err as Error).message);
    }
  };

  const endSession = async () => {
    const sessionId = sessionRef.current ?? live?.id ?? null;
    setMode('ending');
    const recording = recorder.current ? await recorder.current.stop() : null;
    recorder.current = null;
    leaveRoom();
    if (sessionId) await closeSession(sessionId);
    void refreshLive();
    setMode('idle');
    if (recording && sessionId) {
      setKept({ ...recording, sessionId });
      setKeepTitle(title || live?.title || '');
    }
  };

  const toggleMic = async () => {
    const r = room.current;
    if (!r) return;
    await r.localParticipant.setMicrophoneEnabled(!micOn);
    setMicOn(!micOn);
  };

  const keep = async () => {
    if (!kept) return;
    setKeeping(0);
    try {
      await keepEpisode(
        { worldSlug, sessionId: kept.sessionId, title: keepTitle || 'Episode', recording: kept.blob, durationSeconds: kept.seconds },
        (pct) => setKeeping(pct),
      );
      setKept(null);
      setNote('Kept. It is in the episodes below.');
      void queryClient.invalidateQueries({ queryKey: ['world-episodes', worldSlug] });
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setKeeping(null);
    }
  };

  const hostingThisOne = live && user && live.host_id === user.id;
  const busy = mode === 'connecting' || mode === 'ending';

  return (
    <section className="space-y-4">
      <div ref={audioBox} className="hidden" aria-hidden="true" />

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${live ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white/60'}`}>
            <Radio className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">The station</p>
            {live ? (
              <>
                <p className="mt-0.5 text-base font-semibold text-white">
                  <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-red-400 align-middle" />
                  On air{live.title ? `: ${live.title}` : ''}
                </p>
                {mode === 'hosting' || mode === 'listening' ? (
                  <p className="text-xs text-white/55">{listeners} {listeners === 1 ? 'other person' : 'other people'} in the room</p>
                ) : null}
              </>
            ) : (
              <p className="mt-0.5 text-sm text-white/65">Off air right now.</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* The host, on air from this tab */}
          {mode === 'hosting' ? (
            <>
              <button type="button" onClick={() => void toggleMic()} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 text-xs font-semibold text-white hover:bg-white/20">
                {micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />} {micOn ? 'Mute me' : 'Unmute me'}
              </button>
              <button type="button" onClick={() => void endSession()} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-red-500 px-4 text-xs font-semibold text-white hover:bg-red-600">
                <Square className="h-3.5 w-3.5" /> End the session
              </button>
            </>
          ) : null}

          {/* A listener in the room */}
          {mode === 'listening' ? (
            <button type="button" onClick={() => { leaveRoom(); setMode('idle'); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 text-xs font-semibold text-white hover:bg-white/20">
              <Square className="h-3.5 w-3.5" /> Stop listening
            </button>
          ) : null}

          {mode === 'idle' && live && !hostingThisOne ? (
            <button type="button" onClick={() => void listen(live.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-black hover:opacity-90">
              <Headphones className="h-3.5 w-3.5" /> Listen live
            </button>
          ) : null}

          {mode === 'idle' && hostingThisOne ? (
            <>
              <button type="button" onClick={() => void rejoin(live!.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-black hover:opacity-90">
                <Mic className="h-3.5 w-3.5" /> Back on air
              </button>
              <button type="button" onClick={() => void endSession()} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 px-4 text-xs font-semibold text-white hover:bg-white/10">
                <Square className="h-3.5 w-3.5" /> End it
              </button>
            </>
          ) : null}

          {mode === 'idle' && !live && canHost ? (
            <form
              className="flex w-full flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void goLive();
              }}
            >
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="What is on tonight"
                aria-label="Name this session"
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
              />
              <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-red-500 px-4 text-xs font-semibold text-white hover:bg-red-600">
                <Radio className="h-3.5 w-3.5" /> Go live
              </button>
            </form>
          ) : null}

          {busy ? <Loader2 className="h-4 w-4 animate-spin text-white/60" /> : null}
        </div>

        {mode === 'hosting' && !SessionRecorder.supported() ? (
          <p className="mt-2 text-xs text-white/45">This browser cannot record, so this session will not be kept as an episode.</p>
        ) : null}
        {mode === 'idle' && !live && user && !canHost && voiceFree === false ? (
          <p className="mt-2 text-xs text-white/45">Voice is on for the first ten worlds for now.</p>
        ) : null}
        {note ? <p className="mt-2 text-xs text-white/70">{note}</p> : null}

        {/* Ending a session offers to keep it. */}
        {kept ? (
          <div className="mt-3 rounded-xl border border-white/15 bg-black/40 p-3">
            <p className="text-sm font-semibold text-white">Keep it as an episode?</p>
            <p className="text-xs text-white/55">{Math.round(kept.seconds / 60)} min recorded. Kept episodes stand below for anyone to play.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={keepTitle}
                onChange={(e) => setKeepTitle(e.target.value)}
                maxLength={120}
                placeholder="Name the episode"
                aria-label="Name the episode"
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
              />
              <button type="button" disabled={keeping !== null} onClick={() => void keep()} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-black disabled:opacity-50">
                {keeping !== null ? `${keeping}%` : 'Keep it'}
              </button>
              <button type="button" disabled={keeping !== null} onClick={() => setKept(null)} className="min-h-11 px-2 text-xs text-white/60 hover:text-white disabled:opacity-50">
                Let it go
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <EpisodeList worldSlug={worldSlug} />
    </section>
  );
}

export default StationPanel;
