import { songPath } from '@/lib/slugRoutes';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Wallet as WalletIcon, ArrowLeft, ExternalLink, Coins, Loader2, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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
import { MyWalletsPanel } from '@/components/wallet/MyWalletsPanel';

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
interface PurchaseRow {
  id: string;
  song_id: string;
  copies: number;
  usd_paid: number;
  eth_paid: string | number | null;
  tx_hash: string | null;
  purchased_at: string;
}

/**
 * The receipts this person holds, newest first. Same table and client pattern
 * as useSongCopies; RLS scopes the rows to the signed-in user.
 */
function useMyPurchases(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-purchases', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_purchases' as never)
        .select('id, song_id, copies, usd_paid, eth_paid, tx_hash, purchased_at')
        .order('purchased_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PurchaseRow[];
    },
  });
}

export default function Wallet() {
  const { user, walletAddress } = useAuth();
  const { balance, isLoading: balanceLoading } = useWalletBalance(walletAddress);
  const { ownedSongs, isLoading: ownedLoading } = useOwnedSongs();
  const { data: purchases = [], isLoading: purchasesLoading } = useMyPurchases(user?.id);

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
            to="/?auth=signin"
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

        {/* Which wallets are here, and which one pays. Shown either way:
            somebody with none needs the same door as somebody with three. */}
        <MyWalletsPanel className="mb-6 mt-6" />

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

        {/* What was paid, and when. A receipt per purchase, newest first. */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your purchases
          </h2>
          {purchasesLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Finding your receipts
            </div>
          ) : purchases.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No purchases yet. Every copy you buy shows up here with what you paid.
            </div>
          ) : (
            <ul className="space-y-2">
              {purchases.map((p) => {
                const song = SONGS.find((s) => s.id === String(p.song_id)) ?? null;
                const copies = Number(p.copies ?? 0);
                const usd = Number(p.usd_paid ?? 0);
                const when = p.purchased_at ? new Date(p.purchased_at) : null;
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    {song?.coverImage ? (
                      <img
                        src={song.coverImage}
                        alt=""
                        className="h-11 w-11 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted">
                        <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </div>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {song ? (
                          <Link to={songPath(song)} className="hover:text-primary">{song.title}</Link>
                        ) : (
                          'A song'
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {when && !Number.isNaN(when.getTime())
                          ? when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                          : ''}
                        {song?.artist ? ` · ${song.artist}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums text-foreground">
                        ${usd.toFixed(2)}
                      </span>
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {copies} {copies === 1 ? 'copy' : 'copies'}
                      </span>
                      {p.tx_hash && (
                        <a
                          href={`https://basescan.org/tx/${p.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          On chain <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

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
