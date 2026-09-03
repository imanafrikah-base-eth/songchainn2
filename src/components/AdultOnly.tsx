import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Lock } from 'lucide-react';
import { useCompliance } from '@/hooks/useCompliance';
import { ADULT_AGE, MIN_AGE } from '@/legal/policies';

/**
 * The four doors the Terms close to under-18s, in one place.
 *
 * Clause 3 of the Terms and section 8 of the Privacy Notice both say that an
 * account between 13 and 18 cannot use private messaging, cannot upload
 * photographs or video, cannot launch a token, and cannot take part in anything
 * involving money. Until now that was a sentence with nothing behind it: every
 * one of those four was open to everybody, and `isAdult` was computed on every
 * page load and read by nobody.
 *
 * TWO STATES, AND THEY ARE NOT THE SAME THING.
 *
 * `isAdult` is false when the age is UNKNOWN as well as when it is under 18,
 * which is the right default for deciding what to allow but a terrible one for
 * deciding what to SAY. Telling somebody they are too young when we simply
 * never asked is both wrong and insulting, and there are 193 accounts on this
 * app from before the age gate existed. So an unknown age is blocked exactly the
 * same, and told the truth: we do not know yet, here is how to tell us.
 */

type Reason = 'messaging' | 'media' | 'launch' | 'money';

const WHAT_IT_IS: Record<Reason, string> = {
  messaging: 'Private messages',
  media: 'Uploading photos and video',
  launch: 'Launching a token',
  money: 'Anything involving money',
};

export function useAdultGate() {
  const { isAdult, ageKnown, isLoading } = useCompliance();
  return {
    isLoading,
    allowed: isAdult,
    /** True when we have simply never asked, which is fixable in one step. */
    needsBirthday: !ageKnown,
  };
}

export function AdultOnly({
  reason,
  children,
  /** Render nothing at all rather than an explanation. For menu items. */
  silent = false,
}: {
  reason: Reason;
  children: ReactNode;
  silent?: boolean;
}) {
  const { allowed, needsBirthday, isLoading } = useAdultGate();

  // Never flash a refusal at somebody while the answer is still loading.
  if (isLoading) return null;
  if (allowed) return <>{children}</>;
  if (silent) return null;

  if (needsBirthday) {
    return (
      <div className="flex gap-3 rounded-xl border border-border bg-card/60 p-4">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="text-sm">
          <p className="font-medium text-foreground">{WHAT_IT_IS[reason]} needs your date of birth.</p>
          <p className="mt-1 text-muted-foreground">
            We have not asked you yet. Add it to your profile and this opens straight away.
          </p>
          <Link to="/profile" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
            Add my date of birth
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card/60 p-4">
      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="text-sm">
        <p className="font-medium text-foreground">{WHAT_IT_IS[reason]} opens at {ADULT_AGE}.</p>
        <p className="mt-1 text-muted-foreground">
          Everything else on SONGCHAINN is open to you from {MIN_AGE}: listening, posting, playlists,
          releasing your own music, and the battles.
        </p>
        <Link to="/terms" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
          Why this is closed
        </Link>
      </div>
    </div>
  );
}
