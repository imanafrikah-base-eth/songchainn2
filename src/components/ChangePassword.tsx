import { useState } from 'react';
import { KeyRound, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Change your password while signed in.
 *
 * This matters more than it looks: it needs no email at all. Someone who knows
 * their current password can change it here even while password reset mail is
 * unreliable, which makes it the dependable path rather than a convenience.
 *
 * We re-check the old password by signing in with it first. Supabase's
 * updateUser does not require it, so without this anyone who walked up to an
 * unlocked phone could take the account.
 */
export function ChangePassword() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Wallet, Farcaster and Facebook sessions have no password to change.
  const email = user?.email;
  if (!email) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (next.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (next !== confirm) {
      setError('Those two passwords do not match.');
      return;
    }
    if (next === current) {
      setError('That is the password you already have. Pick a different one.');
      return;
    }
    if (!isSupabaseConfigured) {
      setError('Not available right now.');
      return;
    }

    setBusy(true);
    try {
      // Prove they know the current one before we let it change.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signInError) {
        const lower = String(signInError.message || '').toLowerCase();
        // Do not blame their password for something that was not their fault.
        if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('security purposes')) {
          setError('Too many attempts just now. Wait a minute and try again.');
        } else {
          setError('That is not your current password.');
        }
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        const lower = String(updateError.message || '').toLowerCase();
        if (lower.includes('short') || lower.includes('least') || lower.includes('weak')) {
          setError('Use at least 8 characters for your new password.');
        } else if (lower.includes('same') || lower.includes('different from the old')) {
          setError('That is the password you already have. Pick a different one.');
        } else {
          setError(updateError.message || 'We could not change your password.');
        }
        return;
      }

      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      toast.success('Password changed', {
        description: 'Use the new one next time you sign in.',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'We could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
        <KeyRound className="h-4 w-4 text-primary" />
        <span>Change your password</span>
      </p>
      <p className="mb-4 text-xs text-muted-foreground">
        No email needed. You only need the password you use now.
      </p>

      {done ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-primary/10 p-3">
          <Check className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-foreground">Password changed.</p>
          <button
            type="button"
            onClick={() => setDone(false)}
            className="ml-auto text-xs font-semibold text-primary hover:underline"
          >
            Change again
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cp-current" className="text-xs">Current password</Label>
            <Input
              id="cp-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cp-new" className="text-xs">New password</Label>
              <Input
                id="cp-new"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-confirm" className="text-xs">Confirm new password</Label>
              <Input
                id="cp-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy || !current || !next || !confirm}
            className="w-full sm:w-auto"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Change password
          </Button>
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </form>
      )}
    </div>
  );
}

export default ChangePassword;
