import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

interface Referral {
  id: string;
  referral_code: string;
  referred_user_id: string | null;
  points_earned: number;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface UserPoints {
  total_points: number;
}

const REFERRAL_CODE_KEY = 'songchainn:referralCodesByUserId';
const USER_POINTS_KEY = 'songchainn:userPointsByUserId';
const REFERRALS_KEY = 'songchainn:referralsByReferrerId';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function useReferrals() {
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [points, setPoints] = useState<UserPoints | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Generate a unique referral code
  const generateReferralCode = useCallback(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'SC-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }, []);

  // Fetch user's referral code or create one
  const fetchOrCreateReferralCode = useCallback(async () => {
    if (!user) return;

    try {
      const map = readJson<Record<string, string>>(REFERRAL_CODE_KEY, {});
      const existing = map[user.id];
      if (existing) {
        setReferralCode(existing);
        return;
      }

      let next = generateReferralCode();
      const used = new Set(Object.values(map));
      for (let i = 0; i < 20 && used.has(next); i++) {
        next = generateReferralCode();
      }

      map[user.id] = next;
      writeJson(REFERRAL_CODE_KEY, map);
      setReferralCode(next);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error in fetchOrCreateReferralCode:', error);
      }
    }
  }, [user, generateReferralCode]);

  // Fetch user's referrals
  const fetchReferrals = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const byReferrer = readJson<Record<string, Referral[]>>(REFERRALS_KEY, {});
      const list = byReferrer[user.id] || [];
      setReferrals([...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error in fetchReferrals:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Fetch user's points
  const fetchPoints = useCallback(async () => {
    if (!user) return;

    try {
      const map = readJson<Record<string, number>>(USER_POINTS_KEY, {});
      setPoints({ total_points: map[user.id] || 0 });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error in fetchPoints:', error);
      }
    }
  }, [user]);

  // Get referral invite link
  const getInviteLink = useCallback(() => {
    if (!referralCode) return '';
    return `${window.location.origin}/?ref=${referralCode}`;
  }, [referralCode]);

  // Copy invite link
  const copyInviteLink = useCallback(async () => {
    const link = getInviteLink();
    if (!link) {
      toast({ title: 'No referral code available', variant: 'destructive' });
      return false;
    }

    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Invite link copied!' });
      return true;
    } catch {
      toast({ title: 'Failed to copy link', variant: 'destructive' });
      return false;
    }
  }, [getInviteLink]);

  // Share invite link
  const shareInviteLink = useCallback(async () => {
    const link = getInviteLink();
    if (!link) {
      toast({ title: 'No referral code available', variant: 'destructive' });
      return false;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join $ongChainn!',
          text: 'Join me on $ongChainn and discover amazing music! Use my invite link to sign up and we both earn rewards.',
          url: link,
        });
        return true;
      } catch {
        // User cancelled or error - fallback to copy
        return copyInviteLink();
      }
    } else {
      return copyInviteLink();
    }
  }, [getInviteLink, copyInviteLink]);

  // Initialize
  useEffect(() => {
    if (user) {
      fetchOrCreateReferralCode();
      fetchReferrals();
      fetchPoints();
    }
  }, [user, fetchOrCreateReferralCode, fetchReferrals, fetchPoints]);

  return {
    referrals,
    points,
    referralCode,
    isLoading,
    getInviteLink,
    copyInviteLink,
    shareInviteLink,
    completedReferrals: referrals.filter(r => r.status === 'completed').length,
    totalPointsEarned: referrals.reduce((sum, r) => sum + r.points_earned, 0),
  };
}
