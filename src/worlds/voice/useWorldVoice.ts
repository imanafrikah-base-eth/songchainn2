import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * A world's station: whether it is on air, what has been kept from it, and
 * whether the person looking may host it.
 *
 * Voice is free for the first ten worlds made and for World #001; the
 * database answers that (world_voice_free, can_host_world_voice), so the app
 * never decides it on its own.
 */

export interface VoiceSession {
  id: string;
  world_slug: string;
  host_id: string;
  title: string;
  room_name: string;
  status: 'live' | 'ended';
  started_at: string;
}

export interface WorldEpisode {
  id: string;
  world_slug: string;
  session_id: string | null;
  host_id: string;
  title: string;
  description: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  is_published: boolean;
  created_at: string;
}

/** The session on air in this world right now, if there is one. Follows it live. */
export function useLiveSession(worldSlug: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['world-voice-live', worldSlug],
    enabled: Boolean(worldSlug) && isSupabaseConfigured,
    staleTime: 15_000,
    queryFn: async (): Promise<VoiceSession | null> => {
      const { data } = await supabase
        .from('world_voice_sessions' as never)
        .select('id, world_slug, host_id, title, room_name, status, started_at')
        .eq('world_slug', worldSlug!)
        .eq('status', 'live')
        // A session left on air by a closed tab stops counting after eight hours.
        .gte('started_at', new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString())
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as unknown as VoiceSession | null) ?? null;
    },
  });

  // Going on air or coming off it shows up for everyone in the world at once.
  useEffect(() => {
    if (!worldSlug || !isSupabaseConfigured) return;
    const channel = supabase
      .channel(`world-voice:${worldSlug}`)
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'world_voice_sessions', filter: `world_slug=eq.${worldSlug}` },
        () => void queryClient.invalidateQueries({ queryKey: ['world-voice-live', worldSlug] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [worldSlug, queryClient]);

  return query;
}

/** Episodes kept from this world's station, newest first. The host also sees their unpublished ones. */
export function useEpisodes(worldSlug: string | undefined) {
  return useQuery({
    queryKey: ['world-episodes', worldSlug],
    enabled: Boolean(worldSlug) && isSupabaseConfigured,
    staleTime: 30_000,
    queryFn: async (): Promise<WorldEpisode[]> => {
      const { data } = await supabase
        .from('world_episodes' as never)
        .select('id, world_slug, session_id, host_id, title, description, audio_url, duration_seconds, is_published, created_at')
        .eq('world_slug', worldSlug!)
        .order('created_at', { ascending: false })
        .limit(50);
      return (data as unknown as WorldEpisode[] | null) ?? [];
    },
  });
}

/** May the signed-in person host voice in this world. */
export function useCanHostVoice(worldSlug: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['world-voice-can-host', worldSlug, user?.id],
    enabled: Boolean(worldSlug && user?.id) && isSupabaseConfigured,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase.rpc('can_host_world_voice' as never, { _slug: worldSlug } as never);
      return data === true;
    },
  });
}

/** Is voice on for this world at all (the first ten worlds, and World #001). */
export function useVoiceFree(worldSlug: string | undefined) {
  return useQuery({
    queryKey: ['world-voice-free', worldSlug],
    enabled: Boolean(worldSlug) && isSupabaseConfigured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase.rpc('world_voice_free' as never, { _slug: worldSlug } as never);
      return data === true;
    },
  });
}
