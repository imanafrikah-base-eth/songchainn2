import React, { useState, useEffect, useRef } from 'react';
import { Room, RoomEvent, RemoteTrackPublication } from 'livekit-client';
import { getLiveKitToken } from '@/battlezone/lib/livekit';

interface LiveKitRoomProps {
  roomId: string;
  userId: string;
  participantName: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onParticipantJoined?: (participant: any) => void;
  onParticipantLeft?: (participant: any) => void;
  onSpeakingChanged?: (participantId: string, isSpeaking: boolean) => void;
  children?: React.ReactNode;
}

export const LiveKitRoom: React.FC<LiveKitRoomProps> = ({
  roomId,
  userId,
  participantName,
  onConnected,
  onDisconnected,
  onParticipantJoined,
  onParticipantLeft,
  onSpeakingChanged,
  children,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    let cancelled = false;

    const connectToLiveKit = async () => {
      try {
        setError(null);
        
        // Get LiveKit token from backend
        const { token, wsUrl } = await getLiveKitToken(roomId, userId, participantName);
        
        if (cancelled) return;

        // Create LiveKit room
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          stopLocalTrackOnUnpublish: true,
          audioCaptureDefaults: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        roomRef.current = room;

        // Set up event listeners
        room
          .on(RoomEvent.Connected, () => {
            if (cancelled) return;
            setIsConnected(true);
            onConnected?.();
          })
          .on(RoomEvent.Disconnected, () => {
            if (cancelled) return;
            setIsConnected(false);
            onDisconnected?.();
          })
          .on(RoomEvent.ParticipantConnected, (participant) => {
            if (cancelled) return;
            onParticipantJoined?.(participant);
          })
          .on(RoomEvent.ParticipantDisconnected, (participant) => {
            if (cancelled) return;
            onParticipantLeft?.(participant);
          })
          .on(RoomEvent.TrackPublished, (publication, participant) => {
            if (cancelled) return;
            if (publication.kind === 'audio') {
              console.log(`Audio track published by ${participant.identity}`);
            }
          })
          .on(RoomEvent.TrackUnpublished, (publication, participant) => {
            if (cancelled) return;
            console.log(`Track unpublished by ${participant.identity}`);
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            if (cancelled) return;
            speakers.forEach((speaker) => {
              onSpeakingChanged?.(speaker.identity, speaker.isSpeaking);
            });
          });

        // Connect to the room
        await room.connect(wsUrl, token, {
          autoSubscribe: true,
        });

        // Enable local audio by default for hosts/co-hosts/speakers
        // This will be controlled by the battle room role system
        console.log('Connected to LiveKit room:', roomId);

      } catch (err) {
        if (cancelled) return;
        console.error('LiveKit connection error:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect to audio room');
        setIsConnected(false);
      }
    };

    if (roomId && userId && participantName) {
      connectToLiveKit();
    }

    return () => {
      cancelled = true;
      const room = roomRef.current;
      if (room) {
        room.disconnect();
        roomRef.current = null;
      }
      setIsConnected(false);
    };
  }, [roomId, userId, participantName, onConnected, onDisconnected]);

  // Method to toggle microphone
  const toggleMicrophone = async (enabled: boolean) => {
    const room = roomRef.current;
    if (room && isConnected) {
      try {
        await room.localParticipant.setMicrophoneEnabled(enabled);
        console.log(`Microphone ${enabled ? 'enabled' : 'disabled'}`);
      } catch (err) {
        console.error('Failed to toggle microphone:', err);
        throw err;
      }
    }
  };

  // Method to get local audio track
  const getLocalAudioTrack = () => {
    const room = roomRef.current;
    if (room) {
      return room.localParticipant.getTrackPublications().find(
        pub => pub.kind === 'audio' && pub.track
      );
    }
    return null;
  };

  // Expose methods through ref or context
  React.useImperativeHandle(React.createRef(), () => ({
    toggleMicrophone,
    getLocalAudioTrack,
    isConnected,
    room: roomRef.current,
  }));

  if (error) {
    return (
      <div className="flex items-center justify-center p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="text-center">
          <p className="text-red-800 font-medium">Audio Connection Error</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="livekit-room">
      {children}
      {!isConnected && (
        <div className="flex items-center justify-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="text-center">
            <p className="text-yellow-800 font-medium">Connecting to Audio Room...</p>
            <p className="text-yellow-600 text-sm mt-1">Establishing live audio connection</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveKitRoom;
