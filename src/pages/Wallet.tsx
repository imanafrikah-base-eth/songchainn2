import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Wallet as WalletIcon, ArrowLeft, ExternalLink, Coins, Loader2 } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { useAuth } from '@/context/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useOwnedSongs } from '@/hooks/useOwnedSongs';
import { SONGS } from '@/data/musicData';
import { ARTIST_COINS } from '@/lib/artistCoins';
import { WWAT_TOKEN_ADDRESS, wwatIsLive } from '@/battlezone/config';
import { requestWalletConnection } from '@/lib/walletGate';
import { Button } from '@/components/ui/button';

/**
 * What you actually hold, with SONGCHAINN's own things first.
 *
 * The ordering is the opinion. A wallet page that leads with an ETH balance is
 * a wallet page for a trader; this one leads with the music you own, because
 * that is what somebody came here for and it is the only holding this app
 * caused. ETH sits above it as a single line, since it is the fuel rather than
 * the point.
 *
 * The suggestions at the bottom are deliberately quiet and deliberately few.
 * Nobody opened their wallet to be sold to, and a page that pushes three coins
 * at you the moment you look at your balance is the exact thing that makes
 * people stop opening it.
 */
export default function Wallet() {
  const { user, walletAddress } = useAuth();
  const { balance, isLoading: balanceLoading } = useWalletBalance(walletAddress);
  const { ownedSongs, isLoading: ownedLoading } = useOwnedSongs();

  const ownedWithTitles = useMemo(
    () =>
      (ownedSongs ?? [])
        .filter((o) => o.balance > 0n)
        .map((o) => ({ ...o, song: SONGS.find((s) => s.id === o.songId) ?? null })),
    [ownedSongs],
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <Navigation />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <WalletIcon className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="mb-2 font-heading text-2xl font-bold">Your wallet</h1>
          <p className="mb-6 text-sm text-muted-foreground">Sign in to see what you hold.</p>
          <Link
            to="/auth"
            className="inline-flex items-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
        <AudioPlayer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navigation />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="mb-2 flex items-center gap-3">
          <WalletIcon className="h-7 w-7 text-primary" />
          <h1 className="font-heading text-3xl font-bold text-foreground">Your wallet</h1>
        </div>

        {!walletAddress ? (
          <div className="live-surface mt-6 rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-medium text-foreground">No wallet connected.</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              You do not need one to listen, post, or release your own music. Connect one when
              you want to own a song or back an artist.
            </p>
            <Button className="mt-4 gap-2" onClick={() => void requestWalletConnection()}>
              <WalletIcon className="h-4 w-4" /> Connect a wallet
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-6 font-mono text-xs text-muted-foreground">
              {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
            </p>

            {/* The music comes first. */}
            <section className="mb-6">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Songs you own
              </h2>
              {ownedLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading the chain
                </div>
              ) : ownedWithTitles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Nothing yet. Owning a song gets you unlimited streaming of it, and you can sell
                  it on whenever you like.
                </div>
              ) : (
                <ul className="space-y-2">
                  {ownedWithTitles.map((o) => (
                    <li
                      key={o.songId}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      {o.song?.coverImage && (
                        <img
                          src={o.song.coverImage}
                          alt=""
                          className="h-11 w-11 rounded-lg object-cover"
                          loading="lazy"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {o.song?.title ?? 'A song'}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {o.song?.artist ?? ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* The fuel, one line, below the point. */}
            <section className="mb-8">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                For fees
              </h2>
              <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                <span className="text-sm text-muted-foreground">ETH on Base</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {balanceLoading || balance == null ? '…' : Number(balance).toFixed(5)}
                </span>
              </div>
            </section>
          </>
        )}

        {/* Quiet, and only two. */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Worth knowing
          </h2>
          <div className="space-y-2">
            <SoftSuggestion
              title="An artist coin is a key, not just a holding"
              body={`Holding enough of an artist's coin opens their world, and there are ${ARTIST_COINS.length} artists with one. It also pays them every time it trades.`}
              href="/marketplace"
              cta="See the artists"
            />
            {wwatIsLive() && (
              <SoftSuggestion
                title="$WWAT is what hosts a battle"
                body="You only need it if you want to run a battle yourself. Watching and voting are free, always."
                href={`https://zora.co/coin/base:${WWAT_TOKEN_ADDRESS}`}
                cta="Look at $WWAT"
                external
              />
            )}
          </div>
        </section>
      </div>
      <AudioPlayer />
    </div>
  );
}

function SoftSuggestion({
  title,
  body,
  href,
  cta,
  external = false,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <Coins className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
            {cta}
            {external && <ExternalLink className="h-3 w-3" aria-hidden="true" />}
          </span>
        </div>
      </div>
    </>
  );

  const className =
    'block rounded-xl border border-border bg-card/60 p-4 transition-colors hover:bg-card';

  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </a>
  ) : (
    <Link to={href} className={className}>
      {inner}
    </Link>
  );
}
