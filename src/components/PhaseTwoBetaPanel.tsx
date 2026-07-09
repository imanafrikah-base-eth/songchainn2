import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Sparkles, Star, Loader2, CheckCircle2, ArrowRight, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useUserPoints } from '@/hooks/useUserPoints';
import { supabase } from '@/integrations/supabase/client';
import { TileBackdrop } from '@/components/AmbientBackground';
import { CARD_TILES } from '@/data/backgroundPools';
import { cn } from '@/lib/utils';

const GOLD_THRESHOLD = 2500;

/**
 * Phase Two Beta panel: visibly locked for everyone so the whole community
 * sees it exists, open only to OG members and Gold tier and above. Beta
 * testers file review reports (rating + notes) straight into Supabase.
 */
export function PhaseTwoBetaPanel() {
  const { user } = useAuth();
  const { tier, isOg, lifetimePoints, isLoading } = useUserPoints();
  const queryClient = useQueryClient();

  const hasAccess = isOg || tier === 'Gold' || tier === 'Platinum';

  const [rating, setRating] = useState(0);
  const [report, setReport] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: myReports = [] } = useQuery({
    queryKey: ['beta-reports', user?.id],
    enabled: !!user && hasAccess,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('phase_two_beta_reports')
        .select('id, rating, report, created_at')
        .order('created_at', { ascending: false })
        .limit(3);
      return data || [];
    },
  });

  const handleSubmit = async () => {
    if (!user || rating === 0 || report.trim().length < 3) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from('phase_two_beta_reports').insert({
        user_id: user.id,
        rating,
        report: report.trim(),
      });
      if (error) throw error;
      toast.success('Beta report filed. Thank you for shaping Phase Two!');
      setRating(0);
      setReport('');
      queryClient.invalidateQueries({ queryKey: ['beta-reports', user.id] });
    } catch (err: any) {
      toast.error(err?.message || 'Could not save your report. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return null;

  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-purple-400/25 mb-6 sm:mb-10 p-4 sm:p-6">
      <TileBackdrop image={CARD_TILES.marketplace} opacity={hasAccess ? 0.3 : 0.2} />

      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide',
            hasAccess ? 'bg-purple-500/90 text-white' : 'bg-background/70 text-muted-foreground border border-border/50'
          )}
        >
          {hasAccess ? <FlaskConical className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          Phase Two Beta
        </span>
        {hasAccess && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[11px] font-semibold">
            <CheckCircle2 className="w-3 h-3" />
            Access granted
          </span>
        )}
      </div>

      {hasAccess ? (
        <>
          <h2 className="font-heading text-lg sm:text-xl text-foreground">
            You are in early. File your beta review report.
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 mb-4 max-w-xl">
            As {isOg ? 'an OG member' : `a ${tier} member`} you help decide what ships. Rate the
            Phase Two experience and tell us what works, what breaks, and what is missing.
          </p>

          <div className="flex items-center gap-1.5 mb-3">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                aria-label={`Rate ${value} of 5`}
                className="p-0.5"
              >
                <Star
                  className={cn(
                    'w-6 h-6 transition-colors',
                    value <= rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/40'
                  )}
                />
              </button>
            ))}
          </div>

          <Textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            placeholder="Your beta report: what is working, what is broken, what should Phase Two add next?"
            maxLength={2000}
            className="min-h-[90px] bg-background/70 border-border/50 rounded-xl mb-3"
          />

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || rating === 0 || report.trim().length < 3}
              className="rounded-full gradient-primary text-primary-foreground"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              File beta report
            </Button>
            {myReports.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {myReports.length} report{myReports.length > 1 ? 's' : ''} filed. Keep them coming.
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <h2 className="font-heading text-lg sm:text-xl text-foreground flex items-center gap-2">
            Early access is earned, not given.
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 mb-4 max-w-xl">
            OG members and Gold tier listeners get the Phase Two beta first: new marketplace
            powers, early drops, and a direct line to shape the app with beta review reports.
          </p>

          <div className="rounded-xl bg-background/70 border border-border/50 p-3 mb-4 max-w-md">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Your tier: <span className="text-foreground font-semibold">{tier}</span></span>
              <span className="text-muted-foreground">{Math.min(lifetimePoints, GOLD_THRESHOLD).toLocaleString()} / {GOLD_THRESHOLD.toLocaleString()} pts</span>
            </div>
            <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
              <div
                className="h-full rounded-full gradient-primary transition-all duration-700"
                style={{ width: `${Math.min(100, (lifetimePoints / GOLD_THRESHOLD) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {lifetimePoints >= GOLD_THRESHOLD
                ? 'Gold reached. Your access unlocks shortly.'
                : `${(GOLD_THRESHOLD - lifetimePoints).toLocaleString()} points to Gold. Play, share, and show up daily.`}
            </p>
          </div>

          <Button asChild variant="outline" className="rounded-full border-purple-400/40 text-purple-300 hover:bg-purple-500/10">
            <Link to="/leaderboard">
              See how points work
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </>
      )}
    </section>
  );
}
