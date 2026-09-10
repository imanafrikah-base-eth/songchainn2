import { useState } from 'react';
import { X } from 'lucide-react';
import { useCompliance } from '@/hooks/useCompliance';
import { AgeGate } from '@/components/AgeGate';

/**
 * Asks the accounts that existed before we started asking.
 *
 * 193 people signed up when SONGCHAINN never collected a date of birth. The age
 * checks fail closed, which is the right direction to fail but means every one
 * of those accounts silently loses uploads, messaging and the launcher the
 * moment this ships. That is not a policy decision, it is a hole, and this
 * closes it.
 *
 * Deliberately not a hard block. They can put it off and keep listening; the
 * parts that need an age stay shut until they answer, and the app says so where
 * those parts are rather than leaving them wondering. Locking somebody out of
 * music they already had over a question they were never asked would be a worse
 * wrong than the one it fixes.
 */
export function AgePrompt() {
  const { ageKnown, isLoading } = useCompliance();
  const [putOff, setPutOff] = useState(false);

  if (isLoading || ageKnown || putOff) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[55] p-3 sm:left-auto sm:right-4 sm:w-[24rem] sm:p-0 sm:pb-4">
      <div className="live-surface live-surface--raised relative rounded-2xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setPutOff(true)}
          aria-label="Not now"
          className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <AgeGate />
        <p className="px-5 pb-4 text-xs text-muted-foreground">
          You can carry on listening without answering. Messaging, uploads and anything involving
          money stay closed until you do.
        </p>
      </div>
    </div>
  );
}
