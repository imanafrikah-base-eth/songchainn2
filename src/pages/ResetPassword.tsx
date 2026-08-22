import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

/**
 * Where a password reset link lands.
 *
 * The client is created with detectSessionInUrl, so opening a valid recovery
 * link establishes a short-lived session before this renders, and updateUser
 * can then set the new password.
 *
 * The case that used to fall over is arriving WITHOUT that session: an expired
 * link, a link already used, or someone typing the URL. updateUser answered
 * "Auth session missing!", which tells a person nothing. Now the page checks
 * first and says what actually happened.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>('checking');

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLinkState('invalid');
      return;
    }
    let cancelled = false;

    const check = async () => {
      // detectSessionInUrl resolves asynchronously, so give it the moment it
      // needs before deciding the link is bad.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data?.session) {
        setLinkState('valid');
        return;
      }
      const { data: retry } = await supabase.auth.getSession();
      if (cancelled) return;
      setLinkState(retry?.session ? 'valid' : 'invalid');
    };

    const timer = window.setTimeout(check, 600);
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setLinkState('valid');
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedPassword = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (trimmedPassword.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }

    if (trimmedPassword !== trimmedConfirm) {
      setError('Those two passwords do not match.');
      return;
    }

    if (!isSupabaseConfigured) {
      setError('Password reset is not available right now.');
      return;
    }

    setIsLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: trimmedPassword,
      });

      if (updateError) {
        const lower = String(updateError.message || '').toLowerCase();
        if (lower.includes('session') || lower.includes('jwt') || lower.includes('expired')) {
          setError('This reset link has expired or was already used. Ask for a new one and open it straight away.');
          setLinkState('invalid');
        } else if (lower.includes('same') || lower.includes('different from the old')) {
          setError('That is the password you already had. Pick a different one.');
        } else if (lower.includes('short') || lower.includes('least') || lower.includes('weak')) {
          setError('Use at least 8 characters for your new password.');
        } else {
          setError(updateError.message || 'We could not update your password.');
        }
        return;
      }

      toast({ title: 'Password updated' });
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'We could not update your password.');
    } finally {
      setIsLoading(false);
    }
  };

  if (linkState === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md border border-border/60 rounded-2xl bg-card/70 backdrop-blur p-6 space-y-4 text-center">
          <h1 className="text-xl font-semibold text-foreground">This link is no longer good</h1>
          <p className="text-sm text-muted-foreground">
            Reset links only work once, and they do not last long. Ask for a fresh one and open it as soon as it arrives.
          </p>
          <Button asChild className="w-full h-11 font-semibold">
            <Link to="/">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md border border-border/60 rounded-2xl bg-card/70 backdrop-blur p-6 space-y-4">
        <h1 className="text-xl font-semibold text-foreground">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter a new password for your account.
        </p>

        <div className="text-xs text-muted-foreground bg-secondary/20 border border-secondary/50 rounded-xl px-3 py-2">
          This page was opened from a secure password reset link. If you are on a
          shared or public device, reset your password and then close this tab or
          window when you are finished.
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/40 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isLoading || linkState === 'checking'}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading || linkState === 'checking'}
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading || linkState === 'checking'}
            className="w-full h-11 font-semibold"
          >
            {linkState === 'checking' ? 'Checking your link…' : isLoading ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
