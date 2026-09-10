import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { ARTISTS } from '@/data/musicData';
import { supabase } from '@/integrations/supabase/client';

/**
 * Artists asking for the mark. Each one has ten or more of their own records
 * live here (the request cannot be made before that). Approving flips the
 * one flag every verification mark in the app reads.
 */

interface VerificationRequest {
  id: string;
  user_id: string;
  artist_id: string;
  songs_owned: number;
  message: string | null;
  status: 'pending' | 'approved' | 'declined';
  created_at: string;
  who: string;
}

export function VerificationRequestsPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-verification-requests'],
    queryFn: async (): Promise<VerificationRequest[]> => {
      const { data: rows, error } = await supabase
        .from('artist_verification_requests' as never)
        .select('id, user_id, artist_id, songs_owned, message, status, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const list = (rows ?? []) as unknown as Omit<VerificationRequest, 'who'>[];
      const ids = [...new Set(list.map((r) => r.user_id))];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: profiles } = await supabase
          .from('audience_profiles')
          .select('user_id, display_name, username')
          .in('user_id', ids);
        for (const p of (profiles ?? []) as Array<{ user_id: string; display_name: string | null; username: string | null }>) {
          names.set(p.user_id, p.display_name || p.username || '');
        }
      }
      return list.map((r) => ({
        ...r,
        who: names.get(r.user_id) || ARTISTS.find((a) => a.id === r.artist_id)?.name || `Artist ${r.artist_id}`,
      }));
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc('decide_artist_verification' as never, { p_request_id: id, p_approve: approve } as never);
      if (error) throw error;
      return approve;
    },
    onSuccess: (approve) => {
      toast(approve ? 'Verified' : 'Declined', { description: approve ? 'The mark is on their name everywhere now.' : 'They have been told, kindly.' });
      void queryClient.invalidateQueries({ queryKey: ['admin-verification-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['verified-artists'] });
    },
    onError: (e) => toast.error('Could not decide that', { description: e instanceof Error ? e.message : 'Try again.' }),
  });

  const requests = data ?? [];
  const pending = requests.filter((r) => r.status === 'pending');
  const settled = requests.filter((r) => r.status !== 'pending');

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading verification requests.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 font-heading text-xl font-semibold text-foreground">Verification requests</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Artists who came in on their own and have ten or more of their own records live. Approving puts the mark on their name everywhere.
        </p>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{r.who}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.songs_owned} records live · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </p>
                    {r.message && <p className="mt-2 rounded-lg bg-muted/50 p-2 text-sm text-foreground">{r.message}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: true })}>
                      {decide.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                      Verify
                    </Button>
                    <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: false })}>
                      <X className="mr-1.5 h-4 w-4" />
                      Not yet
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {settled.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Already decided</h3>
          <div className="space-y-2">
            {settled.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{r.who}</span>
                {r.status === 'approved' ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    <VerifiedBadge size={16} title={null} />
                    Verified
                  </span>
                ) : (
                  <span className="text-muted-foreground">Declined</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default VerificationRequestsPanel;
