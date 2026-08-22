import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * "This is my page."
 *
 * Every artist page in the founding catalog was built by the label, not by the
 * artist, so none of them are owned by anybody. This is the hand-over: the
 * artist asks for their page, the founder approves it, and from that moment
 * their own profile drives the page. Name, bio, picture, cover.
 *
 * Approval is deliberately manual. The founder personally recorded and produced
 * every artist in this catalog, so he is the strongest identity check available
 * and no automated proof would beat him knowing them.
 */

type Claim = { id: string; status: 'pending' | 'approved' | 'rejected' };

export function ClaimArtistPage({
  artistId,
  artistName,
  isClaimed,
}: {
  artistId: string;
  artistName: string;
  isClaimed: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  const { data: claim, isLoading } = useQuery({
    queryKey: ['artist-claim', artistId, user?.id],
    enabled: !!user?.id && !isClaimed,
    queryFn: async (): Promise<Claim | null> => {
      const { data } = await supabase
        .from('artist_claims')
        .select('id, status')
        .eq('artist_id', artistId)
        .eq('user_id', user!.id)
        .maybeSingle();
      return (data as Claim | null) ?? null;
    },
    staleTime: 30_000,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('artist_claims').insert({
        artist_id: artistId,
        user_id: user!.id,
        status: 'pending',
        message: message.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['artist-claim', artistId, user?.id] });
      toast.success('Sent', {
        description: 'We will look at this and get back to you. The page is yours to run once it is approved.',
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Please try again.';
      toast.error('Could not send that', {
        description: /duplicate|unique/i.test(msg) ? 'You have already asked for this page.' : msg,
      });
    },
  });

  // Already owned, not signed in, or still loading: show nothing at all.
  if (isClaimed || !user || isLoading) return null;

  if (claim?.status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Claim under review
      </span>
    );
  }

  // A rejected claim stays quiet rather than telling someone "no" on a public
  // page every time they visit it.
  if (claim?.status === 'rejected') return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <BadgeCheck className="h-4 w-4" />
        This is my page
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Claim {artistName}</DialogTitle>
            <DialogDescription>
              If this is you, we will hand the page over. Once it is yours, your profile name, bio, picture and cover become this page, and you run it from there.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="claim-message" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              How do we know it is you?
            </label>
            <Textarea
              id="claim-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={600}
              rows={4}
              placeholder="Your number, your socials, who you recorded with, anything that makes this easy to confirm."
            />
            <p className="text-xs text-muted-foreground">
              Most of this catalog was recorded in house, so there is a good chance we already know you.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submit.isPending}>
              Cancel
            </Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ClaimArtistPage;
