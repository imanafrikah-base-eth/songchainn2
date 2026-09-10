import { useState } from 'react';
import { ArrowRight, GitMerge, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMergeWorlds, whenLabel, type MyWorld } from '@/worlds/builder/useMyWorlds';

/**
 * The worlds an artist already has, with the two dates that matter: when it
 * was made, and when they last walked into it.
 *
 * An account holds one world now. Anyone who made more before that rule can
 * fold the spare into the one they are keeping: every street and everything
 * on it moves across, art and settings fill the blanks, and nothing is
 * thrown away. A published world can only ever be the keeper.
 */
export function MyWorldsList({
  worlds,
  onOpen,
  className = '',
}: {
  worlds: MyWorld[];
  onOpen: (world: MyWorld) => void;
  className?: string;
}) {
  const merge = useMergeWorlds();
  const [folding, setFolding] = useState<MyWorld | null>(null);
  const [into, setInto] = useState<MyWorld | null>(null);

  if (!worlds.length) return null;

  const doMerge = async () => {
    if (!folding || !into) return;
    try {
      await merge.mutateAsync({ keep: into.id, merge: folding.id });
      toast('Merged', { description: `${folding.artist_name || folding.slug} is now part of ${into.artist_name || into.slug}.` });
      setFolding(null);
      setInto(null);
    } catch (e) {
      toast.error((e as Error)?.message || 'That merge did not go through.');
    }
  };

  return (
    <div className={className}>
      <ul className="space-y-2">
        {worlds.map((w) => (
          <li key={w.id} className="rounded-lg border border-border bg-background/60">
            <button
              type="button"
              onClick={() => onOpen(w)}
              className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:border-primary/40"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {w.artist_name || w.slug}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {w.status === 'published' ? 'Open to people' : 'Draft'}
                  {w.world_number ? ` · World #${String(w.world_number).padStart(3, '0')}` : ''}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
                  Made {whenLabel(w.created_at)} · You were last in it {whenLabel(w.owner_last_entered_at)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                Open <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>

            {worlds.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-3 py-2">
                <span className="text-[11px] text-muted-foreground">Fold this one into</span>
                {worlds
                  .filter((other) => other.id !== w.id && !(w.status === 'published' && other.status !== 'published'))
                  .map((other) => (
                    <button
                      key={other.id}
                      type="button"
                      disabled={merge.isPending}
                      onClick={() => { setFolding(w); setInto(other); }}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 text-[11px] font-semibold text-foreground hover:border-primary/50 hover:text-primary disabled:opacity-50"
                    >
                      <GitMerge className="h-3 w-3" />
                      {other.artist_name || other.slug}
                    </button>
                  ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={!!folding && !!into} onOpenChange={(v) => { if (!v && !merge.isPending) { setFolding(null); setInto(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Fold {folding?.artist_name || folding?.slug} into {into?.artist_name || into?.slug}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every street moves across with everything on it. Art, the story and settings fill
              whatever is still blank on {into?.artist_name || into?.slug}. Nothing is thrown
              away, and afterwards you have one world.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merge.isPending}>Keep both</AlertDialogCancel>
            <AlertDialogAction disabled={merge.isPending} onClick={(e) => { e.preventDefault(); void doMerge(); }}>
              {merge.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Merging</> : 'Merge them'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The same two dates, for one world, on a line. */
export function WorldDates({ world, className = '' }: { world: Pick<MyWorld, 'created_at' | 'owner_last_entered_at'>; className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Made {whenLabel(world.created_at)} · You were last in it {whenLabel(world.owner_last_entered_at)}
    </p>
  );
}

export default MyWorldsList;
