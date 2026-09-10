import { useState } from 'react';
import { Loader2, MoveRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAccountLinkActions, useOtherWorlds, type OtherWorld } from '@/hooks/useAccountLinks';
import { whenLabel, type MyWorld } from '@/worlds/builder/useMyWorlds';

/**
 * A world standing under this artist's other login.
 *
 * Some artists were here twice: the account they use, and a page we set up
 * for them before they arrived. Work ended up in both. Rather than choose
 * for them, this shows the other world and lets them decide: bring it over,
 * or leave it. Bringing it over never costs them anything, because the
 * fuller of the two worlds is the one that survives and the other folds into
 * it, street by street.
 */
export function OtherWorlds({ mine, className = '' }: { mine: MyWorld[]; className?: string }) {
  const { data: others = [] } = useOtherWorlds();
  const { takeWorld } = useAccountLinkActions();
  const [taking, setTaking] = useState<OtherWorld | null>(null);

  if (!others.length) return null;

  // What they have built most is what stays; say so before they decide.
  const mineRichest = mine.length
    ? mine.reduce((best, w) => (best ? best : w), mine[0])
    : null;

  const bring = async () => {
    if (!taking) return;
    try {
      await takeWorld.mutateAsync(taking.id);
      toast('Brought over', {
        description: mine.length
          ? 'It is folded into the world you have built most. Nothing was lost.'
          : 'It is yours on this account now.',
      });
      setTaking(null);
    } catch (e) {
      toast.error((e as Error)?.message || 'That did not go through.');
    }
  };

  return (
    <div className={`rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 ${className}`}>
      <p className="text-sm font-semibold text-foreground">
        {others.length === 1 ? 'There is another world under your name.' : 'There are other worlds under your name.'}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        It was made on your other login. Bring it over and it folds into the world you have built
        most, keeping every street. Or leave it where it is; nothing happens until you say so.
      </p>

      <ul className="mt-3 space-y-2">
        {others.map((w) => (
          <li key={w.id} className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{w.artist_name || w.slug}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {w.streets} street{w.streets === 1 ? '' : 's'} · made {whenLabel(w.created_at)}
                {w.status === 'published' ? ' · open to people' : ''}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 rounded-full"
              disabled={takeWorld.isPending}
              onClick={() => setTaking(w)}
            >
              {takeWorld.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MoveRight className="mr-1.5 h-4 w-4" />}
              Bring it over
            </Button>
          </li>
        ))}
      </ul>

      {mineRichest && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          The one you keep will be {mineRichest.artist_name || mineRichest.slug}, the world you have built most.
        </p>
      )}

      <AlertDialog open={!!taking} onOpenChange={(v) => { if (!v && !takeWorld.isPending) setTaking(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bring {taking?.artist_name || taking?.slug} over?</AlertDialogTitle>
            <AlertDialogDescription>
              {mine.length
                ? 'Its streets join the world you have built most, keeping everything on them. A street whose name is already taken arrives with a number after it. Nothing is thrown away.'
                : 'It becomes yours on this account, exactly as it is.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={takeWorld.isPending}>Leave it</AlertDialogCancel>
            <AlertDialogAction disabled={takeWorld.isPending} onClick={(e) => { e.preventDefault(); void bring(); }}>
              {takeWorld.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Bringing it</> : 'Bring it over'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default OtherWorlds;
