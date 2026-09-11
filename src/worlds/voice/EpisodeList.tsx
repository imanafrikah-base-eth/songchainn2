import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EyeOff, Radio, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useEpisodes, type WorldEpisode } from './useWorldVoice';

function length(seconds: number | null): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m}:${String(s).padStart(2, '0')}`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The episodes a world's station has kept, playable right on the page.
 *
 * A visitor sees the published ones. The artist also sees the ones that did
 * not finish publishing, and can hide or delete any of them.
 */
export function EpisodeList({ worldSlug, heading = 'Episodes' }: { worldSlug: string; heading?: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: episodes = [], isLoading } = useEpisodes(worldSlug);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['world-episodes', worldSlug] });
  const hide = useMutation({
    mutationFn: async (ep: WorldEpisode) => {
      await supabase.from('world_episodes' as never).update({ is_published: !ep.is_published, updated_at: new Date().toISOString() } as never).eq('id', ep.id);
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (ep: WorldEpisode) => {
      await supabase.from('world_episodes' as never).delete().eq('id', ep.id);
    },
    onSuccess: refresh,
  });

  const visible = episodes.filter((e) => e.audio_url && (e.is_published || e.host_id === user?.id));

  if (isLoading) return <div className="h-20 animate-pulse rounded-2xl bg-white/5" />;
  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
        <p className="text-sm text-white/60">No episodes kept yet.</p>
        <p className="mt-1 text-xs text-white/35">When the station goes live and the artist keeps the session, it lands here.</p>
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-white/90">
        <Radio className="h-4 w-4 text-amber-300" /> {heading}
      </h3>
      <ul className="space-y-2">
        {visible.map((ep) => {
          const mine = ep.host_id === user?.id;
          return (
            <li key={ep.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{ep.title || 'Untitled episode'}</p>
                  <p className="text-[11px] text-white/50">
                    {when(ep.created_at)}
                    {length(ep.duration_seconds) ? ` · ${length(ep.duration_seconds)}` : ''}
                    {!ep.is_published ? ' · hidden from visitors' : ''}
                  </p>
                </div>
                {mine ? (
                  <>
                    <button
                      type="button"
                      aria-label={ep.is_published ? 'Hide this episode from visitors' : 'Show this episode to visitors'}
                      onClick={() => hide.mutate(ep)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                    >
                      <EyeOff className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete this episode"
                      onClick={() => remove.mutate(ep)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>
              <audio controls preload="none" src={ep.audio_url ?? undefined} className="mt-2 w-full" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default EpisodeList;
