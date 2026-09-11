import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useOverlayFlag } from '@/lib/overlayFlag';

/**
 * The counts on a profile, made worth tapping.
 *
 * They were six figures in six boxes, and a figure on its own tells somebody
 * almost nothing: 340 points is meaningless until you know what points are
 * for. Every tile now opens a short panel that says in plain words what the
 * number is, and gives the one or two things a person can actually do about
 * it, so the row stops being decoration and starts being a way in.
 */

export interface StatAction {
  label: string;
  /** A route to go to. */
  to?: string;
  /** Or something to run, for anything that is not a page. */
  run?: () => void;
}

export interface StatTileSpec {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  /** Tailwind text colour for the icon. */
  tone?: string;
  /** What this number actually means, in one or two sentences. */
  meaning: string;
  /** How to make it go up, when there is something to say. */
  nextStep?: string;
  actions?: StatAction[];
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString() : '0';
}

export function StatTiles({ stats, className = '' }: { stats: StatTileSpec[]; className?: string }) {
  const navigate = useNavigate();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = stats.find((s) => s.key === openKey) ?? null;

  useOverlayFlag(Boolean(open));

  useEffect(() => {
    if (openKey && !stats.some((s) => s.key === openKey)) setOpenKey(null);
  }, [openKey, stats]);

  const runAction = useCallback(
    (action: StatAction) => {
      setOpenKey(null);
      if (action.run) {
        action.run();
        return;
      }
      if (action.to) navigate(action.to);
    },
    [navigate],
  );

  return (
    <>
      <div className={className || 'mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4'}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.key}
              type="button"
              onClick={() => setOpenKey(stat.key)}
              aria-label={`${stat.label}: ${fmt(stat.value)}. What this means.`}
              className="min-h-[104px] rounded-xl border border-border bg-card p-4 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <Icon className={`mx-auto mb-2 h-5 w-5 ${stat.tone ?? 'text-primary'}`} />
              <p className="text-2xl font-bold tabular-nums text-foreground">{fmt(stat.value)}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </button>
          );
        })}
      </div>

      <Sheet open={Boolean(open)} onOpenChange={(v) => !v && setOpenKey(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          {open && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2.5">
                  <open.icon className={`h-5 w-5 ${open.tone ?? 'text-primary'}`} />
                  {open.label}
                </SheetTitle>
              </SheetHeader>
              <p className="mt-2 font-heading text-4xl font-bold tabular-nums text-foreground">{fmt(open.value)}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{open.meaning}</p>
              {open.nextStep && (
                <p className="mt-2 text-sm leading-relaxed text-foreground">{open.nextStep}</p>
              )}
              {open.actions && open.actions.length > 0 && (
                <div className="mt-5 flex flex-col gap-2 pb-2 sm:flex-row">
                  {open.actions.map((a, i) => (
                    <Button
                      key={a.label}
                      onClick={() => runAction(a)}
                      variant={i === 0 ? 'default' : 'outline'}
                      className="h-11 flex-1"
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

export default StatTiles;
