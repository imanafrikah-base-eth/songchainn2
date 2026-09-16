import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GetKeyModal } from '@/worlds/components/GetKeyModal';
import { requestWalletConnection } from '@/lib/walletGate';
import type { WorldTrackAnswer } from '@/hooks/useWorldTrackPlay';

/**
 * What a person sees when they tap play on a record that lives in a world and
 * they do not hold enough of the artist's coin.
 *
 * It says the real number, read from their own wallet a second ago, and gives
 * them the two ways in: hold enough of the coin to play the record, or step
 * into the world and watch the preview. Nothing here is a guess, and nothing
 * here is a dead end.
 */

const money = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(2)}`);

export function WorldTrackLock({
  answer,
  artistName,
  tokenSymbol,
  onOpenChange,
  onRetry,
}: {
  answer: WorldTrackAnswer | null;
  artistName: string;
  /** The ticker with its dollar sign, such as "$IMAN". */
  tokenSymbol: string;
  onOpenChange: (open: boolean) => void;
  onRetry?: () => void;
}) {
  const navigate = useNavigate();
  const [buying, setBuying] = useState(false);
  const [connecting, setConnecting] = useState(false);
  if (!answer) return null;

  const name = [answer.title, answer.partLabel].filter(Boolean).join(', ');
  const streetPath = answer.streetSlug
    ? `/world/${answer.worldSlug}/${answer.streetSlug}`
    : `/world/${answer.worldSlug}`;

  const headline = (() => {
    switch (answer.reason) {
      case 'signed_out': return 'Sign in to play this';
      case 'no_wallet': return 'Connect the wallet that holds your coin';
      case 'no_coin': return 'This world has no coin yet';
      case 'not_ready': return `${name} lands soon`;
      case 'check_failed': return 'We could not read your wallet just now';
      default: return `Hold ${money(answer.needUsd)} of ${tokenSymbol} to play`;
    }
  })();

  const body = (() => {
    switch (answer.reason) {
      case 'signed_out':
        return `${name} plays for people who hold ${tokenSymbol}. Sign in and we can check your wallet.`;
      case 'no_wallet':
        return `We could not find a wallet on your account. Connect the one holding your ${tokenSymbol} and this opens straight away.`;
      case 'no_coin':
        return `${artistName} has not put a coin behind this world yet, so there is nothing to hold. The preview is open to everyone.`;
      case 'not_ready':
        return `The preview is here now. The record itself follows shortly.`;
      case 'check_failed':
        return 'That was us, not you. Nothing has changed in your wallet. Try again in a moment.';
      default:
        return answer.usdValue > 0
          ? `${name} is ${artistName}'s, kept in his world. You hold ${money(answer.usdValue)} of ${tokenSymbol} right now, so another ${money(Math.max(0, answer.needUsd - answer.usdValue))} opens it.`
          : `${name} is ${artistName}'s, kept in his world. It plays for anyone holding ${money(answer.needUsd)} of ${tokenSymbol}, and the preview is open to everyone.`;
    }
  })();

  const canBuy = Boolean(answer.coinAddress) && answer.reason !== 'no_coin';

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm border-white/10 bg-zinc-950">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-50">
              <KeyRound className="h-4 w-4 text-zinc-400" />
              {headline}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">{body}</DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-2">
            {answer.reason === 'signed_out' && (
              <Button className="w-full" onClick={() => navigate('/?auth=signin')}>
                Sign in
              </Button>
            )}

            {answer.reason === 'no_wallet' && (
              <Button
                className="w-full"
                disabled={connecting}
                onClick={async () => {
                  setConnecting(true);
                  try {
                    await requestWalletConnection();
                    onRetry?.();
                  } finally {
                    setConnecting(false);
                  }
                }}
              >
                {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                Connect wallet
              </Button>
            )}

            {answer.reason === 'check_failed' && onRetry && (
              <Button className="w-full" onClick={onRetry}>Try again</Button>
            )}

            {(answer.reason === 'not_enough' || answer.reason === 'no_wallet') && canBuy && (
              <Button
                className="w-full"
                variant={answer.reason === 'no_wallet' ? 'secondary' : 'default'}
                onClick={() => setBuying(true)}
              >
                {`Get ${tokenSymbol}`}
              </Button>
            )}

            <Button
              variant="ghost"
              className="w-full text-zinc-300 hover:text-zinc-100"
              onClick={() => {
                onOpenChange(false);
                navigate(streetPath);
              }}
            >
              {`Step into ${artistName}'s world and watch the preview`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {buying && answer.coinAddress && (
        <GetKeyModal
          open
          onOpenChange={(next) => setBuying(next)}
          coinAddress={answer.coinAddress}
          symbol={tokenSymbol}
          artistName={artistName}
          worldSlug={answer.worldSlug}
          onBought={() => {
            setBuying(false);
            onRetry?.();
          }}
        />
      )}
    </>
  );
}
