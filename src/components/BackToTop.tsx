import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * The way back up, and a quiet sense of how far down you are.
 *
 * Long pages here (an artist's catalogue, the community, a world) had no way
 * back to the top but flicking, which on a phone with two hundred songs is a
 * lot of flicking. This is the control every good reading app has and this one
 * did not.
 *
 * Two things make it worth more than a plain button. It draws the page's own
 * progress around itself, so the ring doubles as "how much is left", and it
 * stays out of the way until it is wanted: nothing appears until you are well
 * past the first screen and heading down.
 *
 * WHERE IT LIVES. Globally, beside the tab bar rather than inside it, because
 * BottomTabBar returns null the moment a song is playing and that is exactly
 * when a page is longest. It parks above the bar and above the safe area, and
 * steps aside for the drawer and for Mo$ha's tab on the right edge.
 *
 * The feed is left out on purpose: it scrolls its own snap container, not the
 * window, and it has its own way home.
 */

/** Nothing shows until the page is this far down. */
const SHOW_AFTER_SCREENS = 1.5;

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const read = () => {
      frame.current = null;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setVisible(y > window.innerHeight * SHOW_AFTER_SCREENS);
      setProgress(height > 0 ? Math.min(1, Math.max(0, y / height)) : 0);
    };
    const onScroll = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  /* The navigation writes this on the body when its drawer is open. Mo$ha's
     tab already reads it to step aside, and this does the same rather than
     sitting on top of an open menu. */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const check = () => setMenuOpen(document.body.dataset.menuOpen === 'true');
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-menu-open'] });
    return () => observer.disconnect();
  }, []);

  const toTop = useCallback(() => {
    const gentle = !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    window.scrollTo({ top: 0, behavior: gentle ? 'smooth' : 'auto' });
  }, []);

  if (!visible || menuOpen) return null;

  // A 44px ring, drawn as a circle whose dash gap is the part still to go.
  const R = 20;
  const CIRCUMFERENCE = 2 * Math.PI * R;

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label={`Back to the top. You are ${Math.round(progress * 100)}% down this page.`}
      className="fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 lg:right-6"
      /* Clears the tab bar by 20px, and the mini player too. The player takes
         the bar's place when a song is on and stands a little taller, which
         left barely three pixels between them at the old 4.75rem. */
      style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <svg className="pointer-events-none absolute inset-0 h-12 w-12 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-border"
        />
        <circle
          cx="24"
          cy="24"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-primary"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
        />
      </svg>
      <ArrowUp className="relative h-5 w-5" aria-hidden="true" />
    </button>
  );
}

export default BackToTop;
