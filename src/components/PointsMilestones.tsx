import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useUserPoints } from '@/hooks/useUserPoints';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

// Escalating milestone ladder: quick first win at 10, then widening gaps
// that keep the next target always visible and worth chasing.
const MILESTONES = [10, 50, 150, 400, 1000, 2500, 5000, 10000, 25000];

const MILESTONE_MESSAGES: Record<number, string> = {
  10: 'First 10 points! You are officially on the board.',
  50: '50 points! The community sees you now.',
  150: '150 points! You are becoming a regular.',
  400: '400 points! Silver tier energy.',
  1000: '1,000 points! Real ones remember who showed up early.',
  2500: '2,500 points! GOLD TIER. Phase Two Beta is yours.',
  5000: '5,000 points! Top-tier listener status.',
  10000: '10,000 points! PLATINUM. You are $ongChainn royalty.',
  25000: '25,000 points! Legend. There is no one above you.',
};

function storageKey(userId: string) {
  return `songchainn_points_milestone_${userId}`;
}

/**
 * Watches lifetime points and fires a celebration (confetti + toast) each
 * time the user crosses a milestone. Celebrated milestones persist per user
 * so nobody gets the same party twice.
 */
export function PointsMilestones() {
  const { user } = useAuth();
  const { lifetimePoints, isLoading } = useUserPoints();
  const prefersReducedMotion = usePrefersReducedMotion();
  const firing = useRef(false);

  useEffect(() => {
    if (!user || isLoading || lifetimePoints <= 0 || firing.current) return;

    let celebrated = 0;
    try {
      celebrated = Number(localStorage.getItem(storageKey(user.id)) || 0);
    } catch {
      return; // no storage: skip rather than repeat celebrations forever
    }

    const reached = MILESTONES.filter((m) => m <= lifetimePoints);
    const highest = reached[reached.length - 1] ?? 0;
    if (highest <= celebrated) return;

    // First load for an account that already has history: record silently
    // so we only ever celebrate milestones crossed while the app is open.
    if (celebrated === 0 && reached.length > 1) {
      try { localStorage.setItem(storageKey(user.id), String(highest)); } catch { /* noop */ }
      return;
    }

    firing.current = true;
    try { localStorage.setItem(storageKey(user.id), String(highest)); } catch { /* noop */ }

    const message = MILESTONE_MESSAGES[highest] || `${highest.toLocaleString()} points!`;
    const nextIndex = MILESTONES.indexOf(highest) + 1;
    const next = MILESTONES[nextIndex];

    toast.success(message, {
      description: next
        ? `Next stop: ${next.toLocaleString()} points. Keep playing, sharing, voting.`
        : 'You have cleared every milestone. Respect.',
      duration: 6000,
    });

    if (!prefersReducedMotion) {
      confetti({
        particleCount: Math.min(60 + MILESTONES.indexOf(highest) * 25, 220),
        spread: 75,
        origin: { y: 0.7 },
        colors: ['#22d3ee', '#a855f7', '#facc15'],
      });
    }

    const release = window.setTimeout(() => { firing.current = false; }, 4000);
    return () => window.clearTimeout(release);
  }, [user, lifetimePoints, isLoading, prefersReducedMotion]);

  return null;
}
