import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSetDateOfBirth, useRecordConsent, useCompliance } from '@/hooks/useCompliance';
import { MIN_AGE, ADULT_AGE } from '@/legal/policies';

/**
 * Asks for a date of birth once, and holds the account to it.
 *
 * A tickbox saying "I am over 18" is worth almost nothing: nobody reads it,
 * everybody ticks it, and it tells us nothing we could act on. A date is a
 * statement a person made, which we store, which decides what the app opens,
 * and which they can be held to if it was false.
 *
 * Nobody is refused for being young. Under 13 cannot have an account at all,
 * and between 13 and 18 the app simply closes the parts that should be closed:
 * private messaging, uploads, and anything involving money. Everything else,
 * the music, the worlds, the feed, stays open.
 */

export function AgeGate({ onDone }: { onDone?: () => void }) {
  const setDob = useSetDateOfBirth();
  const recordConsent = useRecordConsent();
  const { ageKnown } = useCompliance();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooYoung, setTooYoung] = useState(false);

  if (ageKnown) return null;

  const submit = async () => {
    setError(null);
    if (!value) {
      setError('Pick your date of birth.');
      return;
    }
    setSaving(true);
    const res = await setDob(value);
    setSaving(false);
    if (!res.ok) {
      setError(res.message ?? 'That did not work.');
      if (res.age !== undefined && res.age < MIN_AGE) setTooYoung(true);
      return;
    }
    await recordConsent('terms', 'age_gate');
    await recordConsent('privacy', 'age_gate');
    await recordConsent('guidelines', 'age_gate');
    onDone?.();
  };

  if (tooYoung) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Come back in a few years
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          You need to be at least {MIN_AGE} to have an account here. That is not us being
          difficult, it is the law we have to work inside. The music is not going anywhere.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <CalendarDays className="mb-3 h-6 w-6 text-primary" />
      <h2 className="font-heading text-lg font-semibold text-foreground">When were you born?</h2>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        We ask once. It decides which parts of SONGCHAINN are open to you, and we have to know
        rather than guess. Under {ADULT_AGE} the app keeps private messaging, uploads and anything
        involving money closed. Everything else works the same.
      </p>

      <input
        type="date"
        value={value}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => setValue(e.target.value)}
        className="mt-4 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
      />

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <Button onClick={() => void submit()} disabled={saving} className="mt-4 h-11 w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
      </Button>

      <p className="mt-3 text-xs text-muted-foreground">
        By continuing you agree to the{' '}
        <Link to="/terms" className="text-primary underline-offset-2 hover:underline">
          Terms
        </Link>
        , the{' '}
        <Link to="/privacy" className="text-primary underline-offset-2 hover:underline">
          Privacy Policy
        </Link>{' '}
        and the{' '}
        <Link to="/guidelines" className="text-primary underline-offset-2 hover:underline">
          Community Guidelines
        </Link>
        . Giving a false age is a breach of the Terms.
      </p>
    </div>
  );
}
