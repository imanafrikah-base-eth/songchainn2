import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Check, X, Loader2, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ARTISTS } from '@/data/musicData';
import { VerifiedBadge } from '@/components/VerifiedBadge';

/**
 * Where artist pages change hands.
 *
 * Approving does three things in one transaction (see approve_artist_claim):
 * grants ownership, marks the claim approved, and auto-rejects every other
 * pending claim on the same artist so two people never both think they won.
 */

type ClaimRow = {
  id: string;
  artist_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  message: string | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string | null;
  id: string | null;
  profile_name: string | null;
  username: string | null;
  profile_picture_url: string | null;
};

export function ArtistClaimsPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-artist-claims'],
    queryFn: async () => {
      const { data: claims, error } = await supabase
        .from('artist_claims')
        .select('id, artist_id, user_id, status, message, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (claims ?? []) as ClaimRow[];
      const ids = [...new Set(rows.map((r) => r.user_id))];

      let profiles: ProfileRow[] = [];
      if (ids.length) {
        const { data: p } = await supabase
          .from('audience_profiles')
          .select('user_id, id, profile_name, username, profile_picture_url')
          .in('user_id', ids);
        profiles = (p ?? []) as ProfileRow[];
      }

      const byUser = new Map<string, ProfileRow>();
      for (const p of profiles) {
        if (p.user_id) byUser.set(p.user_id, p);
        else if (p.id) byUser.set(p.id, p);
      }
      return rows.map((r) => ({ ...r, profile: byUser.get(r.user_id) ?? null }));
    },
    staleTime: 15_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-artist-claims'] });
    queryClient.invalidateQueries({ queryKey: ['artist-account'] });
  };

  const approve = useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase.rpc('approve_artist_claim', {
        p_claim_id: claimId,
        p_verify: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Page handed over', { description: 'They own it now, and the badge is on.' });
    },
    onError: (e: unknown) =>
      toast.error('Could not approve', { description: e instanceof Error ? e.message : 'Try again.' }),
  });

  const reject = useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase.rpc('reject_artist_claim', { p_claim_id: claimId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Claim closed');
    },
    onError: (e: unknown) =>
      toast.error('Could not reject', { description: e instanceof Error ? e.message : 'Try again.' }),
  });

  const claims = data ?? [];
  const pending = claims.filter((c) => c.status === 'pending');
  const settled = claims.filter((c) => c.status !== 'pending');
  const busy = approve.isPending || reject.isPending;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading claims.</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-xl font-semibold text-foreground mb-1">
          Artist page claims
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Approving hands the page over. From then on their own profile name, bio, picture and cover become that artist page, and they run it.
        </p>

        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((claim) => {
              const artist = ARTISTS.find((a) => a.id === claim.artist_id);
              const who = claim.profile?.profile_name || claim.profile?.username || 'Someone';
              return (
                <div key={claim.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">
                        {who} wants {artist?.name ?? claim.artist_id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(claim.created_at), { addSuffix: true })}
                      </p>
                      {claim.message && (
                        <p className="mt-2 rounded-lg bg-muted/50 p-2 text-sm text-foreground">
                          {claim.message}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" disabled={busy} onClick={() => approve.mutate(claim.id)}>
                        {approve.isPending
                          ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          : <Check className="mr-1.5 h-4 w-4" />}
                        Hand it over
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject.mutate(claim.id)}>
                        <X className="mr-1.5 h-4 w-4" />
                        Not them
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {settled.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Already decided
          </h3>
          <div className="space-y-2">
            {settled.map((claim) => {
              const artist = ARTISTS.find((a) => a.id === claim.artist_id);
              const who = claim.profile?.profile_name || claim.profile?.username || 'Someone';
              return (
                <div
                  key={claim.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">
                    {who} · {artist?.name ?? claim.artist_id}
                  </span>
                  {claim.status === 'approved' ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                      <VerifiedBadge size={16} tone="gold" title={null} />
                      Handed over
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Approving also switches on the verified badge for that artist, on their page, their posts and their comments.
      </p>
    </div>
  );
}

export default ArtistClaimsPanel;
