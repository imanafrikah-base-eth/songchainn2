import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

const CONFIRM_WORD = 'DELETE';

/**
 * Delete your account, from inside the app, right now.
 *
 * What goes and what stays is spelled out on screen before the button is
 * live, because a deletion that surprises somebody afterwards is worse than
 * none. The word has to be typed; a single tap is too easy to hit in a
 * pocket. The work itself is done by the delete-account function under the
 * person's own session, so only the caller can delete the caller.
 */
export function DeleteAccount({ compact = false }: { compact?: boolean }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user?.id || !isSupabaseConfigured) return null;

  const run = async () => {
    if (typed.trim().toUpperCase() !== CONFIRM_WORD) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error || !data?.ok) {
        const message = (data as { error?: string } | null)?.error || error?.message || 'Deletion failed. Nothing was changed.';
        toast.error(message);
        setBusy(false);
        return;
      }
      setOpen(false);
      toast('Your account is gone.', { description: 'Thank you for listening with us.' });
      await signOut();
      navigate('/', { replace: true });
    } catch {
      toast.error('Deletion failed. Nothing was changed. Try again, or email songchaindao@gmail.com.');
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`bg-card border border-border rounded-xl p-4 ${compact ? '' : 'flex flex-wrap items-center justify-between gap-3'}`}>
        <div>
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-destructive" />
            <span>Delete your account</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground max-w-prose">
            Removes your profile, posts, comments, likes, follows, playlists, points and messages
            you started. Purchases, coins and anything on Base stay where they are; nothing on a
            blockchain can be deleted, by us or anyone. This cannot be undone.
          </p>
        </div>
        <Button type="button" variant="outline" className={compact ? 'mt-3' : ''} onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) { setOpen(v); setTyped(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this account for good?</DialogTitle>
            <DialogDescription>
              Type {CONFIRM_WORD} to confirm. You will be signed out, and the email on this account
              is free to sign up again later, starting from nothing.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            aria-label={`Type ${CONFIRM_WORD} to confirm`}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || typed.trim().toUpperCase() !== CONFIRM_WORD}
              onClick={run}
            >
              {busy ? 'Deleting...' : 'Delete everything'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
