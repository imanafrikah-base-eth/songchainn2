import { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Change the email on a signed-in account.
 *
 * Supabase sends a confirmation to both the old and the new address, and the
 * change only lands once both are confirmed, which is why the success toast
 * says "both inboxes" rather than "your inbox".
 */
export function ChangeEmail() {
  const { user } = useAuth();
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wallet, Farcaster and Facebook sessions have no email to change.
  const email = user?.email;
  if (!email) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = next.trim().toLowerCase();
    if (!clean.includes('@') || clean.startsWith('@') || clean.endsWith('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (clean === email.toLowerCase()) {
      setError('That is the email you already use.');
      return;
    }
    if (!isSupabaseConfigured) {
      setError('Not available right now.');
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ email: clean });
      if (updateError) {
        toast.error(updateError.message || 'Could not change your email.');
        return;
      }
      toast.success('Check both inboxes to confirm the change');
      setNext('');
    } catch (err: any) {
      toast.error(String(err?.message || 'Could not change your email.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Change email</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Signed in as <span className="text-foreground">{email}</span>. We will send a confirmation to both the old and the new address.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="change-email-next">New email</Label>
        <Input
          id="change-email-next"
          type="email"
          autoComplete="email"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="you@example.com"
          disabled={busy}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={busy || !next.trim()}>
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Update email
      </Button>
    </form>
  );
}

export default ChangeEmail;
