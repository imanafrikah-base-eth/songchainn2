import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Hand, Users, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useBattleRoles } from '@/battlezone/hooks/useBattleRoles';
import { useToast } from '@/battlezone/hooks/use-toast';
import { useAuth } from '@/battlezone/contexts/AuthContext';
import { ConnectionState, ParticipantEvent, Room, RoomEvent } from 'livekit-client';

interface MicControlsProps {
  battleId: string;
  /** The CURRENT LiveKit room (state, not a ref), so a room created after a reconnect is picked up. */
  liveKitRoom: Room | null;
  onAudioPermissionChange?: (granted: boolean) => void;
}

/** Turns a getUserMedia / LiveKit failure into something a person can act on. */
function describeMicError(error: unknown): { title: string; description: string } {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      title: 'Microphone blocked',
      description: 'Allow microphone access for this site in your browser settings, then tap Unmute.',
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { title: 'No microphone found', description: 'Plug in or turn on a microphone, then tap Unmute.' };
  }
  if (name === 'NotReadableError') {
    return {
      title: 'Microphone is busy',
      description: 'Another app is using your microphone. Close it, then tap Unmute.',
    };
  }
  return { title: 'Your mic did not turn on', description: 'Please tap Unmute to try again.' };
}

const isPermissionError = (error: unknown) =>
  error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');

export const MicControls: React.FC<MicControlsProps> = ({
  battleId,
  liveKitRoom,
  onAudioPermissionChange,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const {
    myRole,
    myParticipant,
    requestToSpeak,
    removeSpeaker,
    toggleParticipantMute,
    hasPermission,
  } = useBattleRoles(battleId);

  const roleCanPublish = hasPermission('canPublishAudio');

  // Truth comes from LiveKit, never from the role.
  const [micOn, setMicOn] = useState(false);
  const [connected, setConnected] = useState(false);
  const [tokenCanPublish, setTokenCanPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [isRequestingToSpeak, setIsRequestingToSpeak] = useState(false);

  /** Rooms we have already auto-enabled the mic in, so a manual mute is not undone. */
  const autoEnabledRooms = useRef(new WeakSet<Room>());
  /** Set while this client changes its own mute, so the DB echo is not read as a host mute. */
  const selfChangeRef = useRef(false);

  const dbMuted = myParticipant?.is_muted ?? true;
  const dbMutedRef = useRef(dbMuted);
  dbMutedRef.current = dbMuted;

  // Mirror the room: connection, publish grant and whether the mic is really live.
  useEffect(() => {
    if (!liveKitRoom) {
      setMicOn(false);
      setConnected(false);
      setTokenCanPublish(false);
      return;
    }
    const room = liveKitRoom;
    const sync = () => {
      setConnected(room.state === ConnectionState.Connected);
      setMicOn(room.localParticipant.isMicrophoneEnabled);
      setTokenCanPublish(room.localParticipant.permissions?.canPublish === true);
    };
    const lp = room.localParticipant;
    room
      .on(RoomEvent.Connected, sync)
      .on(RoomEvent.Reconnected, sync)
      .on(RoomEvent.Reconnecting, sync)
      .on(RoomEvent.Disconnected, sync)
      .on(RoomEvent.ParticipantPermissionsChanged, sync);
    lp.on(ParticipantEvent.LocalTrackPublished, sync)
      .on(ParticipantEvent.LocalTrackUnpublished, sync)
      .on(ParticipantEvent.TrackMuted, sync)
      .on(ParticipantEvent.TrackUnmuted, sync);
    sync();
    return () => {
      room
        .off(RoomEvent.Connected, sync)
        .off(RoomEvent.Reconnected, sync)
        .off(RoomEvent.Reconnecting, sync)
        .off(RoomEvent.Disconnected, sync)
        .off(RoomEvent.ParticipantPermissionsChanged, sync);
      lp.off(ParticipantEvent.LocalTrackPublished, sync)
        .off(ParticipantEvent.LocalTrackUnpublished, sync)
        .off(ParticipantEvent.TrackMuted, sync)
        .off(ParticipantEvent.TrackUnmuted, sync);
    };
  }, [liveKitRoom]);

  const setLiveMic = useCallback(
    async (room: Room, enabled: boolean, { quiet = false }: { quiet?: boolean } = {}) => {
      try {
        await room.localParticipant.setMicrophoneEnabled(enabled);
        if (enabled) {
          setMicPermission('granted');
          onAudioPermissionChange?.(true);
        }
        setMicOn(room.localParticipant.isMicrophoneEnabled);
        return true;
      } catch (error) {
        console.error('[MicControls] setMicrophoneEnabled failed', error);
        if (isPermissionError(error)) {
          setMicPermission('denied');
          onAudioPermissionChange?.(false);
        }
        setMicOn(room.localParticipant.isMicrophoneEnabled);
        if (!quiet || enabled) toast(describeMicError(error));
        return false;
      }
    },
    [onAudioPermissionChange, toast],
  );

  // Whenever the CURRENT room is connected with a token that can publish, and the
  // role can publish, turn the mic on once for that room (unless the DB says muted).
  // The token grant is checked so a role flip that lands on the old, listen-only
  // room does not fail; LiveRoom reconnects with a new token and we run again.
  useEffect(() => {
    const room = liveKitRoom;
    if (!room || !connected || !tokenCanPublish || !roleCanPublish) return;
    if (autoEnabledRooms.current.has(room)) return;
    if (!myParticipant) return; // wait for our row so the DB mute flag is known
    autoEnabledRooms.current.add(room);
    if (myParticipant.is_muted) return;
    void setLiveMic(room, true);
  }, [liveKitRoom, connected, tokenCanPublish, roleCanPublish, myParticipant, setLiveMic]);

  // Back in the audience: the mic goes off.
  useEffect(() => {
    if (roleCanPublish || !liveKitRoom) return;
    setIsRequestingToSpeak(false);
    if (liveKitRoom.localParticipant.isMicrophoneEnabled) void setLiveMic(liveKitRoom, false, { quiet: true });
  }, [roleCanPublish, liveKitRoom, setLiveMic]);

  // Promoted: the pending request is done.
  useEffect(() => {
    if (roleCanPublish) setIsRequestingToSpeak(false);
  }, [roleCanPublish]);

  // Honour the DB mute flag. A host muting this person only writes the DB; this
  // client is the one that can actually turn its own mic off.
  useEffect(() => {
    if (!dbMuted || !liveKitRoom || !roleCanPublish) return;
    if (selfChangeRef.current) return;
    if (!liveKitRoom.localParticipant.isMicrophoneEnabled) return;
    void setLiveMic(liveKitRoom, false, { quiet: true }).then((ok) => {
      if (ok) toast({ title: 'You were muted', description: 'The host muted your mic. Tap Unmute when you are asked to speak.' });
    });
  }, [dbMuted, liveKitRoom, roleCanPublish, setLiveMic, toast]);

  const toggleMicrophone = async () => {
    if (!roleCanPublish || busy) return;
    const room = liveKitRoom;
    if (!room || room.state !== ConnectionState.Connected) {
      toast({ title: 'Voice is still connecting', description: 'Give it a moment, then try again.' });
      return;
    }
    if (!room.localParticipant.permissions?.canPublish) {
      toast({ title: 'Joining the stage', description: 'Your speaker access is still being set up. Try again in a moment.' });
      return;
    }

    const turnOn = !room.localParticipant.isMicrophoneEnabled;
    setBusy(true);
    selfChangeRef.current = true;
    try {
      // A tap is a user gesture: use it to unblock playback too.
      void room.startAudio().catch(() => undefined);
      const ok = await setLiveMic(room, turnOn);
      if (ok) {
        const saved = await toggleParticipantMute(user?.id || '', !turnOn);
        if (!saved) {
          toast({ title: 'Mic changed, but not saved', description: 'Others may see the wrong mute state for a moment.' });
        }
      }
    } finally {
      setBusy(false);
      // Let the realtime echo of our own write arrive before honouring DB mutes again.
      window.setTimeout(() => {
        selfChangeRef.current = false;
      }, 1500);
    }
  };

  const handleRequestToSpeak = async () => {
    if (!hasPermission('canRequestToSpeak') || isRequestingToSpeak) return;

    setIsRequestingToSpeak(true);
    const success = await requestToSpeak();

    if (success) {
      toast({
        title: 'Request sent',
        description: 'Your request to speak has been sent to the host.',
      });
    } else {
      setIsRequestingToSpeak(false);
      toast({
        title: 'Request failed',
        description: 'Failed to send speaker request. Please try again.',
      });
    }
  };

  const handleLeaveStage = async () => {
    if (liveKitRoom) await setLiveMic(liveKitRoom, false, { quiet: true });
    const success = await removeSpeaker(user?.id || '');

    if (success) {
      setIsRequestingToSpeak(false);
      toast({
        title: 'Left speaker stage',
        description: 'You are now in the audience.',
      });
    } else {
      toast({ title: 'Could not leave the stage', description: 'Please try again.' });
    }
  };

  const ready = connected && tokenCanPublish;

  const renderMuteButton = () => (
    <button
      onClick={toggleMicrophone}
      disabled={busy}
      aria-pressed={micOn}
      className={`flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 font-medium transition-colors disabled:opacity-60 ${
        micOn
          ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
          : 'border-border bg-muted text-foreground hover:bg-muted/70'
      }`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      ) : micOn ? (
        <Mic className="h-4 w-4" />
      ) : (
        <MicOff className="h-4 w-4" />
      )}
      {!ready ? 'Connecting mic' : micOn ? 'Mute' : 'Unmute'}
    </button>
  );

  const renderHostControls = (label: string) => (
    <div className="flex flex-wrap items-center gap-2">
      {renderMuteButton()}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        {label}
      </div>
    </div>
  );

  const renderSpeakerControls = () => (
    <div className="flex flex-wrap items-center gap-2">
      {renderMuteButton()}
      <button
        onClick={handleLeaveStage}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Hand className="h-4 w-4" />
        Leave Stage
      </button>
    </div>
  );

  const renderAudienceControls = () => (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={handleRequestToSpeak}
        disabled={isRequestingToSpeak}
        className={`flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 font-medium transition-colors ${
          isRequestingToSpeak
            ? 'cursor-not-allowed border-border bg-muted text-muted-foreground'
            : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
        }`}
      >
        <Hand className="h-4 w-4" />
        {isRequestingToSpeak ? 'Request Sent' : 'Request to Speak'}
      </button>
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Volume2 className="h-4 w-4" />
        Listening
      </div>
    </div>
  );

  if (!roleCanPublish && !hasPermission('canRequestToSpeak')) {
    return null;
  }

  return (
    <div className="mic-controls space-y-2">
      {myRole === 'host' && renderHostControls('Host Controls')}
      {myRole === 'co-host' && renderHostControls('Co-Host')}
      {myRole === 'speaker' && renderSpeakerControls()}
      {myRole === 'audience' && renderAudienceControls()}
      {micPermission === 'denied' && roleCanPublish && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <VolumeX className="h-3.5 w-3.5 shrink-0" />
          Microphone access is blocked. Allow it for this site in your browser settings, then tap Unmute.
        </p>
      )}
    </div>
  );
};

export default MicControls;
