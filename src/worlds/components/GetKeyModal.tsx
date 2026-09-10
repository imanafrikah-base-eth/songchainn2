// Getting the key to a world, inside SONGCHAINN.
//
// The key is the artist's creator coin on Zora's protocol on Base. Until now
// "Get $IMAN" sent people out to zora.co, which is a door out of the app at
// the exact moment they had decided to come in. Now the same trade happens
// here, in the person's own wallet, on the same rails the song copies use
// (src/lib/zoraTrading.ts): connect if there is no wallet, choose how much,
// see what that buys, confirm in the wallet, and the doors are re-checked.
//
// SONGCHAINN never holds the money: the trade goes wallet to pool. Inside
// the Android shell the callers never open this at all (Play Billing rule).

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { Address } from 'viem';
import { formatEther } from 'viem';
import { Button } from '@/components/ui/button';
import { ConsentNotice } from '@/components/ConsentNotice';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { getConnectedAccounts } from '@/lib/baseWallet';
import { requestWalletConnection } from '@/lib/walletGate';
import { getBuyQuote, getCoinTokenBalance } from '@/lib/zoraTrading';
import { buyAsset } from '@/lib/safeBuy';
import { getEthUsdPrice } from '@/lib/ethPrice';

const PRESETS_USD = [2, 5, 20];

export interface GetKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coinAddress: string;
  /** Display ticker, with the $ ("$IMAN"). */
  symbol: string;
  artistName: string;
  /** Fan and insider thresholds in whole coins, when the caller is a world. */
  thresholds?: { FAN: number; INSIDER: number } | null;
  /** Where to send them once the key is in the wallet. */
  worldSlug?: string | null;
  /** Called after a successful trade so the caller re-reads the doors. */
  onBought?: () => void;
}

function fmtCoins(wei: bigint): string {
  const n = Number(formatEther(wei));
  if (!Number.isFinite(n)) return '0';
  return n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2);
}

export function GetKeyModal({
  open, onOpenChange, coinAddress, symbol, artistName, thresholds, worldSlug, onBought,
}: GetKeyModalProps) {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<string | null>(null);
  const [ethUsd, setEthUsd] = useState<number | null>(null);
  const [usd, setUsd] = useState<number>(PRESETS_USD[1]);
  const [customEth, setCustomEth] = useState('');
  const [quote, setQuote] = useState<bigint | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [held, setHeld] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // The ETH to spend: a preset in dollars at the live rate, or what they typed.
  const ethAmount = useMemo(() => {
    if (customEth.trim()) {
      const n = Number(customEth);
      return Number.isFinite(n) && n > 0 ? customEth.trim() : '';
    }
    if (!ethUsd) return '';
    return (usd / ethUsd).toFixed(6);
  }, [customEth, usd, ethUsd]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void getEthUsdPrice().then((p) => live && setEthUsd(p));
    void (async () => {
      try {
        if (isSupabaseConfigured) {
          const { data } = await supabase.auth.getSession();
          const saved = (data?.session?.user?.user_metadata as { wallet_address?: string } | undefined)?.wallet_address;
          if (saved) { if (live) setWallet(saved); return; }
        }
        const accounts = await getConnectedAccounts();
        if (live && accounts[0]) setWallet(accounts[0]);
      } catch { /* connect explicitly */ }
    })();
    return () => { live = false; };
  }, [open]);

  useEffect(() => {
    if (!open || !wallet) return;
    let live = true;
    void getCoinTokenBalance(coinAddress as Address, wallet as Address)
      .then((b) => live && setHeld(b))
      .catch(() => live && setHeld(null));
    return () => { live = false; };
  }, [open, wallet, coinAddress, txHash]);

  // What the money buys, before the wallet opens.
  useEffect(() => {
    if (!open || !wallet || !ethAmount) { setQuote(null); return; }
    let live = true;
    setQuoting(true);
    void getBuyQuote({ coinAddress: coinAddress as Address, ethAmount, userAddress: wallet as Address })
      .then((q) => live && setQuote(q))
      .catch(() => live && setQuote(null))
      .finally(() => live && setQuoting(false));
    return () => { live = false; };
  }, [open, wallet, ethAmount, coinAddress]);

  const connect = async () => {
    if (isSupabaseConfigured) {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        toast('Sign in first, then link your wallet and the key lands on your account.');
        onOpenChange(false);
        navigate('/?auth=signin');
        return;
      }
    }
    setBusy('Connecting');
    try {
      const address = await requestWalletConnection();
      if (address) setWallet(address);
    } finally {
      setBusy(null);
    }
  };

  const buy = async () => {
    if (!wallet || !ethAmount) return;
    setBusy('Confirm in your wallet');
    try {
      // The shared path: on Base, enough for the fee, and a plain sentence
      // when something goes wrong rather than a chain error.
      const res = await buyAsset({ coinAddress, ethAmount, address: wallet });
      if (!res.success) {
        toast.error('Not bought', {
          description: res.message,
          action: {
            label: 'Ask Mo$ha',
            onClick: () => window.dispatchEvent(new CustomEvent('songchainn:open-mosha', {
              detail: { ask: `I tried to get ${symbol} for ${ethAmount} ETH and it did not work. It said: ${res.message}${res.advice ? ` (${res.advice})` : ''}. What should I do?` },
            })),
          },
        });
        return;
      }
      setTxHash(res.txHash ?? null);
      toast.success(`${symbol} is in your wallet`, { description: 'Your doors are being checked now.' });
      onBought?.();
    } finally {
      setBusy(null);
    }
  };

  const heldWhole = held != null ? Number(formatEther(held)) : null;
  const nextDoor = thresholds && heldWhole != null
    ? heldWhole < thresholds.FAN ? { name: 'fan', need: thresholds.FAN } : heldWhole < thresholds.INSIDER ? { name: 'insider', need: thresholds.INSIDER } : null
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-amber-400" /> Get {symbol}</DialogTitle>
          <DialogDescription>
            {symbol} is {artistName}'s own coin on Base. Hold it in your wallet and the doors open; the more you hold, the deeper the room. You buy it here, from your own wallet, and it stays there.
          </DialogDescription>
        </DialogHeader>

        {txHash ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Done. {symbol} is in your wallet.</p>
            {heldWhole != null ? (
              <p className="text-sm text-muted-foreground">You now hold {Math.floor(heldWhole).toLocaleString()} {symbol}.
                {nextDoor ? ` ${nextDoor.need.toLocaleString()} opens the ${nextDoor.name} doors.` : thresholds ? ' Every door is open to you.' : ''}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {worldSlug ? <Button asChild><Link to={`/world/${worldSlug}`} onClick={() => onOpenChange(false)}>Walk in</Link></Button> : null}
              <Button variant="outline" onClick={() => { setTxHash(null); }}>Get more</Button>
              <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
                Receipt <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        ) : !wallet ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Connect the wallet the key should live in. Base App, Coinbase Wallet, MetaMask and Rainbow all work.</p>
            <Button onClick={() => void connect()} disabled={busy != null} className="w-full gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Connect wallet
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {thresholds ? (
              <p className="text-xs text-muted-foreground">
                Fan doors open at {thresholds.FAN.toLocaleString()} {symbol}, insider doors at {thresholds.INSIDER.toLocaleString()}.
                {heldWhole != null ? ` You hold ${Math.floor(heldWhole).toLocaleString()}.` : ''}
              </p>
            ) : null}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">How much</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS_USD.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setUsd(p); setCustomEth(''); }}
                    className={`h-10 rounded-full border px-4 text-sm font-semibold ${!customEth && usd === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}
                  >
                    ${p}
                  </button>
                ))}
                <input
                  inputMode="decimal"
                  value={customEth}
                  onChange={(e) => setCustomEth(e.target.value)}
                  placeholder="or ETH"
                  className="h-10 w-28 rounded-full border border-border bg-background px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-ring"
                />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">You spend</span>
                <span className="font-mono text-foreground">{ethAmount ? `${Number(ethAmount).toFixed(5)} ETH` : '...'}{ethUsd && ethAmount ? ` (~$${(Number(ethAmount) * ethUsd).toFixed(2)})` : ''}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">You get about</span>
                <span className="font-mono text-foreground">{quoting ? '...' : quote != null ? `${fmtCoins(quote)} ${symbol}` : 'no quote yet'}</span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">The exact amount is set by the pool at the moment you confirm. Network fee on Base is extra and usually cents.</p>
            </div>
            <ConsentNotice which="key_risk" />
            <Button onClick={() => void buy()} disabled={busy != null || !ethAmount} className="w-full gap-2">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {busy}</> : <><KeyRound className="h-4 w-4" /> Get {symbol}</>}
            </Button>
            <p className="text-center font-mono text-[11px] text-muted-foreground">{wallet.slice(0, 6)}...{wallet.slice(-4)}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
