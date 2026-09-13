import { Disc3, Library, ListMusic, Music2, Radio, Users } from 'lucide-react';
import type { ReleaseKind } from '@/hooks/useReleases';

/**
 * What is being released, asked first, the way every distributor asks it.
 * Single, EP, Album, Mixtape and Compilation are releases; Catalog is a bulk
 * upload of back catalogue where every song stays its own single.
 */
export type ReleaseType = 'single' | 'ep' | 'album' | 'mixtape' | 'compilation' | 'catalog';

export const RELEASE_TYPES: Array<{ value: ReleaseType; label: string; hint: string; Icon: typeof Disc3 }> = [
  { value: 'single', label: 'Single', hint: 'One track', Icon: Music2 },
  { value: 'ep', label: 'EP', hint: 'Usually 2 to 6 tracks', Icon: Disc3 },
  { value: 'album', label: 'Album', hint: 'Usually 7 or more', Icon: ListMusic },
  { value: 'mixtape', label: 'Mixtape', hint: 'A run of tracks, your way', Icon: Radio },
  { value: 'compilation', label: 'Compilation', hint: 'Tracks gathered together', Icon: Users },
  { value: 'catalog', label: 'Catalog', hint: 'Many songs, each its own single', Icon: Library },
];

/** A type that makes one releases row holding every track. */
export function isCollection(t: ReleaseType): t is Exclude<ReleaseType, 'single' | 'catalog'> {
  return t === 'ep' || t === 'album' || t === 'mixtape' || t === 'compilation';
}

export function releaseKindOf(t: ReleaseType): ReleaseKind | null {
  return isCollection(t) ? t : null;
}

export function typeLabel(t: ReleaseType): string {
  return RELEASE_TYPES.find((r) => r.value === t)?.label ?? 'Release';
}

/** Advice on the track count. It never stops a send. */
export function countAdvice(t: ReleaseType, n: number): string | null {
  if (n === 0) return null;
  switch (t) {
    case 'single':
      return n > 1 ? `A single is one track and you have ${n}. Make it an EP or album, or pick Catalog to send each one as its own single.` : null;
    case 'ep':
      if (n < 2) return 'An EP is usually 2 to 6 tracks. One track on its own is a single. You can still send it as an EP.';
      if (n > 6) return `An EP is usually 2 to 6 tracks. With ${n}, an album may fit better. You can still send it as an EP.`;
      return null;
    case 'album':
      return n < 7 ? `An album is usually 7 tracks or more. With ${n}, an EP may fit better. You can still send it as an album.` : null;
    case 'mixtape':
    case 'compilation':
      return n < 2 ? 'One track on its own is usually a single. You can still send it this way.' : null;
    default:
      return null;
  }
}

export function ReleaseTypePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ReleaseType;
  onChange: (t: ReleaseType) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <span id="release-type-label" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        What are you releasing?
      </span>
      <div role="radiogroup" aria-labelledby="release-type-label" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {RELEASE_TYPES.map(({ value: v, label, hint, Icon }) => {
          const active = v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(v)}
              className={`flex min-h-[4.25rem] min-w-0 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                active ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/40'
              }`}
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} /> {label}
              </span>
              <span className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
