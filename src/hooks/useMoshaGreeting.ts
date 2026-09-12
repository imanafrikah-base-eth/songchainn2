import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * A congratulations Mo$ha still owes this artist.
 *
 * The greeting is a row, not an event, and that is the whole point. An artist
 * who uploads from a phone has usually closed the tab long before the audition
 * finishes, so anything fired at the moment of publishing reaches nobody. The
 * row waits until they are actually looking, Mo$ha says it once, and it is
 * marked said so he never says it twice.
 *
 * Written only by the database (mosha_greet_on_release), never from here. A
 * congratulations the browser could insert for itself would be worth nothing.
 */

export interface MoshaGreeting {
  id: string;
  kind: 'verified' | 'first_song_live' | 'song_live';
  body: string;
  suggestions: string[];
  song_id: string | null;
}

export function useMoshaGreeting() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['mosha-greeting', user?.id ?? null],
    enabled: Boolean(user?.id),
    // Only the oldest one. Somebody who dropped a whole volume while signed
    // out should be congratulated once and welcomed in, not handed a stack of
    // ten identical bubbles the next time they open the app.
    queryFn: async (): Promise<MoshaGreeting | null> => {
      const { data, error } = await supabase
        .from('mosha_greetings' as never)
        .select('id, kind, body, suggestions, song_id')
        .is('shown_at', null)
        .order('created_at', { ascending: true })
        .limit(1);
      // A missing table or a policy refusal must never break the app around it.
      if (error) return null;
      const row = (data as unknown as MoshaGreeting[] | null)?.[0];
      if (!row) return null;
      return { ...row, suggestions: Array.isArray(row.suggestions) ? row.suggestions : [] };
    },
    staleTime: 1000 * 60,
  });

  const markShown = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('mosha_greetings' as never)
        .update({ shown_at: new Date().toISOString() } as never)
        .eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mosha-greeting', user?.id ?? null] });
    },
  });

  /**
   * Said. Marked straight away rather than when the panel closes: if the
   * connection drops between opening and closing, the artist has still read it,
   * and repeating it would be worse than losing it.
   */
  const dismiss = useCallback(
    (id: string) => {
      // Clear it locally first so the panel cannot re-open on the same row
      // while the write is still in flight.
      queryClient.setQueryData(['mosha-greeting', user?.id ?? null], null);
      markShown.mutate(id);
    },
    [markShown, queryClient, user?.id],
  );

  return { greeting: query.data ?? null, dismiss };
}
