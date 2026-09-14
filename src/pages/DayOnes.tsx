import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, ExternalLink, Loader2, Share2, Wallet as WalletIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useMyWallets, rememberWallet, shortAddress } from '@/hooks/useMyWallets';
import { requestWalletConnection } from '@/lib/walletGate';
import { artistPath } from '@/lib/slugRoutes';
import { DayOneCard } from '@/components/dayones/DayOneCard';
import {
  easscanUrl,
  recordDayOneOnBase,
  useArtistDayOnes,
  useDayOneChainStatus,
  useMyDayOnes,
  type DayOne,
} from '@/lib/dayOnes';

/**
 * Day Ones: the receipts of getting there first.
 *
 * Everybody sees their own cards. An artist also sees their first fans, by
 * name and number, which no other platform shows them.
 */
export default function DayOnes() {
  const { user, isArtist, artistId } = useAuth();
  const { data: mine = [], isLoading } = useMyDayOnes();
  const { data: firstFans = [], isLoading: fansLoading } = useArtistDayOnes(isArtist ? artistId : null, 100);

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navigation />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <header className="mb-8 max-w-2xl">
          <h1 className="font-heading text-3xl font-bold text-foreground">Day Ones</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isArtist
              ? 'The fans who found your music first, in the order they got there, and the cards you earned finding other artists.'
              : 'Proof you got there first. Really listen to a song and like it, and you get its number for good. The earlier you are, the lower it is.'}
          </p>
        </header>

        {isArtist && (
          <section className="mb-10">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your first fans</h2>
              {firstFans.length > 0 && <span className="text-xs text-muted-foreground">{firstFans.length} so far</span>}
            </div>
            {fansLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Finding them
              </div>
            ) : firstFans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Nobody yet. The first person who listens to one of your songs and likes it becomes your Day One #1.
              </div>
            ) : (
              <ol className="grid gap-2 sm:grid-cols-2">
                {firstFans.map((f) => (
                  <li key={f.user_id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <span className="w-12 shrink-0 font-mono text-lg font-bold tabular-nums text-foreground">#{f.fan_number}</span>
                    <Link to={`/audience/${f.user_id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {f.display_name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{f.display_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(f.earned_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </span>
                    </Link>
                    {f.on_chain && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground" title="Recorded on Base">
                        <BadgeCheck className="h-3.5 w-3.5" /> On Base
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isArtist ? 'Artists you found early' : 'Your cards'}
          </h2>
          {!user ? null : isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading your cards
            </div>
          ) : mine.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
              <p className="text-sm text-foreground">No Day Ones yet.</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Play a song you have not heard, and if you like it, tap the heart. The newer the song, the lower your number.
              </p>
              <Button asChild className="mt-4 rounded-full">
                <Link to="/discover">Find something early</Link>
              </Button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map((r) => (
                <li key={r.id} className="flex flex-col items-center gap-3">
                  <DayOneCard receipt={r} />
                  <CardActions receipt={r} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <AudioPlayer />
    </div>
  );
}

function CardActions({ receipt }: { receipt: DayOne }) {
  const queryClient = useQueryClient();
  const { active, refresh } = useMyWallets();
  const { data: chain } = useDayOneChainStatus();
  const [busy, setBusy] = useState(false);

  const link =
    receipt.kind === 'song'
      ? `${window.location.origin}/song/${encodeURIComponent(receipt.target_id)}`
      : `${window.location.origin}${artistPath(receipt.target_id)}`;
  const what = receipt.kind === 'song' ? receipt.song_title ?? 'this record' : receipt.artist_name ?? 'this artist';

  const share = async () => {
    const text = `I am Day One #${receipt.fan_number} for ${what} on SONGCHAINN.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Day One', text, url: link });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${link}`);
      toast.success('Copied', { description: 'Paste it anywhere.' });
    } catch {
      toast.error('Could not copy that');
    }
  };

  const record = async () => {
    setBusy(true);
    try {
      if (!active) {
        const got = await requestWalletConnection();
        if (!got) return;
        await rememberWallet(got, 'other');
        await refresh();
      }
      const res = await recordDayOneOnBase(receipt.id);
      if (res.ok === false) {
        toast.error(res.error);
        return;
      }
      toast.success('Recorded on Base', {
        description: 'It is on chain for good, in your wallet’s name.',
        action: { label: 'View', onClick: () => window.open(res.url, '_blank', 'noopener') },
      });
      await queryClient.invalidateQueries({ queryKey: ['day-ones'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full max-w-[20rem] flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm" className="h-10 flex-1 gap-1.5 rounded-full" onClick={() => void share()}>
        <Share2 className="h-3.5 w-3.5" /> Share
      </Button>
      {receipt.attestation_uid ? (
        <Button asChild size="sm" variant="outline" className="h-10 flex-1 gap-1.5 rounded-full">
          <a href={easscanUrl(receipt.attestation_uid)} target="_blank" rel="noopener noreferrer">
            <BadgeCheck className="h-3.5 w-3.5" /> On Base <ExternalLink className="h-3 w-3" />
          </a>
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          className="h-10 flex-1 gap-1.5 rounded-full"
          disabled={busy || (chain ? !chain.funded : false)}
          onClick={() => void record()}
          title={chain && !chain.funded ? 'Recording on Base opens shortly' : undefined}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WalletIcon className="h-3.5 w-3.5" />}
          {chain && !chain.funded ? 'On Base soon' : active ? 'Record on Base' : 'Connect and record'}
        </Button>
      )}
      {receipt.attested_to && receipt.attestation_uid && (
        <p className="w-full text-center text-[11px] text-muted-foreground">To {shortAddress(receipt.attested_to)}, free, no signature needed</p>
      )}
    </div>
  );
}
