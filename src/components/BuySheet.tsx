import { useEffect, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Loader2, Sparkles, Wallet as WalletIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { useMyWallets, WALLET_NAMES, shortAddress } from '@/hooks/useMyWallets';
import { requestWalletConnection } from '@/lib/walletGate';
import { buyAsset, checkBeforeBuying, type BuyCheck } from '@/lib/safeBuy';
import { reportPayment } from '@/lib/paymentReceipt';

/**
 * Buying anything, in one sheet.
 *
 * A key, a copy of a record, $WWAT: all of it is the same purchase from the
 * person's own wallet, so it is the same three lines every time. What you are
 * getting. What it costs. Which wallet pays. Then one button.
 *
 * The checks run before the button is even live, so nobody finds out their
 * balance is short after signing. When something does go wrong, the sheet
 * says what happened in a sentence and offers Mo$ha, who is handed exactly
 * what went wrong so the answer is about their problem rather than about
 * wallets in general. Money is the one place where a shrug is not acceptable.
 */

export interface BuySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The coin being bought. */
  coinAddress: string;
  /** What they are getting, in their words: "the key to IMan's world". */
  what: string;
  /** A line under it, optional. */
  note?: string;
  /** Amounts offered, in ETH. The middle one is suggested. */
  amounts?: string[];
  /** Told after a purchase lands, so the page can refresh what it shows. */
  onDone?: (txHash?: string) => void;
}

const DEFAULT_AMOUNTS = ['0.002', '0.005', '0.01'];

export function BuySheet({ open, onOpenChange, coinAddress, what, note, amounts = DEFAULT_AMOUNTS, onDone }: BuySheetProps) {
  const { user } = useAuth();
  const { active, wallets, setActive } = useMyWallets();
  const [amount, setAmount] = useState(amounts[Math.min(1, amounts.length - 1)]);
  const [check, setCheck] = useState<BuyCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ message: string; advice?: string; nothingSpent: boolean } | null>(null);
  const [done, setDone] = useState<string | undefined>();

  const address = active?.address ?? null;

  // Everything that has to be true, checked while they are still reading.
  useEffect(() => {
    if (!open || !address) { setCheck(null); return; }
    let alive = true;
    setChecking(true);
    void checkBeforeBuying(address, amount)
      .then((c) => { if (alive) setCheck(c); })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [open, address, amount]);

  useEffect(() => {
    if (open) { setFailed(null); setDone(undefined); }
  }, [open]);

  const connect = async () => {
    setBusy(true);
    try {
      const got = await requestWalletConnection();
      if (got) toast.success('Wallet connected');
    } finally {
      setBusy(false);
    }
  };

  const buy = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const out = await buyAsset({ coinAddress, ethAmount: amount, address, checked: check?.ok === true });
      if (out.success) {
        setDone(out.txHash);
        reportPayment(out.txHash, 'coin_buy');
        toast.success('Done. It is yours.');
        onDone?.(out.txHash);
      } else {
        setFailed({ message: out.message, advice: out.advice, nothingSpent: out.nothingSpent });
      }
    } finally {
      setBusy(false);
    }
  };

  /* Mo$ha, handed the actual problem rather than a general one. */
  const askMosha = () => {
    const line = failed
      ? `I tried to buy ${what} for ${amount} ETH and it did not work. It said: ${failed.message}${failed.advice ? ` (${failed.advice})` : ''}. What should I do?`
      : check?.problem
        ? `I want to buy ${what} for ${amount} ETH but it says: ${check.problem} What should I do?`
        : `I want to buy ${what}. Walk me through it?`;
    window.dispatchEvent(new CustomEvent('songchainn:open-mosha', { detail: { ask: line } }));
    onOpenChange(false);
  };

  const blocked = !!check?.problem;
  const canBuy = !!address && !busy && !checking && !blocked && !done;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{done ? 'It is yours' : what}</DialogTitle>
          <DialogDescription>
            {done ? 'Paid straight to the artist.' : note ?? 'Paid from your wallet on Base.'}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Check className="h-4 w-4 text-primary" /> Done.
            </p>
            {done !== undefined && typeof done === 'string' && done.startsWith('0x') && (
              <a
                href={`https://basescan.org/tx/${done}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                See it on Base <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <Button className="w-full rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 1. What it costs. */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">How much</p>
              <div className="flex gap-2">
                {amounts.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmount(a)}
                    className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                      a === amount ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {a} ETH
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Which wallet pays. */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Paying from</p>
              {!user ? (
                <p className="text-sm text-muted-foreground">Sign in first, then connect a wallet.</p>
              ) : !address ? (
                <Button variant="outline" className="w-full rounded-xl" disabled={busy} onClick={() => void connect()}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <WalletIcon className="mr-1.5 h-4 w-4" />}
                  Connect a wallet
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
                  <WalletIcon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold text-foreground">{active ? WALLET_NAMES[active.provider] : 'Wallet'}</span>
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">{shortAddress(address)}</span>
                    {check?.balanceEth && (
                      <span className="ml-1.5 text-xs text-muted-foreground">· {Number(check.balanceEth).toFixed(4)} ETH</span>
                    )}
                  </span>
                  {wallets.length > 1 && (
                    <select
                      aria-label="Which wallet pays"
                      value={address}
                      onChange={(e) => void setActive.mutateAsync(e.target.value)}
                      className="min-h-10 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                    >
                      {wallets.map((w) => (
                        <option key={w.id} value={w.address}>
                          {WALLET_NAMES[w.provider]} {shortAddress(w.address)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* 3. Anything in the way, said before they sign. */}
            {checking && <p className="text-xs text-muted-foreground">Checking your balance.</p>}
            {check?.problem && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="flex items-start gap-2 text-xs text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {check.problem}
                </p>
                <Button size="sm" variant="outline" className="mt-2 h-9 rounded-full text-xs" onClick={askMosha}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Ask Mo$ha what to do
                </Button>
              </div>
            )}
            {check?.warning && !check.problem && (
              <p className="text-xs text-muted-foreground">{check.warning}</p>
            )}
            {failed && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                <p className="flex items-start gap-2 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {failed.message}
                </p>
                {!failed.nothingSpent && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Check your wallet before trying again.</p>
                )}
                <Button size="sm" variant="outline" className="mt-2 h-9 rounded-full text-xs" onClick={askMosha}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Ask Mo$ha what to do
                </Button>
              </div>
            )}

            <Button className="h-12 w-full rounded-full text-sm" disabled={!canBuy} onClick={() => void buy()}>
              {busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Waiting for your wallet</> : `Buy for ${amount} ETH`}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Nothing moves until you approve it in your wallet.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BuySheet;
