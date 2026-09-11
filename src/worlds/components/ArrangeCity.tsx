// An artist standing in their own city can rearrange it where they stand.
//
// A city is the streets standing in it, in order. The owner, in their own
// view, can put those streets in the order they want, take one out (it stays
// in the world, just not in this city), bring in a street that stands nowhere
// yet, start a brand new street right here, and choose whether visitors see
// the city as open, coming soon or off the map. The page is reloaded when
// they are done, so what they see is what a visitor will get.

import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, LayoutGrid, Loader2, MinusCircle, Plus } from 'lucide-react';
import { StagePicker } from '@/worlds/builder/StagePicker';
import { useWorldBuilder } from '@/worlds/builder/useWorldBuilder';
import type { WorldConfig } from '@/worlds/types';

const iconButton =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30';

export function ArrangeCity({
  world,
  citySlug,
  onChanged,
}: {
  world: WorldConfig;
  citySlug: string;
  onChanged?: () => void;
}) {
  const [arranging, setArranging] = useState(false);
  if (!world.id) return null;

  if (!arranging) {
    return (
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setArranging(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 text-xs font-semibold text-white transition-colors hover:bg-white/20"
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Arrange this city
        </button>
      </div>
    );
  }

  return (
    <CityEditor
      worldId={world.id}
      citySlug={citySlug}
      onDone={() => {
        setArranging(false);
        onChanged?.();
      }}
    />
  );
}

function CityEditor({ worldId, citySlug, onDone }: { worldId: string; citySlug: string; onDone: () => void }) {
  const b = useWorldBuilder(worldId);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  const city = b.cities.find((c) => c.slug === citySlug) ?? null;
  const order = city?.buildings ?? [];
  const bySlug = new Map(b.streets.map((s) => [s.slug, s]));
  const standing = order.map((slug) => bySlug.get(slug)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  // Streets that stand in no city at all; a street already in another city
  // stays where it is rather than being pulled out from under it.
  const inSomeCity = new Set(b.cities.flatMap((c) => c.buildings ?? []));
  const loose = b.streets.filter((s) => !inSomeCity.has(s.slug));

  const setOrder = (next: string[]) => {
    if (city) void b.saveCity(city.id, { buildings: next });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const addNew = async () => {
    const clean = name.trim();
    if (!clean || !city || adding) return;
    setAdding(true);
    const slug = await b.addStreet(clean);
    if (slug) setOrder([...order, slug]);
    setName('');
    setAdding(false);
  };

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-black/80 p-2.5 backdrop-blur">
        <span className="min-w-0 flex-1 px-1">
          <span className="block text-xs font-semibold text-white">Arranging {city?.name ?? 'this city'}</span>
          <span className="block text-[11px] text-white/60">Every change saves as you make it. Only you can see these controls.</span>
        </span>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-black transition-opacity hover:opacity-90"
        >
          <Check className="h-3.5 w-3.5" /> Done
        </button>
      </div>

      {!city ? (
        b.loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        ) : (
          <p className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/60">
            This city could not be opened for arranging. The builder still has it.
          </p>
        )
      ) : (
        <div className="space-y-3 rounded-2xl bg-card p-3.5 text-foreground">
          <StagePicker stage={city.stage} onChange={(stage) => void b.saveCity(city.id, { stage })} />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Standing in {city.name}</p>
            {standing.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No streets stand here yet.</p>
            ) : (
              <ul className="mt-1 space-y-1.5">
                {standing.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-1 rounded-xl border border-border px-2.5 py-1">
                    <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                    <button type="button" aria-label={`Move ${s.name} earlier`} disabled={i === 0} onClick={() => move(i, -1)} className={iconButton}>
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" aria-label={`Move ${s.name} later`} disabled={i === standing.length - 1} onClick={() => move(i, 1)} className={iconButton}>
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Take ${s.name} out of ${city.name}`}
                      title="Take it out of this city. The street stays in your world."
                      onClick={() => setOrder(order.filter((slug) => slug !== s.slug))}
                      className={iconButton}
                    >
                      <MinusCircle className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {loose.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Streets standing in no city</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {loose.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setOrder([...order, s.slug])}
                    className="inline-flex min-h-10 items-center gap-1 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" /> {s.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void addNew();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder={`A new street in ${city.name}`}
              aria-label={`Name a new street in ${city.name}`}
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-ring"
            />
            <button
              type="submit"
              disabled={!name.trim() || adding}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default ArrangeCity;
