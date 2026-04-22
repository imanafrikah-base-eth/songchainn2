import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Hand, Users, Volume2, VolumeX } from 'lucide-react';
import { useBattleRoles, BattleRole } from '@/battlezone/hooks/useBattleRoles';
import { useToast } from '@/battlezone/hooks/use-toast';
import { Room } from 'livekit-client';

interface MicControlsProps {
  battleId: string;
  liveKitRoom: Room | null;
  onAudioPermissionChange?: (granted: boolean) => void;
}

export const MicControls: React.FC<MicControlsProps> = ({
  battleId,
  liveKitRoom,
  onAudioPermissionChange,
}) => {
  const { toast } = useToast();
  const {
    myRole,
    permissions,
    updateParticipantRole,
    requestToSpeak,
    removeSpeaker,
    toggleParticipantMute,
    hasPermission,
  } = useBattleRoles(battleId);

  const [isMuted, setIsMuted] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [isRequestingToSpeak, setIsRequestingToSpeak] = useState(false);

  // Check microphone permissions
  const checkMicPermission = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicPermission('denied');
      onAudioPermissionChange?.(false);
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicPermission('granted');
      onAudioPermissionChange?.(true);
      return true;
    } catch {
      setMicPermission('denied');
      onAudioPermissionChange?.(false);
      toast({
        title: 'Microphone permission denied',
        description: 'Allow microphone access in your browser to speak live in this room.',
      });
      return false;
    }
  };

  // Request microphone access
  const requestMicAccess = async () => {
    const granted = await checkMicPermission();
    if (!granted) {
      toast({
        title: 'Microphone unavailable',
        description: 'Your device/browser does not expose microphone access in this session.',
      });
    }
    return granted;
  };

  // Toggle microphone
  const toggleMicrophone = async () => {
    if (!hasPermission('canPublishAudio')) return;

    // If trying to unmute and no permission, request it
    if (isMuted && micPermission !== 'granted') {
      const granted = await requestMicAccess();
      if (!granted) return;
    }

    try {
      const newMutedState = !isMuted;
      
      // Update LiveKit
      if (liveKitRoom) {
        await liveKitRoom.localParticipant.setMicrophoneEnabled(!newMutedState);
      }

      // Update database
      await toggleParticipantMute(liveKitRoom?.localParticipant.identity || '', newMutedState);
      
      setIsMuted(newMutedState);
      setIsSpeaking(!newMutedState);
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
      toast({
        title: 'Audio error',
        description: 'Failed to toggle microphone. Please try again.',
      });
    }
  };

  // Request to speak
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

  // Leave speaker stage
  const handleLeaveStage = async () => {
    const success = await removeSpeaker(liveKitRoom?.localParticipant.identity || '');
    
    if (success) {
      setIsMuted(true);
      setIsSpeaking(false);
      setIsRequestingToSpeak(false);
      
      // Mute in LiveKit
      if (liveKitRoom) {
        await liveKitRoom.localParticipant.setMicrophoneEnabled(false);
      }
      
      toast({
        title: 'Left speaker stage',
        description: 'You are now in the audience.',
      });
    }
  };

  // Update UI state based on role changes
  useEffect(() => {
    if (myRole === 'speaker' || myRole === 'host' || myRole === 'co-host') {
      setIsMuted(false);
      setIsSpeaking(true);
      setIsRequestingToSpeak(false);
    } else {
      setIsMuted(true);
      setIsSpeaking(false);
      setIsRequestingToSpeak(false);
    }
  }, [myRole]);

  // Check initial mic permission
  useEffect(() => {
    if (hasPermission('canPublishAudio')) {
      checkMicPermission();
    }
  }, [myRole]);

  // Render different controls based on role
  const renderHostControls = () => (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleMicrophone}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          isMuted
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : 'bg-green-100 text-green-700 hover:bg-green-200'
        }`}
      >
        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {isMuted ? 'Unmute' : 'Mute'}
      </button>
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        Host Controls
      </div>
    </div>
  );

  const renderCoHostControls = () => (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleMicrophone}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          isMuted
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : 'bg-green-100 text-green-700 hover:bg-green-200'
        }`}
      >
        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {isMuted ? 'Unmute' : 'Mute'}
      </button>
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        Co-Host
      </div>
    </div>
  );

  const renderSpeakerControls = () => (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleMicrophone}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          isMuted
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : 'bg-green-100 text-green-700 hover:bg-green-200'
        }`}
      >
        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {isMuted ? 'Unmute' : 'Mute'}
      </button>
      <button
        onClick={handleLeaveStage}
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
      >
        <Hand className="h-4 w-4" />
        Leave Stage
      </button>
    </div>
  );

  const renderAudienceControls = () => (
    <div className="flex items-center gap-2">
      <button
        onClick={handleRequestToSpeak}
        disabled={isRequestingToSpeak}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          isRequestingToSpeak
            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
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

  const renderPermissionError = () => (
    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 text-red-700">
      <VolumeX className="h-4 w-4" />
      <span className="text-sm font-medium">Mic Permission Required</span>
    </div>
  );

  // Render based on role and permissions
  if (!hasPermission('canPublishAudio') && !hasPermission('canRequestToSpeak')) {
    return null;
  }

  if (micPermission === 'denied' && hasPermission('canPublishAudio')) {
    return renderPermissionError();
  }

  return (
    <div className="mic-controls">
      {myRole === 'host' && renderHostControls()}
      {myRole === 'co-host' && renderCoHostControls()}
      {myRole === 'speaker' && renderSpeakerControls()}
      {myRole === 'audience' && renderAudienceControls()}
    </div>
  );
};

export default MicControls;
