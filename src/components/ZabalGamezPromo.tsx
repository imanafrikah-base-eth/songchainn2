import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import zabalLogo from '@/assets/zabal/zabal gamez logo.jpg';

const DISMISS_KEY = 'songchainn_zabal_promo_dismissed_v1';

/**
 * Promo for the Zabal Gamez Musician Track (About page section).
 * - "strip": slim always-on banner for the pre-auth landing page.
 * - "card": dismissible card for inside the app (Home).
 */
export function ZabalGamezPromo({ variant }: { variant: 'strip' | 'card' }) {
  const [dismissed, setDismissed] = useState(() => {
    if (variant !== 'card') return false;
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      void 0;
    }
  };

  if (variant === 'strip') {
    return (
      <Link
        to="/about#zabal-gamez"
        className="block border-b border-orange-500/25 bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-orange-500/15 hover:from-orange-500/25 hover:to-orange-500/25 transition-colors"
      >
        <div className="max-w-[1400px] mx-auto px-3 md:px-5 py-2 flex items-center justify-center gap-2 text-center">
          <Trophy className="w-4 h-4 text-orange-400 shrink-0" />
          <span className="text-xs sm:text-sm text-foreground">
            <span className="font-semibold text-orange-400">Musicians:</span> Join the Zabal Gamez
            Artist Track. Free entry, grab the cypher beat and drop your verse.
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-orange-400 shrink-0" />
        </div>
      </Link>
    );
  }

  return (
    <section className="mb-4 sm:mb-6 relative overflow-hidden rounded-2xl border border-orange-500/25 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-background p-3 sm:p-4">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pr-6">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <img
            src={zabalLogo}
            alt="Zabal Gamez"
            className="h-14 w-14 rounded-xl object-cover border border-orange-500/30 shrink-0"
            loading="lazy"
          />
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-semibold text-foreground">
              Are you a musician? Zabal Gamez is open.
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Free Artist Track by THE ZAO. Download the cypher beat, record your verse, and enter
              right here on $ongChainn.
            </p>
          </div>
        </div>
        <Link to="/about#zabal-gamez" className="shrink-0">
          <Button
            size="sm"
            className="gap-1.5 bg-orange-500/90 hover:bg-orange-500 text-white border-0"
          >
            <Trophy className="w-3.5 h-3.5" />
            Join the Artist Track
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    </section>
  );
}
