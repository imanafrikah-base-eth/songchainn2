import { useMemo, useState } from 'react';
import type { DayCount } from '@/lib/songDetails';

/**
 * Thirty days of plays as thin bars on one scale.
 *
 * One series, one hue (the app's primary), so it needs no legend: the title
 * above it names the measure. Marks are thin with rounded tops sitting on a
 * real baseline, the grid is a single recessive line at the top value, and
 * the only labels are the ones a reader needs: the first and last day and
 * the peak. Hovering a day shows its count; text always wears text tokens,
 * never the series colour.
 */
export function DayBars({ data, height = 96, className = '' }: { data: DayCount[]; height?: number; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.plays)), [data]);
  const W = 600;
  const H = height;
  const padTop = 14;
  const padBottom = 18;
  const plotH = H - padTop - padBottom;
  const n = Math.max(1, data.length);
  const gap = 2;
  const barW = (W - gap * (n - 1)) / n;
  const fmt = (iso: string) => {
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };
  const peakIndex = data.reduce((best, d, i) => (d.plays > (data[best]?.plays ?? -1) ? i : best), 0);
  const active = hover ?? (data[peakIndex]?.plays ? peakIndex : null);

  if (!data.length) return null;

  return (
    <div className={`relative ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Plays per day, last 30 days" style={{ minHeight: height }}>
        {/* one grid line, at the top value */}
        <line x1={0} x2={W} y1={padTop} y2={padTop} stroke="currentColor" className="text-border" strokeWidth={1} />
        <line x1={0} x2={W} y1={H - padBottom} y2={H - padBottom} stroke="currentColor" className="text-border" strokeWidth={1} />
        {data.map((d, i) => {
          const h = (d.plays / max) * plotH;
          const x = i * (barW + gap);
          const y = H - padBottom - h;
          const isActive = active === i;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* hit target wider than the mark */}
              <rect x={x - gap / 2} y={padTop} width={barW + gap} height={plotH} fill="transparent" />
              <rect
                x={x}
                y={d.plays > 0 ? y : H - padBottom - 1.5}
                width={barW}
                height={d.plays > 0 ? Math.max(h, 2) : 1.5}
                rx={Math.min(3, barW / 2)}
                className={isActive ? 'fill-primary' : d.plays > 0 ? 'fill-primary/60' : 'fill-muted-foreground/25'}
              />
            </g>
          );
        })}
        <text x={0} y={H - 4} className="fill-muted-foreground" fontSize={11}>{fmt(data[0].day)}</text>
        <text x={W} y={H - 4} textAnchor="end" className="fill-muted-foreground" fontSize={11}>{fmt(data[data.length - 1].day)}</text>
        {active !== null && data[active] && (
          <text
            x={Math.min(W - 4, Math.max(4, active * (barW + gap) + barW / 2))}
            y={padTop - 4}
            textAnchor={active < n / 5 ? 'start' : active > (n * 4) / 5 ? 'end' : 'middle'}
            className="fill-foreground"
            fontSize={11}
            fontWeight={600}
          >
            {data[active].plays.toLocaleString()} {data[active].plays === 1 ? 'play' : 'plays'} on {fmt(data[active].day)}
          </text>
        )}
      </svg>
    </div>
  );
}
