import { useState } from 'react';
import { Check, Copy, Loader2, Plus, Trash2, Wallet as WalletIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { requestWalletConnection } from '@/lib/walletGate';
import { useMyWallets, WALLET_NAMES, shortAddress, type MyWallet } from '@/hooks/useMyWallets';

/**
 * Every wallet on this account, and the one money moves through.
 *
 * People carry more than one: the wallet in the Base app, MetaMask on a
 * laptop, the one Farcaster handed them. All of them can live here, and one
 * is marked as the one that pays. Nothing is ever chosen for them silently,
 * because paying from the wrong wallet is the kind of mistake that costs
 * real money and cannot be undone.
 */
export function MyWalletsPanel({ className = '' }: { className?: string }) {
  const { wallets, active, isLoading, setActive, forget } = useMyWallets();
  const [connecting, setConnecting] = useState(false);
  const [dropping, setDropping] = useState<MyWallet | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const addAnother = async () => {
    setConnecting(true);
    try {
      const address = await requestWalletConnection();
      if (address) toast.success('Wallet added', { description: 'It is on your account now.' });
    } catch (e) {
      toast.error('Could not connect that wallet', { description: (e as Error)?.message });
    } finally {
      setConnecting(false);
    }
  };

  const choose = async (w: MyWallet) => {
    try {
      await setActive.mutateAsync(w.address);
      toast('Now paying from ' + WALLET_NAMES[w.provider], { description: shortAddress(w.address) });
    } catch (e) {
      toast.error((e as Error)?.message || 'Could not switch to that one.');
    }
  };

  const drop = async () => {
    if (!dropping) return;
    try {
      await forget.mutateAsync(dropping.address);
      toast('Forgotten', { description: 'Nothing on chain changed. Connect it again any time.' });
      setDropping(null);
    } catch (e) {
      toast.error((e as Error)?.message || 'Could not forget that one.');
    }
  };

  const copy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('Could not copy that.');
    }
  };

  return (
    <section className={className} aria-labelledby="wallets-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="wallets-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {wallets.length > 1 ? 'Your wallets' : 'Your wallet'}
        </h2>
        <Button size="sm" variant="outline" className="h-9 rounded-full text-xs" disabled={connecting} onClick={() => void addAnother()}>
          {connecting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
          Add another
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Looking at your wallets
        </div>
      ) : wallets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          None yet. Connect one when you want to own a record or hold a world key.
        </div>
      ) : (
        <ul className="space-y-2">
          {wallets.map((w) => (
            <li
              key={w.id}
              className={`rounded-xl border p-3 ${w.is_active ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${w.is_active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <WalletIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground">{WALLET_NAMES[w.provider]}</span>
                    {w.is_active && (
                      <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Pays
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copy(w.address)}
                    className="inline-flex min-h-8 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                    aria-label={`Copy ${w.address}`}
                  >
                    {shortAddress(w.address)}
                    {copied === w.address ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                  </button>
                </span>
                <span className="flex shrink-0 gap-1.5">
                  {!w.is_active && (
                    <Button size="sm" variant="outline" className="h-9 rounded-full text-xs" disabled={setActive.isPending} onClick={() => void choose(w)}>
                      Pay from this
                    </Button>
                  )}
                  <button
                    type="button"
                    aria-label={`Forget ${WALLET_NAMES[w.provider]} ${shortAddress(w.address)}`}
                    onClick={() => setDropping(w)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {wallets.length > 1 && (
        <p className="mt-2 text-xs text-muted-foreground">
          The one marked Pays is where every purchase comes from and where earnings land. Switch it
          before you buy, not after.
        </p>
      )}

      <AlertDialog open={!!dropping} onOpenChange={(v) => { if (!v && !forget.isPending) setDropping(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget this wallet?</AlertDialogTitle>
            <AlertDialogDescription>
              It comes off your account here. Nothing on chain changes and nothing in it is touched;
              whatever it holds stays exactly where it is. You can connect it again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={forget.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction disabled={forget.isPending} onClick={(e) => { e.preventDefault(); void drop(); }}>
              {forget.isPending ? 'Forgetting' : 'Forget it'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default MyWalletsPanel;
