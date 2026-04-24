import { useRef, useState, useCallback, useEffect } from 'react';
import { Room, LocalAudioTrack, createLocalAudioTrack } from 'livekit-client';

export type HostAudioState = 'idle' | 'mic-only' | 'song-only' | 'mixed' | 'error';

export interface UseHostAudioReturn {
  audioState: HostAudioState;
  isMicEnabled: boolean;
  isSongPlaying: boolean;
  songVolume: number;
  micVolume: number;
  startMic: () => Promise<void>;
  stopMic: () => void;
  playSong: (audioUrl: string) => Promise<void>;
  stopSong: () => void;
  setSongVolume: (vol: number) => void;
  setMicVolume: (vol: number) => void;
  publishToRoom: (room: Room) => Promise<void>;
  unpublishFromRoom: (room: Room) => void;
  error: string | null;
}

export function useHostAudio(): UseHostAudioReturn {
  const [audioState, setAudioState] = useState<HostAudioState>('idle');
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isSongPlaying, setIsSongPlaying] = useState(false);
  const [songVolume, setSongVolumeState] = useState(0.7);
  const [micVolume, setMicVolumeState] = useState(1.0);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const songSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const songGainRef = useRef<GainNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const publishedTrackRef = useRef<LocalAudioTrack | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const ctx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = ctx;
      destinationRef.current = ctx.createMediaStreamDestination();
    }
    return { ctx: audioCtxRef.current, dest: destinationRef.current! };
  }, []);

  const updateAudioState = useCallback((mic: boolean, song: boolean) => {
    if (mic && song) setAudioState('mixed');
    else if (mic) setAudioState('mic-only');
    else if (song) setAudioState('song-only');
    else setAudioState('idle');
  }, []);

  const startMic = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;

      const { ctx, dest } = getAudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = micVolume;
      source.connect(gain);
      gain.connect(dest);
      micSourceRef.current = source;
      micGainRef.current = gain;

      setIsMicEnabled(true);
      updateAudioState(true, isSongPlaying);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mic access denied';
      setError(msg);
      setAudioState('error');
    }
  }, [getAudioCtx, micVolume, isSongPlaying, updateAudioState]);

  const stopMic = useCallback(() => {
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    micGainRef.current?.disconnect();
    micGainRef.current = null;
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    setIsMicEnabled(false);
    updateAudioState(false, isSongPlaying);
  }, [isSongPlaying, updateAudioState]);

  const playSong = useCallback(async (audioUrl: string) => {
    try {
      setError(null);
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();

      const { ctx, dest } = getAudioCtx();
      await ctx.resume();

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Stop any existing song
      try { songSourceRef.current?.stop(); } catch { void 0; }
      songSourceRef.current?.disconnect();
      songGainRef.current?.disconnect();

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = false;
      const gain = ctx.createGain();
      gain.gain.value = songVolume;
      source.connect(gain);
      gain.connect(dest);         // → LiveKit broadcast stream
      gain.connect(ctx.destination); // → host's local speakers (monitoring)

      source.onended = () => {
        setIsSongPlaying(false);
        updateAudioState(isMicEnabled, false);
      };

      source.start(0);
      songSourceRef.current = source;
      songGainRef.current = gain;

      setIsSongPlaying(true);
      updateAudioState(isMicEnabled, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to play song';
      setError(msg);
    }
  }, [getAudioCtx, songVolume, isMicEnabled, updateAudioState]);

  const stopSong = useCallback(() => {
    try { songSourceRef.current?.stop(); } catch { void 0; }
    songSourceRef.current?.disconnect();
    songSourceRef.current = null;
    songGainRef.current?.disconnect();
    songGainRef.current = null;
    setIsSongPlaying(false);
    updateAudioState(isMicEnabled, false);
  }, [isMicEnabled, updateAudioState]);

  const setSongVolume = useCallback((vol: number) => {
    setSongVolumeState(vol);
    if (songGainRef.current) songGainRef.current.gain.value = vol;
  }, []);

  const setMicVolume = useCallback((vol: number) => {
    setMicVolumeState(vol);
    if (micGainRef.current) micGainRef.current.gain.value = vol;
  }, []);

  const publishToRoom = useCallback(async (room: Room) => {
    const { dest } = getAudioCtx();
    if (!dest.stream) return;

    // Unpublish any previously published track
    if (publishedTrackRef.current) {
      await room.localParticipant.unpublishTrack(publishedTrackRef.current);
      publishedTrackRef.current.stop();
      publishedTrackRef.current = null;
    }

    const track = new LocalAudioTrack(dest.stream.getAudioTracks()[0], undefined, false);
    publishedTrackRef.current = track;
    await room.localParticipant.publishTrack(track, {
      name: 'host-audio',
      simulcast: false,
    });
  }, [getAudioCtx]);

  const unpublishFromRoom = useCallback((room: Room) => {
    if (publishedTrackRef.current) {
      room.localParticipant.unpublishTrack(publishedTrackRef.current);
      publishedTrackRef.current.stop();
      publishedTrackRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { songSourceRef.current?.stop(); } catch { void 0; }
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current?.state !== 'closed') {
        audioCtxRef.current?.close();
      }
    };
  }, []);

  return {
    audioState,
    isMicEnabled,
    isSongPlaying,
    songVolume,
    micVolume,
    startMic,
    stopMic,
    playSong,
    stopSong,
    setSongVolume,
    setMicVolume,
    publishToRoom,
    unpublishFromRoom,
    error,
  };
}
