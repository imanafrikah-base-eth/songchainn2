import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { POLICY_VERSIONS, ADULT_AGE, MIN_AGE, type PolicyKey } from '@/legal/policies';

/**
 * Age, consent, and whether this account is under a restriction.
 *
 * All three are enforced in the database as well. What lives here is the copy
 * of the answer the interface needs so it can explain itself: a button that
 * silently does nothing because a policy refused it is worse than one that says
 * why it is closed.
 */

export interface ComplianceState {
  dateOfBirth: string | null;
  age: number | null;
  /** Never assume adult. Unknown is its own answer and it is not "yes". */
  isAdult: boolean;
  ageKnown: boolean;
  restrictions: string[];
  isMuted: boolean;
  cannotUpload: boolean;
  cannotMessage: boolean;
  isSuspended: boolean;
}

export function yearsSince(dob: string): number {
  const born = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
}

export function useCompliance() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['compliance', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<ComplianceState> => {
      const [{ data: profile }, { data: actions }] = await Promise.all([
        supabase
          .from('audience_profiles')
          .select('date_of_birth, age_confirmed_at')
          .eq('user_id', user!.id)
          .maybeSingle(),
        supabase
          .from('account_actions' as never)
          .select('kind, status, expires_at')
          .eq('user_id', user!.id)
          .eq('status', 'active'),
      ]);

      const dob = (profile as { date_of_birth?: string | null } | null)?.date_of_birth ?? null;
      const age = dob ? yearsSince(dob) : null;

      const now = Date.now();
      const live = ((actions ?? []) as { kind: string; expires_at: string | null }[]).filter(
        (a) => !a.expires_at || new Date(a.expires_at).getTime() > now,
      );
      const kinds = live.map((a) => a.kind);

      return {
        dateOfBirth: dob,
        age,
        isAdult: age !== null && age >= ADULT_AGE,
        ageKnown: age !== null,
        restrictions: kinds,
        isMuted: kinds.includes('mute'),
        cannotUpload: kinds.includes('no_upload'),
        cannotMessage: kinds.includes('no_messaging'),
        isSuspended: kinds.includes('suspension') || kinds.includes('ban'),
      };
    },
  });

  return {
    isLoading,
    ...(data ?? {
      dateOfBirth: null,
      age: null,
      isAdult: false,
      ageKnown: false,
      restrictions: [],
      isMuted: false,
      cannotUpload: false,
      cannotMessage: false,
      isSuspended: false,
    }),
  };
}

/**
 * Record that somebody agreed to something, at the moment they did it.
 *
 * Idempotent per version, so a person who uploads forty times has one
 * acceptance for the upload terms rather than forty. Never blocks the action:
 * failing to write a consent row is our problem to notice, not a reason to stop
 * an artist mid-upload.
 */
export function useRecordConsent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useCallback(
    async (policy: PolicyKey, context?: string) => {
      if (!user?.id) return;
      // An upsert that keeps the first row: accepting the same version twice is
      // the normal case (sign-up, then onboarding) and used to answer 409 to
      // the browser, which the console reported as an error every time.
      const { error } = await (supabase.from('policy_acceptances' as never) as any).upsert(
        {
          user_id: user.id,
          policy_key: policy,
          version: POLICY_VERSIONS[policy],
          context: context ?? null,
        },
        { onConflict: 'user_id,policy_key,version', ignoreDuplicates: true },
      );
      if (error && error.code !== '23505') {
        console.error('could not record consent', policy, error);
      }
      await queryClient.invalidateQueries({ queryKey: ['consent', user.id] });
    },
    [user?.id, queryClient],
  );
}

/** Save a date of birth. Refuses anyone below the floor. */
export function useSetDateOfBirth() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useCallback(
    async (dob: string): Promise<{ ok: boolean; age?: number; message?: string }> => {
      if (!user?.id) return { ok: false, message: 'Sign in first.' };
      const age = yearsSince(dob);
      if (!Number.isFinite(age) || age < 0 || age > 120) {
        return { ok: false, message: 'That date does not look right.' };
      }
      if (age < MIN_AGE) {
        return {
          ok: false,
          age,
          message: `You need to be at least ${MIN_AGE} to have an account here.`,
        };
      }
      const { data, error } = await supabase
        .from('audience_profiles')
        .update({
          date_of_birth: dob,
          age_confirmed_at: new Date().toISOString(),
        } as never)
        .eq('user_id', user.id)
        .select('user_id');
      if (error) return { ok: false, message: error.message };
      if (!data || (data as unknown[]).length === 0) {
        return { ok: false, message: 'That did not save. Try again.' };
      }
      await queryClient.invalidateQueries({ queryKey: ['compliance', user.id] });
      return { ok: true, age };
    },
    [user?.id, queryClient],
  );
}
