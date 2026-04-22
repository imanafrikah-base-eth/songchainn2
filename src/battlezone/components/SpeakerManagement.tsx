import React, { useState, useEffect } from 'react';
import { Users, Hand, Mic, MicOff, Crown, Shield, UserCheck, UserX, Volume2, VolumeX } from 'lucide-react';
import { useBattleRoles, BattleRole } from '@/battlezone/hooks/useBattleRoles';
import { useToast } from '@/battlezone/hooks/use-toast';

interface SpeakerManagementProps {
  battleId: string;
  maxSpeakers?: number;
}

export const SpeakerManagement: React.FC<SpeakerManagementProps> = ({
  battleId,
  maxSpeakers = 10,
}) => {
  const { toast } = useToast();
  const {
    participants,
    myRole,
    permissions,
    approveSpeakerRequest,
    removeSpeaker,
    toggleParticipantMute,
    getParticipantsByRole,
    getSpeakerRequests,
    hasPermission,
  } = useBattleRoles(battleId);

  const [speakerRequests, setSpeakerRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch speaker requests
  const fetchSpeakerRequests = async () => {
    if (!hasPermission('canApproveSpeakers')) return;
    
    setLoading(true);
    try {
      const requests = await getSpeakerRequests();
      setSpeakerRequests(requests);
    } catch (error) {
      console.error('Error fetching speaker requests:', error);
    } finally {
      setLoading(false);
    }
  };

  // Approve speaker request
  const handleApproveSpeaker = async (requesterUserId: string) => {
    const speakers = getParticipantsByRole('speaker');
    if (speakers.length >= maxSpeakers) {
      toast({
        title: 'Speaker limit reached',
        description: `Maximum ${maxSpeakers} speakers allowed in battle room.`,
      });
      return;
    }

    const success = await approveSpeakerRequest(requesterUserId);
    if (success) {
      toast({
        title: 'Speaker approved',
        description: 'The participant can now speak in the battle.',
      });
      await fetchSpeakerRequests();
    }
  };

  // Remove speaker
  const handleRemoveSpeaker = async (speakerUserId: string) => {
    const success = await removeSpeaker(speakerUserId);
    if (success) {
      toast({
        title: 'Speaker removed',
        description: 'The participant has been moved to the audience.',
      });
      await fetchSpeakerRequests();
    }
  };

  // Toggle speaker mute
  const handleToggleMute = async (participantId: string, currentMuted: boolean) => {
    if (!hasPermission('canMuteParticipants')) return;

    const success = await toggleParticipantMute(participantId, !currentMuted);
    if (success) {
      toast({
        title: 'Audio toggled',
        description: currentMuted ? 'Speaker unmuted' : 'Speaker muted',
      });
    }
  };

  // Get participants by role
  const hosts = getParticipantsByRole('host');
  const coHosts = getParticipantsByRole('co-host');
  const speakers = getParticipantsByRole('speaker');
  const audience = getParticipantsByRole('audience');

  // Setup speaker requests polling
  useEffect(() => {
    if (hasPermission('canApproveSpeakers')) {
      fetchSpeakerRequests();
      const interval = setInterval(fetchSpeakerRequests, 5000);
      return () => clearInterval(interval);
    }
  }, [battleId, myRole]);

  const ParticipantAvatar = ({ participant, size = 'md' }: { participant: any; size?: 'sm' | 'md' | 'lg' }) => {
    const sizes = {
      sm: 'h-8 w-8 text-xs',
      md: 'h-10 w-10 text-sm',
      lg: 'h-12 w-12 text-base',
    };

    return (
      <div className={`relative rounded-full bg-muted flex items-center justify-center font-bold ${sizes[size]}`}>
        {(participant.display_name || '?').charAt(0).toUpperCase()}
        {participant.role === 'host' && <Crown className="absolute -top-1 -right-1 h-3 w-3 text-neon-gold" />}
        {participant.role === 'co-host' && <Shield className="absolute -top-1 -right-1 h-3 w-3 text-neon-cyan" />}
      </div>
    );
  };

  const renderSpeakerRequests = () => {
    if (!hasPermission('canApproveSpeakers')) return null;
    if (speakerRequests.length === 0) return null;

    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Hand className="h-4 w-4" />
          Speaker Requests ({speakerRequests.length})
        </h3>
        <div className="space-y-2">
          {speakerRequests.map((request) => (
            <div key={request.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-3">
                <ParticipantAvatar participant={request} size="sm" />
                <div>
                  <p className="text-sm font-medium text-foreground">{request.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Requested {new Date(request.requested_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleApproveSpeaker(request.user_id)}
                  disabled={speakers.length >= maxSpeakers}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserCheck className="h-3 w-3" />
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderActiveSpeakers = () => {
    const activeSpeakers = [...hosts, ...coHosts, ...speakers];
    if (activeSpeakers.length === 0) return null;

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Mic className="h-4 w-4" />
          Active Speakers ({activeSpeakers.length}/{maxSpeakers})
        </h3>
        <div className="space-y-2">
          {activeSpeakers.map((participant) => (
            <div key={participant.user_id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-3">
                <ParticipantAvatar participant={participant} size="md" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{participant.display_name}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      participant.role === 'host' ? 'bg-neon-gold/20 text-neon-gold' :
                      participant.role === 'co-host' ? 'bg-neon-cyan/20 text-neon-cyan' :
                      'bg-primary/20 text-primary'
                    }`}>
                      {participant.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {participant.is_speaking && !participant.is_muted ? (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <Volume2 className="h-3 w-3" />
                        Speaking
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <VolumeX className="h-3 w-3" />
                        {participant.is_muted ? 'Muted' : 'Silent'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {hasPermission('canMuteParticipants') && participant.user_id !== participants.find(p => p.role === myRole)?.user_id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleMute(participant.user_id, participant.is_muted)}
                    className="p-1 rounded hover:bg-muted transition-colors"
                    title={participant.is_muted ? 'Unmute' : 'Mute'}
                  >
                    {participant.is_muted ? <MicOff className="h-4 w-4 text-muted-foreground" /> : <Mic className="h-4 w-4 text-green-600" />}
                  </button>
                  {(participant.role === 'speaker') && (
                    <button
                      onClick={() => handleRemoveSpeaker(participant.user_id)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      title="Remove from speakers"
                    >
                      <UserX className="h-4 w-4 text-red-600" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAudience = () => {
    if (audience.length === 0) return null;

    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Users className="h-4 w-4" />
          Audience ({audience.length})
        </h3>
        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
          {audience.slice(0, 20).map((participant) => (
            <div key={participant.user_id} className="flex items-center gap-2 p-1 rounded hover:bg-muted/30 transition-colors">
              <ParticipantAvatar participant={participant} size="sm" />
              <span className="text-xs text-muted-foreground truncate">{participant.display_name}</span>
            </div>
          ))}
          {audience.length > 20 && (
            <p className="text-xs text-muted-foreground col-span-2">...and {audience.length - 20} more</p>
          )}
        </div>
      </div>
    );
  };

  if (!hasPermission('canApproveSpeakers') && !hasPermission('canMuteParticipants')) {
    return null;
  }

  return (
    <div className="speaker-management space-y-4">
      {renderSpeakerRequests()}
      {renderActiveSpeakers()}
      {renderAudience()}
      
      {loading && (
        <div className="flex items-center justify-center py-4">
          <div className="text-sm text-muted-foreground">Loading speaker requests...</div>
        </div>
      )}
    </div>
  );
};

export default SpeakerManagement;
