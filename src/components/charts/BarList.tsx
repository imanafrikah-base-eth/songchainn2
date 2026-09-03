/**
 * A ranked list with a proportional bar behind each value.
 *
 * Magnitude in one hue; identity is the label, never a colour. Values sit in
 * tabular figures so a column of them lines up. Empty is a sentence, not a
 * blank.
 */
export function BarList({
  items,
  emptyText,
  className = '',
}: {
  items: Array<{ label: string; sub?: string | null; value: number }>;
  emptyText: string;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className={`text-xs text-muted-foreground ${className}`}>{emptyText}</p>;
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {items.map((it) => (
        <li key={it.label + (it.sub ?? '')} className="relative overflow-hidden rounded-md">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-md bg-primary/15"
            style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }}
          />
          <div className="relative flex items-center justify-between gap-3 px-2 py-1 text-sm">
            <span className="min-w-0 truncate text-foreground">
              {it.label}
              {it.sub ? <span className="ml-1.5 text-xs text-muted-foreground">{it.sub}</span> : null}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{it.value.toLocaleString()}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
