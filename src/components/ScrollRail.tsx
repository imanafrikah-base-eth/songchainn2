import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A row that runs sideways, and can be moved sideways on any device.
 *
 * On a phone a hidden-scrollbar row is fine, a thumb swipes it. On a computer
 * it was a dead end: no scrollbar, a mouse wheel that only goes up and down,
 * and artists past the edge nobody could reach (founder, 14 Sep 2026). So:
 *
 * - arrow buttons on either side, shown on a mouse screen only while there is
 *   more that way, each moving the row most of a screen;
 * - the edges fade where more is hidden, so the row says it continues;
 * - click and drag with the mouse, the way a phone swipes (a drag never also
 *   counts as a click on the artist it started on);
 * - trackpads and touch keep scrolling it natively.
 */
export function ScrollRail({
  children,
  className,
  listClassName,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Classes for the scrolling list itself (gap, padding). */
  listClassName?: string;
  /** What the row is, for screen readers and the arrow labels. */
  label: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const drag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    // Pictures arriving late change the width.
    const imgs = Array.from(el.querySelectorAll('img'));
    imgs.forEach((img) => img.addEventListener('load', measure));
    return () => {
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
      imgs.forEach((img) => img.removeEventListener('load', measure));
    };
  }, [measure, children]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className={cn('group/rail relative', className)} role="region" aria-label={label}>
      <ul
        ref={ref}
        className={cn(
          'flex overflow-x-auto scrollbar-hide overscroll-x-contain',
          // Fade whichever edge has more behind it.
          canLeft && canRight
            ? '[mask-image:linear-gradient(to_right,transparent,black_2.5rem,black_calc(100%-2.5rem),transparent)]'
            : canRight
              ? '[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]'
              : canLeft
                ? '[mask-image:linear-gradient(to_right,transparent,black_2.5rem)]'
                : '',
          listClassName,
        )}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse' || e.button !== 0 || !ref.current) return;
          drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const el = ref.current;
          if (!d || !el || e.pointerId !== d.id) return;
          const dx = e.clientX - d.x;
          if (!d.moved && Math.abs(dx) < 6) return;
          if (!d.moved) {
            d.moved = true;
            el.setPointerCapture(e.pointerId);
            el.style.cursor = 'grabbing';
            el.style.userSelect = 'none';
          }
          el.scrollLeft = d.left - dx;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          const el = ref.current;
          drag.current = null;
          if (!d || !el) return;
          if (d.moved) {
            suppressClick.current = true;
            if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
          }
          el.style.cursor = '';
          el.style.userSelect = '';
        }}
        onPointerCancel={() => {
          drag.current = null;
          if (ref.current) {
            ref.current.style.cursor = '';
            ref.current.style.userSelect = '';
          }
        }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        {children}
      </ul>

      {canLeft && (
        <button
          type="button"
          onClick={() => page(-1)}
          aria-label={`Scroll ${label} left`}
          className="absolute left-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-[60%] items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-lg transition-opacity hover:bg-muted [@media(pointer:fine)]:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          onClick={() => page(1)}
          aria-label={`Scroll ${label} right`}
          className="absolute right-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-[60%] items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-lg transition-opacity hover:bg-muted [@media(pointer:fine)]:flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

export default ScrollRail;
