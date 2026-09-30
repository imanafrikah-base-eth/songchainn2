import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

interface ThankYou {
  id: string;
  title: string;
  message: string;
  points: number;
}

/**
 * When someone who reported a problem opens their messages after it is fixed,
 * the fix is the first thing they see, with the points they earned for
 * telling us, and a little confetti before either. The note is a notification
 * with metadata.kind = 'thank_you'; it shows once and is marked read when
 * they close it.
 */
export function ThankYouCelebration() {
  const { user } = useAuth();
  const [note, setNote] = useState<ThankYou | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from('notifications')
      .select('id, title, message, metadata')
      .eq('user_id', user.id)
      .eq('is_read', false)
      .filter('metadata->>kind', 'eq', 'thank_you')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const row = data as { id: string; title: string | null; message: string | null; metadata: { points?: unknown } | null };
        const points = Number(row.metadata?.points ?? 0);
        setNote({
          id: row.id,
          title: row.title || 'Fixed, thanks to you',
          message: row.message || '',
          points: Number.isFinite(points) ? points : 0,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!note) return;
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#22d3ee', '#a855f7', '#facc15'];
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors });
    const left = window.setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors }), 350);
    const right = window.setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors }), 700);
    return () => {
      window.clearTimeout(left);
      window.clearTimeout(right);
    };
  }, [note]);

  const close = async () => {
    const id = note?.id;
    setNote(null);
    if (id) await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  if (!note) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="thank-you-title"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Fixed, thanks to you</span>
        </div>
        <h2 id="thank-you-title" className="text-lg font-semibold text-foreground">
          {note.title}
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{note.message}</p>
        {note.points > 0 && (
          <div className="mt-4 inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
            +{note.points} points for reporting it
          </div>
        )}
        <Button className="mt-5 min-h-11 w-full" onClick={() => void close()}>
          Love it
        </Button>
      </div>
    </div>
  );
}
