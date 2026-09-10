import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { supabase } from '@/integrations/supabase/client';

/**
 * The road to the mark, for an artist who came in on their own.
 *
 * The founding artists were verified when they claimed their pages. Anyone
 * else asks for it, and the door opens after ten of their own records are
 * live here. This card shows where they stand (a count on the way there, a
 * button once they are there, a note while the founder looks), and goes
 * away once the mark is on their name.
 */

interface Standing {
  artist_id: string;
  is_verified: boolean;
  songs_live: number;
  needed: number;
  request_status: 'pending' | 'approved' | 'declined' | null;
  requested_at: string | null;
}

export function useVerificationStanding(enabled = true) {
  return useQuery({
    queryKey: ['verification-standing'],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Standing | null> => {
      const { data, error } = await supabase.rpc('artist_verification_standing' as never);
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : data ? [data] : []) as unknown as Standing[];
      return rows[0] ?? null;
    },
  });
}

export function VerificationCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useVerificationStanding();
  const [message, setMessage] = useState('');

  const ask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('request_artist_verification' as never, { p_message: message.trim() || null } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast('Sent', { description: 'The founder will look at it. You will get a notification either way.' });
      void queryClient.invalidateQueries({ queryKey: ['verification-standing'] });
    },
    onError: (e) => toast.error((e as Error)?.message || 'That did not go through. Try again.'),
  });

  if (isLoading || !data || data.is_verified) return null;

  const pending = data.request_status === 'pending';
  const ready = data.songs_live >= data.needed;
  const pct = Math.min(100, Math.round((data.songs_live / Math.max(1, data.needed)) * 100));

  return (
    <section className="mb-10 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-labelledby="verification-heading">
      <div className="flex items-start gap-3">
        <VerifiedBadge size={28} title={null} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 id="verification-heading" className="font-heading text-lg font-semibold text-foreground">Verification</h3>

          {pending ? (
            <p className="mt-1 text-sm text-muted-foreground">Your request is in. The founder is looking at it, and you will get a notification either way.</p>
          ) : ready ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.songs_live} of your own records are live. Ask for the mark and it travels with your name everywhere.
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={600}
                rows={2}
                placeholder="Anything the founder should know (optional)"
                className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
              />
              <Button className="mt-2 h-10 rounded-full px-5" disabled={ask.isPending} onClick={() => ask.mutate()}>
                {ask.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Apply for verification
              </Button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Opens after ten of your own records are live here.</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={data.needed} aria-valuenow={data.songs_live}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{data.songs_live} of {data.needed} records live</p>
            </>
          )}

          {data.request_status === 'declined' && !pending && (
            <p className="mt-2 text-xs text-muted-foreground">The last request was not approved. Keep releasing and ask again.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default VerificationCard;
