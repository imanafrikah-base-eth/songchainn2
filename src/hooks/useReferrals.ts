import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Referrals.
 *
 * This used to be entirely localStorage: the code was minted on the referrer's
 * own device, the points were a number in their own browser, and a friend who
 * signed up with the code had no way to credit anyone, because the code did not
 * exist anywhere but on that one phone. The screen said "Earn 100 points per
 * friend" and nothing behind it was true.
 *
 * It now runs on `referral_codes` / `referrals` with two security-definer RPCs,
 * and awards into the same points ledger everything else uses. One redemption
 * per person, enforced by a unique constraint rather than by hope.
 */

const PENDING_CODE_KEY = 'songchainn:pending-referral-code';

export interface ReferralStats {
  code: string | null;
  invited: number;
  pointsEarned: number;
}

/** Capture ?ref=CODE from the URL before sign-in, so it survives the round trip. */
export function capturePendingReferralCode() {
  try {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code && code.trim()) {
      localStorage.setItem(PENDING_CODE_KEY, code.trim().toUpperCase());
    }
  } catch {
    /* restricted storage: the code is simply not remembered */
  }
}

function readPendingCode(): string | null {
  try {
    return localStorage.getItem(PENDING_CODE_KEY);
  } catch {
    return null;
  }
}

function clearPendingCode() {
  try {
    localStorage.removeItem(PENDING_CODE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function useReferrals() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReferralStats>({ code: null, invited: 0, pointsEarned: 0 });
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_referral_stats');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      // A person who has never invited anyone has no code yet, and the invite
      // link said "not ready" forever. Mint it the first time they look.
      let code: string | null = row?.code ?? null;
      if (!code) {
        const { data: minted } = await supabase.rpc('get_or_create_my_referral_code');
        if (typeof minted === 'string' && minted) code = minted;
      }
      setStats({
        code,
        invited: Number(row?.invited ?? 0),
        pointsEarned: Number(row?.points_earned ?? 0),
      });
    } catch {
      // Never block the screen on this; the invite panel degrades to "unavailable".
      setStats((prev) => prev);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  /** Redeem a code. Returns true when points were actually awarded. */
  const redeemCode = useCallback(
    async (code: string, { silent = false }: { silent?: boolean } = {}) => {
      if (!user) return false;
      try {
        const { data, error } = await supabase.rpc('redeem_referral_code', { _code: code });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.ok) {
          toast({
            title: 'Invite accepted',
            description: `You picked up ${row.points_awarded} points to start.`,
          });
          void refresh();
          return true;
        }
        if (!silent && row?.message) {
          toast({ title: row.message, variant: 'destructive' });
        }
        return false;
      } catch {
        if (!silent) toast({ title: 'Could not apply that invite code', variant: 'destructive' });
        return false;
      }
    },
    [user, refresh],
  );

  const getInviteLink = useCallback(
    () => (stats.code ? `${window.location.origin}/?ref=${stats.code}` : ''),
    [stats.code],
  );

  const copyInviteLink = useCallback(async () => {
    const link = getInviteLink();
    if (!link) {
      toast({ title: 'Invite link not ready yet', variant: 'destructive' });
      return false;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Invite link copied' });
      return true;
    } catch {
      toast({ title: 'Could not copy the link', variant: 'destructive' });
      return false;
    }
  }, [getInviteLink]);

  const shareInviteLink = useCallback(async () => {
    const link = getInviteLink();
    if (!link) {
      toast({ title: 'Invite link not ready yet', variant: 'destructive' });
      return false;
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join $ongChainn',
          text: 'Music straight from the artists who made it. Use my invite and we both start with points.',
          url: link,
        });
        return true;
      } catch {
        return copyInviteLink();
      }
    }
    return copyInviteLink();
  }, [getInviteLink, copyInviteLink]);

  useEffect(() => {
    if (!user) return;
    void refresh();
    // A code captured before sign-up is redeemed the moment there is a session.
    const pending = readPendingCode();
    if (pending) {
      void redeemCode(pending, { silent: true }).finally(clearPendingCode);
    }
  }, [user, refresh, redeemCode]);

  return {
    referralCode: stats.code,
    invited: stats.invited,
    pointsEarned: stats.pointsEarned,
    isLoading,
    refresh,
    redeemCode,
    getInviteLink,
    copyInviteLink,
    shareInviteLink,
    // Kept for the existing invite panel.
    completedReferrals: stats.invited,
    totalPointsEarned: stats.pointsEarned,
  };
}
