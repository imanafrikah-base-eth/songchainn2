import { useState } from 'react';
import { Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { realNameProblem } from '@/lib/realName';
const logo = '/songchainn-logo.webp';

/**
 * The one question an existing account is sent back for: a name.
 *
 * Accounts made before names were enforced finished onboarding with their
 * email or wallet handle as their name. They are not made to redo the whole
 * form; the shell simply waits until this field is filled with a real name.
 */
export default function NameStep() {
  const { user, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmed = name.trim();
    const problem = realNameProblem(trimmed, user.email);
    if (problem) {
      setError(problem);
      return;
    }
    if (trimmed.length > 50) {
      setError('Keep it under 50 characters.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const { error: saveError } = await supabase
        .from('audience_profiles')
        .update({ display_name: trimmed, profile_name: trimmed, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (saveError) {
        setError(
          /taken/i.test(saveError.message)
            ? 'Somebody already goes by that name. Pick another one.'
            : 'Could not save your name. Try again.',
        );
        return;
      }
      await refreshProfile();
    } catch {
      setError('Could not save your name. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-md mx-auto pt-8">
        <img src={logo} alt="$ongChainn" className="h-12 mx-auto mb-6" />
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border/60 bg-card p-5">
          <div className="space-y-1 text-center">
            <h1 className="font-heading text-2xl font-bold text-foreground">What should we call you?</h1>
            <p className="text-sm text-muted-foreground">
              This is the name people see on your profile and in Community. Your email and wallet stay private.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameStep" className="text-sm font-medium flex items-center gap-2">
              <User className="w-4 h-4" />
              Your name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="nameStep"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="The name people know you by"
              maxLength={50}
              autoFocus
              disabled={saving}
              className={error ? 'border-destructive' : ''}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <Button type="submit" className="w-full h-12 font-semibold" disabled={saving}>
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save and continue'}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()} disabled={saving}>
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
