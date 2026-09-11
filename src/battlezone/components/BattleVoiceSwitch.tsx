import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mic } from 'lucide-react';
import { BuyWwat } from '@/components/BuyWwat';
import { enableVoice, payVoiceFee, quoteVoice, type VoiceQuote } from '@/battlezone/lib/voiceFee';

/**
 * The host turning on in-app voice for this battle.
 *
 * Says what it costs before anything is signed, pays from the host's own
 * wallet, and only reports voice as on once the server has read the payment
 * back off Base. A host who hosts voice free sees one button and no wallet.
 * If a payment went out but the switch did not flip, the transaction is kept
 * on screen so it can be checked again without paying twice.
 */
export function BattleVoiceSwitch({ battleId, onEnabled }: { battleId: string; onEnabled: () => void }) {
  const [quote, setQuote] = useState<VoiceQuote | null>(null);
  const [busy, setBusy] = useState<'quote' | 'paying' | 'checking' | null>('quote');
  const [message, setMessage] = useState<string | null>(null);
  const [paidTx, setPaidTx] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy('quote');
    try {
      setQuote(await quoteVoice(battleId));
      setMessage(null);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [battleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const turnOn = async () => {
    if (!quote) return;
    setMessage(null);
    try {
      let tx = paidTx;
      if (!quote.exempt && !tx) {
        setBusy('paying');
        tx = await payVoiceFee(quote);
        setPaidTx(tx);
      }
      setBusy('checking');
      await enableVoice(battleId, quote.exempt ? undefined : tx ?? undefined);
      setPaidTx(null);
      onEnabled();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 backdrop-blur">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
        <Mic className="h-4 w-4 text-primary" /> In-app voice
      </h3>

      {busy === 'quote' && !quote ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : quote && !quote.available ? (
        <p className="text-xs text-muted-foreground">{quote.reason}</p>
      ) : quote ? (
        <>
          <p className="text-xs text-muted-foreground">
            {quote.exempt
              ? 'Talk to the room from here, bring people up to speak, and take requests. Free for you.'
              : `Talk to the room from here, bring people up to speak, and take requests. It costs $${quote.usd} in $WWAT${quote.amountDisplay ? `, about ${quote.amountDisplay} $WWAT at today's price` : ''}, paid from your wallet to the WaveWarz Africa treasury.`}
          </p>
          {paidTx ? (
            <p className="mt-2 text-xs text-foreground">
              Payment sent: {paidTx.slice(0, 10)}... Turning voice on checks it on Base, so you never pay twice.
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void turnOn()}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy === 'paying' || busy === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            {busy === 'paying'
              ? 'Waiting for your wallet'
              : busy === 'checking'
                ? 'Checking the payment'
                : quote.exempt || paidTx
                  ? 'Turn on voice'
                  : `Pay $${quote.usd} and turn on voice`}
          </button>
          {!quote.exempt ? (
            <div className="mt-3">
              <BuyWwat compact />
            </div>
          ) : null}
        </>
      ) : null}

      {message ? <p className="mt-2 text-xs text-live">{message}</p> : null}
    </div>
  );
}

export default BattleVoiceSwitch;
