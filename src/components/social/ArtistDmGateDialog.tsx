import { useState } from 'react';
import { KeyRound, Loader2, Lock, RefreshCw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { GetKeyModal } from '@/worlds/components/GetKeyModal';
import { requestWalletConnection } from '@/lib/walletGate';
import { proveWallet } from '@/lib/proveWallet';
import { isNativeApp } from '@/lib/native';
import type { ArtistDmAccess } from '@/hooks/useArtistDmAccess';
import { HOLDER_PERK_USD } from '@/hooks/useArtistCoinHolding';

/** The same bar as the online-status perk, so the two can never drift. */
const minUsd = `$${HOLDER_PERK_USD.toFixed(2)}`;

/**
 * Why a fan cannot message a musician yet, and the one thing that fixes it.
 *
 * Fans reach a musician by holding that musician's artist coin. Each refusal
 * from artist-dm-gate gets its own plain explanation and its own way forward:
 * buy the coin in the app, prove a wallet, or simply try again.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artistName: string;
  access: ArtistDmAccess | undefined;
  /** True while the gate is being asked again. */
  checking: boolean;
  /** Ask the gate again, and carry on if it now says yes. */
  onRecheck: () => void;
  /** Ticker with the $, when the caller knows a better one than the Zora handle. */
  symbol?: string;
}

export function ArtistDmGateDialog({ open, onOpenChange, artistName, access, checking, onRecheck, symbol }: Props) {
  const [keyOpen, setKeyOpen] = useState(false);
  const [proving, setProving] = useState(false);
  const reason = access?.reason ?? 'check_failed';
  const canBuy = Boolean(access?.coinAddress) && !isNativeApp();
  const ticker = symbol ?? `$${(access?.zoraHandle ?? artistName).replace(/^@/, '').toUpperCase()}`;

  const verifyWallet = async () => {
    setProving(true);
    try {
      const address = await requestWalletConnection();
      if (!address) {
        toast.error('No wallet connected', { description: 'Connect a wallet, then try again.' });
        return;
      }
      const proof = await proveWallet(address);
      if (!proof.ok) {
        toast.error('Wallet not verified', { description: proof.error });
        return;
      }
      toast.success('Wallet verified');
      onRecheck();
    } finally {
      setProving(false);
    }
  };

  let title: string;
  let body: string;
  if (reason === 'no_coin') {
    title = 'Messages are closed for now';
    body = `${artistName} has not launched a coin yet, so messages are closed for now.`;
  } else if (reason === 'no_balance') {
    title = `Hold ${minUsd} of ${artistName}'s coin to message them`;
    body = `Fans message musicians by holding their artist coin. ${minUsd} of ${ticker} in your verified wallet opens the conversation, the same amount that shows you when ${artistName} is online.`;
  } else if (reason === 'no_verified_wallet') {
    title = 'Verify your wallet first';
    body = `Fans message ${artistName} by holding ${minUsd} of ${ticker}. We check it in a wallet you have proved is yours: connect it and sign a short message. No money moves and it costs no gas.`;
  } else {
    title = 'Could not check right now';
    body = 'Could not check right now, try again.';
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
              {title}
            </DialogTitle>
            <DialogDescription>{body}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 pt-1">
            {reason === 'no_balance' && (
              <>
                {canBuy && (
                  <Button className="min-h-11" onClick={() => setKeyOpen(true)}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Get {ticker}
                  </Button>
                )}
                <Button variant="secondary" className="min-h-11" disabled={checking} onClick={onRecheck}>
                  {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  I just bought it, check again
                </Button>
              </>
            )}

            {reason === 'no_verified_wallet' && (
              <>
                <Button className="min-h-11" disabled={proving || checking} onClick={() => void verifyWallet()}>
                  {proving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                  Connect and verify wallet
                </Button>
                <Button variant="secondary" className="min-h-11" disabled={checking} onClick={onRecheck}>
                  {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Check again
                </Button>
              </>
            )}

            {reason !== 'no_balance' && reason !== 'no_verified_wallet' && reason !== 'no_coin' && (
              <Button className="min-h-11" disabled={checking} onClick={onRecheck}>
                {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Try again
              </Button>
            )}

            <Button variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {canBuy && access?.coinAddress && (
        <GetKeyModal
          open={keyOpen}
          onOpenChange={setKeyOpen}
          coinAddress={access.coinAddress}
          symbol={ticker}
          artistName={artistName}
          worldSlug={null}
          onBought={onRecheck}
        />
      )}
    </>
  );
}
