import { useState, useEffect } from 'react';
import { supabase } from '@/battlezone/integrations/supabase/client';
import { useAuth } from '@/battlezone/contexts/AuthContext';

export type BattleRole = 'host' | 'co-host' | 'speaker' | 'audience';

export interface BattleParticipant {
  id: string;
  user_id: string;
  display_name: string;
  role: BattleRole;
  is_muted: boolean;
  is_speaking: boolean;
  requested_to_speak: boolean;
  joined_at: string;
  last_seen_at: string;
}

export interface RolePermissions {
  canPublishAudio: boolean;
  canApproveSpeakers: boolean;
  canRemoveSpeakers: boolean;
  canStartBattle: boolean;
  canEndBattle: boolean;
  canMuteParticipants: boolean;
  canRequestToSpeak: boolean;
  canVote: boolean;
  canChat: boolean;
}

export const getRolePermissions = (role: BattleRole): RolePermissions => {
  switch (role) {
    case 'host':
      return {
        canPublishAudio: true,
        canApproveSpeakers: true,
        canRemoveSpeakers: true,
        canStartBattle: true,
        canEndBattle: true,
        canMuteParticipants: true,
        canRequestToSpeak: false,
        canVote: false,
        canChat: true,
      };
    case 'co-host':
      return {
        canPublishAudio: true,
        canApproveSpeakers: true,
        canRemoveSpeakers: true,
        canStartBattle: false,
        canEndBattle: false,
        canMuteParticipants: true,
        canRequestToSpeak: false,
        canVote: false,
        canChat: true,
      };
    case 'speaker':
      return {
        canPublishAudio: true,
        canApproveSpeakers: false,
        canRemoveSpeakers: false,
        canStartBattle: false,
        canEndBattle: false,
        canMuteParticipants: false,
        canRequestToSpeak: false,
        canVote: true,
        canChat: true,
      };
    case 'audience':
      return {
        canPublishAudio: false,
        canApproveSpeakers: false,
        canRemoveSpeakers: false,
        canStartBattle: false,
        canEndBattle: false,
        canMuteParticipants: false,
        canRequestToSpeak: true,
        canVote: true,
        canChat: true,
      };
    default:
      return {
        canPublishAudio: false,
        canApproveSpeakers: false,
        canRemoveSpeakers: false,
        canStartBattle: false,
        canEndBattle: false,
        canMuteParticipants: false,
        canRequestToSpeak: true,
        canVote: true,
        canChat: true,
      };
  }
};

const VALID_ROLES: BattleRole[] = ['host', 'co-host', 'speaker', 'audience'];

// Supabase's generated types type battle_rooms.role as plain `string` (codegen doesn't
// derive unions from CHECK constraints), even though the DB guarantees one of BattleRole.
function toBattleRole(role: string | null | undefined): BattleRole {
  return VALID_ROLES.includes(role as BattleRole) ? (role as BattleRole) : 'audience';
}

export const useBattleRoles = (battleId: string) => {
  const { user } = useAuth();
  const [participants, setParticipants] = useState<BattleParticipant[]>([]);
  const [myRole, setMyRole] = useState<BattleRole>('audience');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch participants for a battle
  const fetchParticipants = async () => {
    if (!battleId) return;

    try {
      const { data, error } = await supabase
        .from('battle_rooms')
        .select('*')
        .eq('battle_id', battleId)
        .gte('last_seen_at', new Date(Date.now() - 60000).toISOString())
        .order('joined_at', { ascending: true });

      if (error) throw error;
      const typedParticipants = (data || []).map((row) => ({ ...row, role: toBattleRole(row.role) }));
      setParticipants(typedParticipants);

      // Set current user's role
      if (user) {
        const myParticipant = typedParticipants.find(p => p.user_id === user.id);
        setMyRole(myParticipant?.role || 'audience');
      }
    } catch (err) {
      console.error('Error fetching participants:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch participants');
    } finally {
      setLoading(false);
    }
  };

  // Update participant role
  const updateParticipantRole = async (userId: string, newRole: BattleRole) => {
    if (!battleId) return false;

    try {
      const updateData: Partial<BattleParticipant> = {
        role: newRole,
        last_seen_at: new Date().toISOString(),
      };

      // Set appropriate audio permissions based on role
      if (newRole === 'speaker' || newRole === 'host' || newRole === 'co-host') {
        updateData.is_muted = false;
        updateData.is_speaking = true;
        updateData.requested_to_speak = false;
      } else if (newRole === 'audience') {
        updateData.is_muted = true;
        updateData.is_speaking = false;
        updateData.requested_to_speak = false;
      }

      const { error } = await supabase
        .from('battle_rooms')
        .update(updateData)
        .eq('battle_id', battleId)
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error updating participant role:', err);
      setError(err instanceof Error ? err.message : 'Failed to update role');
      return false;
    }
  };

  // Request to speak
  const requestToSpeak = async () => {
    if (!battleId || !user || myRole !== 'audience') return false;

    try {
      const { error } = await supabase
        .from('battle_rooms')
        .update({
          requested_to_speak: true,
          last_seen_at: new Date().toISOString()
        })
        .eq('battle_id', battleId)
        .eq('user_id', user.id);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error requesting to speak:', err);
      setError(err instanceof Error ? err.message : 'Failed to request to speak');
      return false;
    }
  };

  // Approve speaker request
  const approveSpeakerRequest = async (requesterUserId: string) => {
    if (!battleId || !user) return false;
    return await updateParticipantRole(requesterUserId, 'speaker');
  };

  // Remove speaker
  const removeSpeaker = async (speakerUserId: string) => {
    if (!battleId) return false;
    return await updateParticipantRole(speakerUserId, 'audience');
  };

  // Mute/unmute participant
  const toggleParticipantMute = async (participantUserId: string, muted: boolean) => {
    if (!battleId) return false;

    try {
      const { error } = await supabase
        .from('battle_rooms')
        .update({ 
          is_muted: muted,
          is_speaking: !muted,
          last_seen_at: new Date().toISOString()
        })
        .eq('battle_id', battleId)
        .eq('user_id', participantUserId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error toggling participant mute:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle mute');
      return false;
    }
  };

  // Get participants by role
  const getParticipantsByRole = (role: BattleRole) => {
    return participants.filter(p => p.role === role);
  };

  // Get speaker requests from battle_rooms (participants who raised their hand)
  const getSpeakerRequests = async () => {
    if (!battleId) return [];

    try {
      const { data, error } = await supabase
        .from('battle_rooms')
        .select('*')
        .eq('battle_id', battleId)
        .eq('requested_to_speak', true)
        .eq('role', 'audience')
        .order('last_seen_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching speaker requests:', err);
      return [];
    }
  };

  // Check if user has specific permission
  const hasPermission = (permission: keyof RolePermissions) => {
    const permissions = getRolePermissions(myRole);
    return permissions[permission];
  };

  // Setup real-time subscriptions
  useEffect(() => {
    if (!battleId) return;

    // Initial fetch
    fetchParticipants();

    // Timestamp suffix prevents Supabase from reusing an already-subscribed
    // channel on rapid unmount/remount cycles (same bug as social-feed).
    const ts = Date.now();

    const participantChannel = supabase
      .channel(`battle-participants-${battleId}-${ts}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'battle_rooms',
          filter: `battle_id=eq.${battleId}`,
        },
        () => fetchParticipants()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(participantChannel);
    };
  }, [battleId, user?.id]);

  // Update heartbeat
  useEffect(() => {
    if (!battleId || !user) return;

    const heartbeat = setInterval(async () => {
      await supabase
        .from('battle_rooms')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('battle_id', battleId)
        .eq('user_id', user.id);
    }, 20000);

    return () => clearInterval(heartbeat);
  }, [battleId, user?.id]);

  return {
    participants,
    myRole,
    loading,
    error,
    permissions: getRolePermissions(myRole),
    updateParticipantRole,
    requestToSpeak,
    approveSpeakerRequest,
    removeSpeaker,
    toggleParticipantMute,
    getParticipantsByRole,
    getSpeakerRequests,
    hasPermission,
    refetch: fetchParticipants,
  };
};
