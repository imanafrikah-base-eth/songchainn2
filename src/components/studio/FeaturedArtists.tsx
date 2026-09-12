import { useMemo, useState } from 'react';
import { Plus, Search, X, Eye, EyeOff } from 'lucide-react';
import { ARTISTS } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import type { Featured } from '@/lib/songDetails';

/**
 * Who else is on this record.
 *
 * A featured artist was only ever a line of typed text under Credits, which
 * means it linked nowhere and the person named got nothing from it. This picks
 * a real artist on SONGCHAINN, so the credit carries their id and can reach
 * their page.
 *
 * The uploader also decides, per person, whether it shows on the song display.
 * That is deliberate and not the same as deleting them: a feature can be true
 * and recorded while the artist would rather it were not printed under the
 * title, and we should not make them choose between a lie and a leak.
 *
 * Modelled on TagPeople, which is the picker this app already uses, but it
 * searches artists rather than everybody: a feature credit that pointed at a
 * listener would link to a page with no music on it.
 */
export function FeaturedArtists({
  value,
  onChange,
  disabled = false,
  /** The uploader. Nobody features themselves. */
  selfArtistId,
}: {
  value: Featured[];
  onChange: (next: Featured[]) => void;
  disabled?: boolean;
  selfArtistId?: string | null;
}) {
  const { artists: uploadedArtists } = usePublishedCatalog();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // The founding roster lives in the static catalogue and everybody who joined
  // through the app comes from the hook. Searching one and not the other would
  // hide half the artists on the platform.
  const everyone = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; image?: string }>();
    for (const a of [...ARTISTS, ...uploadedArtists]) {
      if (!a?.id || byId.has(String(a.id))) continue;
      byId.set(String(a.id), { id: String(a.id), name: a.name, image: a.profileImage });
    }
    return Array.from(byId.values());
  }, [uploadedArtists]);

  const chosen = useMemo(() => new Set(value.map((f) => f.artistId)), [value]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return everyone
      .filter((a) => a.id !== String(selfArtistId ?? ''))
      .filter((a) => (q ? a.name.toLowerCase().includes(q) : true))
      .slice(0, q ? 20 : 8);
  }, [everyone, query, selfArtistId]);

  const add = (a: { id: string; name: string }) => {
    if (chosen.has(a.id)) return;
    onChange([...value, { artistId: a.id, name: a.name, show: true }]);
    setQuery('');
  };

  const remove = (artistId: string) => onChange(value.filter((f) => f.artistId !== artistId));
  const toggleShow = (artistId: string) =>
    onChange(value.map((f) => (f.artistId === artistId ? { ...f, show: !f.show } : f)));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="mb-0 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Featured artists
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" /> {open ? 'Done' : 'Add an artist'}
        </button>
      </div>

      {value.length === 0 && !open && (
        <p className="text-xs text-muted-foreground">
          Anyone else on SONGCHAINN who is on this record. Their name links to their page, and you
          choose whether it shows under the title.
        </p>
      )}

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((f) => (
            <li
              key={f.artistId}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{f.name}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggleShow(f.artistId)}
                aria-label={f.show ? `Hide ${f.name} on the song display` : `Show ${f.name} on the song display`}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${
                  f.show ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {f.show ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {f.show ? 'Shown' : 'Not shown'}
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${f.name}`}
                onClick={() => remove(f.artistId)}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-2 rounded-xl border border-border bg-card p-3">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              disabled={disabled}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artists by name"
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">
                {query.trim() ? 'No artist here by that name.' : 'Start typing a name.'}
              </p>
            ) : (
              results.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={disabled || chosen.has(a.id)}
                  onClick={() => add(a)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-1 py-2 text-left hover:bg-muted/50 disabled:opacity-50"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/20 text-xs font-bold text-primary">
                    {a.image ? (
                      <img src={a.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      a.name.charAt(0)
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{a.name}</span>
                  {chosen.has(a.id) && <span className="text-[11px] font-semibold text-primary">Added</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FeaturedArtists;
