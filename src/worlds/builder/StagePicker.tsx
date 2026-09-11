import type { WorldStage } from '@/worlds/types';

/**
 * How an unfinished street or city is shown to visitors.
 *
 * There were only two states before: on the map, or put away. So an artist
 * halfway through a gallery had to choose between showing strangers an empty
 * room and hiding the room so nobody knew it was coming. Three states now, and
 * the artist picks per street and per city:
 *
 *   Open        shown and enterable, the normal thing
 *   Coming soon shown on the map, nobody walks in yet
 *   Off the map kept with everything on it, invisible to visitors
 *
 * None of this touches the owner. They walk into everything they made.
 */

const OPTIONS: Array<{ value: WorldStage; label: string; hint: string }> = [
  { value: 'open', label: 'Open', hint: 'Visitors can walk in.' },
  { value: 'soon', label: 'Coming soon', hint: 'On the map, nobody in yet.' },
  { value: 'away', label: 'Off the map', hint: 'Kept, but invisible to visitors.' },
];

export function StagePicker({
  stage,
  onChange,
  label = 'Visitors see',
  className = '',
}: {
  stage: WorldStage | undefined;
  onChange: (next: WorldStage) => void;
  label?: string;
  className?: string;
}) {
  const current: WorldStage = stage ?? 'open';
  const hint = OPTIONS.find((o) => o.value === current)?.hint ?? '';

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
        <span className="mr-0.5 text-[11px] text-muted-foreground">{label}</span>
        {OPTIONS.map((o) => {
          const on = o.value === current;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`min-h-10 rounded-full border px-3 text-xs font-medium transition-colors focus-ring ${
                on
                  ? o.value === 'open'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : o.value === 'soon'
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-500'
                      : 'border-border bg-secondary/60 text-muted-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default StagePicker;
