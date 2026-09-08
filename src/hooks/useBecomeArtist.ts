import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * One tap from "I make music" to an open Studio.
 *
 * Until 9 Sep 2026 a new musician's only door was a "New here?" request that
 * waited on Admin > Claims. That review is the right gate for claiming an
 * EXISTING artist's page (somebody could be pretending) and the wrong gate
 * for a page of your own (nobody can impersonate a page that did not exist a
 * second ago). become_artist() writes the artist_accounts row for this
 * account right now, unverified, with an id of its own; the roles refresh
 * flips isArtist and the Studio is the next screen.
 *
 * The audience still never holds an artist's tools: nothing here runs for a
 * person who did not ask.
 */
export function useBecomeArtist() {
  const { user, refreshArtistStatus } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const becomeArtist = useCallback(
    async (opts?: { to?: string; quiet?: boolean }): Promise<boolean> => {
      if (!user) {
        navigate('/?auth=signin');
        return false;
      }
      setPending(true);
      try {
        const { error } = await supabase.rpc('become_artist' as never);
        if (error) throw error;
        await refreshArtistStatus();
        if (!opts?.quiet) {
          toast.success('Your Studio is open', {
            description: 'Send a record and it goes live the same minute. No fee, no wallet needed.',
          });
        }
        navigate(opts?.to ?? '/studio', { replace: true });
        return true;
      } catch (e) {
        toast.error('Could not open the Studio', {
          description: e instanceof Error ? e.message : 'Try again in a moment.',
        });
        return false;
      } finally {
        setPending(false);
      }
    },
    [user, refreshArtistStatus, navigate],
  );

  return { becomeArtist, pending };
}
