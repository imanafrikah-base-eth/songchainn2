// An artist standing on their own street can change it where they stand.
//
// Before this, walking into your own world was looking at a finished thing
// through glass: to move a gallery above the records you went back to the
// builder, found the street in a list, changed it there, and walked back in to
// see whether it looked right. Now the owner, in their own view, can arrange
// the street they are standing on: move things, edit them, take them away and
// add new ones, each one drawn exactly as a visitor will see it.
//
// Nobody else ever sees any of it. The world page only renders this for the
// owner who is not looking through a visitor's eyes, and every write goes
// through the same builder hook, under the same row level security.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react';
import { BLOCK_TYPES, BlockList, getBlockType } from '@/worlds/blocks';
import { BuiltRoom } from '@/worlds/components/BuiltRoom';
import { PropForm } from '@/worlds/builder/PropForm';
import { StagePicker } from '@/worlds/builder/StagePicker';
import { useWorldBuilder } from '@/worlds/builder/useWorldBuilder';
import type { WorldConfig, WorldRings } from '@/worlds/types';

const iconButton =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30';

export function ArrangeStreet({
  world,
  roomSlug,
  rings,
}: {
  world: WorldConfig;
  roomSlug: string;
  rings: WorldRings | null;
}) {
  const [arranging, setArranging] = useState(false);
  const queryClient = useQueryClient();

  if (!world.id) return <BuiltRoom world={world} roomSlug={roomSlug} rings={rings} />;

  if (!arranging) {
    return (
      <>
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setArranging(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 text-xs font-semibold text-white transition-colors hover:bg-white/20"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Arrange this street
          </button>
        </div>
        <BuiltRoom world={world} roomSlug={roomSlug} rings={rings} />
      </>
    );
  }

  return (
    <StreetEditor
      world={world}
      worldId={world.id}
      roomSlug={roomSlug}
      rings={rings}
      onDone={() => {
        void queryClient.invalidateQueries({ queryKey: ['built-room', world.slug, roomSlug] });
        setArranging(false);
      }}
    />
  );
}

function StreetEditor({
  world,
  worldId,
  roomSlug,
  rings,
  onDone,
}: {
  world: WorldConfig;
  worldId: string;
  roomSlug: string;
  rings: WorldRings | null;
  onDone: () => void;
}) {
  const b = useWorldBuilder(worldId);
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const street = b.streets.find((s) => s.slug === roomSlug) ?? null;
  const blocks = street ? [...(b.blocksByStreet[street.id] ?? [])].sort((x, y) => x.sort_order - y.sort_order) : [];
  const ctx = { world, rings, streetSlug: roomSlug };

  return (
    <div className="space-y-3">
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-black/80 p-2.5 backdrop-blur">
        <span className="min-w-0 flex-1 px-1">
          <span className="block text-xs font-semibold text-white">Arranging {street?.name ?? 'this street'}</span>
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

      {!street ? (
        b.loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        ) : (
          <p className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/60">
            This street could not be opened for arranging. The builder still has it.
          </p>
        )
      ) : (
        <>
          <div className="rounded-xl bg-card p-3 text-foreground">
            <StagePicker
              stage={street.stage ?? (street.hidden ? 'away' : 'open')}
              onChange={(stage) => void b.saveStreet(street.id, { stage, hidden: stage === 'away' })}
            />
          </div>

          {blocks.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/60">
              Nothing on {street.name} yet. Add the first thing below.
            </p>
          ) : (
            <ul className="space-y-3">
              {blocks.map((blk, i) => {
                const def = getBlockType(blk.block_type);
                const editing = open === blk.id;
                return (
                  <li key={blk.id} className="rounded-2xl border border-dashed border-white/25 p-2">
                    <div className="mb-2 flex items-center gap-1">
                      <span className="min-w-0 flex-1 truncate px-2 text-xs font-semibold text-white/80">
                        {def?.name ?? blk.block_type}
                      </span>
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => void b.moveBlock(street.id, blk.id, -1)} className={iconButton}>
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button type="button" aria-label="Move down" disabled={i === blocks.length - 1} onClick={() => void b.moveBlock(street.id, blk.id, 1)} className={iconButton}>
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      {def ? (
                        <button type="button" aria-label={editing ? 'Close its settings' : 'Edit it'} aria-pressed={editing} onClick={() => setOpen(editing ? null : blk.id)} className={iconButton}>
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : null}
                      <button type="button" aria-label="Take it off this street" onClick={() => void b.removeBlock(street.id, blk.id)} className={iconButton}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {editing && def ? (
                      <div className="mb-3 rounded-xl bg-card p-3.5 text-foreground">
                        <PropForm specs={def.props} values={blk.props ?? {}} onChange={(next) => void b.saveBlock(street.id, blk.id, next)} />
                      </div>
                    ) : null}
                    <div className="text-foreground">
                      <BlockList blocks={[blk]} ctx={ctx} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {picking ? (
            <div className="rounded-xl bg-card p-3.5 text-foreground">
              <p className="mb-2.5 text-sm font-medium">Put on {street.name}</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {BLOCK_TYPES.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-border p-2.5 text-left focus-ring"
                      onClick={() => {
                        void b.addBlock(street.id, t.id, t.defaults);
                        setPicking(false);
                      }}
                    >
                      <span className="block text-sm">{t.name}</span>
                      <span className="block text-xs text-muted-foreground">{t.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setPicking(false)} className="mt-2 min-h-10 text-xs text-muted-foreground hover:text-foreground">
                Not now
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/10 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              <Plus className="h-4 w-4" /> Add something to {street.name}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default ArrangeStreet;
