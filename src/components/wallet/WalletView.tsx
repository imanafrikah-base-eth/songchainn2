import { songPath, artistPath } from '@/lib/slugRoutes';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import {
  Wallet as WalletIcon, ArrowLeft, ExternalLink, Coins, Receipt, Copy, Check, Eye, EyeOff,
  QrCode, Wallet2, Music2, KeyRound, Image as ImageIcon, BadgeCheck, History, RefreshCw, ShoppingBag, ShieldCheck, Swords, Zap,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BuyWwat } from '@/components/BuyWwat';
import { useAuth } from '@/context/AuthContext';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useOwnedSongs } from '@/hooks/useOwnedSongs';
import { SONGS } from '@/data/musicData';
import { ARTIST_COINS } from '@/lib/artistCoins';
import { WWAT_TOKEN_ADDRESS, wwatIsLive } from '@/battlezone/config';
import { requestWalletConnection } from '@/lib/walletGate';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MyWalletsPanel } from '@/components/wallet/MyWalletsPanel';
import { useMyWallets, WALLET_NAMES, shortAddress } from '@/hooks/useMyWallets';
import { useWalletHoldings } from '@/hooks/useWalletHoldings';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { getWalletProvider, switchToBaseChain, BASE_CHAIN_ID_HEX } from '@/lib/baseWallet';
import { useMyDayOnes } from '@/lib/dayOnes';
import { DayOneCard } from '@/components/dayones/DayOneCard';
import { getEthUsdPrice } from '@/lib/ethPrice';
import { cn } from '@/lib/utils';

/**
 * The wallet, built like a wallet.
 *
 * One card up top says which wallet this is, what it is worth and whether it is
 * on Base, with the four things people actually do from a wallet one tap away.
 * Under it, everything SONGCHAINN put in that wallet sits in tabs, music first
 * among the holdings, so nothing is a long scroll away.
 *
 * The dollar figure is only ever ETH at a live price plus USDC. When the price
 * cannot be had the card shows the ETH amount instead, never a guess, and
 * artist coins and drops are counted, not priced.
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

/** The receipts this person holds, newest first. RLS scopes the rows to the signed-in user. */
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

function useEthUsd() {
  return useQuery({ queryKey: ['eth-usd'], staleTime: 5 * 60_000, queryFn: getEthUsdPrice });
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const HIDE_KEY = 'wallet-hide-balances';
function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

/** A quiet mark made from the address, so two wallets never look alike. */
function AddressMark({ address, className }: { address: string; className?: string }) {
  const hue = (i: number) => parseInt(address.slice(2 + i * 6, 8 + i * 6) || '0', 16) % 360;
  return (
    <span
      aria-hidden="true"
      className={cn('block shrink-0 rounded-full ring-1 ring-border', className)}
      style={{
        background: `conic-gradient(from ${hue(3)}deg, hsl(${hue(0)} 28% 52%), hsl(${hue(1)} 24% 40%), hsl(${hue(2)} 30% 58%), hsl(${hue(0)} 28% 52%))`,
      }}
    />
  );
}

type TabId = 'tokens' | 'music' | 'keys' | 'art' | 'dayones' | 'activity';

/**
 * One wallet, two rooms. On SONGCHAINN it wears the logo's bright blue; inside
 * WaveWarz Africa it wears the battle zone: the dark arena, neon green and cyan,
 * and $WWAT first, because that is what hosts a battle and turns the voice on.
 */
export type WalletLook = 'songchainn' | 'wavewarz';

const LOOKS = {
  songchainn: {
    title: 'Wallet',
    back: '/',
    card: 'wallet-card',
    sheet: 'wallet-theme',
    action: 'bg-white text-[#0747B8]',
    value: '',
    bars: 'white',
    barsOpacity: 'opacity-[0.16]',
    chip: 'border-white/30 bg-white/15',
    tabBar: 'bg-foreground',
    sticky: 'top-14 sm:top-16',
    badge: null,
  },
  wavewarz: {
    title: 'Battle wallet',
    back: '/wavewarz-africa',
    card: 'wallet-card-wavewarz',
    sheet: 'wavewarz-theme',
    action: 'bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--neon-green)/0.45)]',
    value: 'text-glow-green',
    bars: 'url(#wallet-eq-battle)',
    barsOpacity: 'opacity-40',
    chip: 'border-primary/40 bg-primary/10',
    tabBar: 'bg-primary shadow-[0_0_10px_hsl(var(--neon-green)/0.7)]',
    // The battle zone bar is 64px at every width.
    sticky: 'top-16',
    badge: 'WaveWarz Africa',
  },
} as const;

export function WalletView({ look = 'songchainn' }: { look?: WalletLook }) {
  const L = LOOKS[look];
  const battle = look === 'wavewarz';
  const [wwatOpen, setWwatOpen] = useState(false);
  const { user, walletAddress: sessionWallet } = useAuth();
  const { active } = useMyWallets();
  // The wallet that pays, then whatever this session connected.
  const walletAddress = active?.address ?? sessionWallet;
  const walletName = active ? WALLET_NAMES[active.provider] : 'Connected wallet';

  const { balance: ethBalance, display: ethDisplay, isLoading: balanceLoading, refetch: refetchBalance } = useWalletBalance(walletAddress);
  const { data: holdings, isLoading: holdingsLoading, refetch: refetchHoldings, isFetching: holdingsFetching } = useWalletHoldings(walletAddress);
  const { data: ethUsd } = useEthUsd();
  const { songs: publishedSongs } = usePublishedCatalog();
  const { data: dayOnes = [] } = useMyDayOnes();
  const { ownedSongs, isLoading: ownedLoading } = useOwnedSongs();
  const { data: purchases = [], isLoading: purchasesLoading } = useMyPurchases(user?.id);

  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [hidden, setHidden] = useState(readHidden);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const walletsRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId | null) ?? 'tokens';
  const setTab = (next: TabId) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p, { replace: true });
  };

  // Everything here is on Base. A wallet pointed at another network gets one clear way back.
  useEffect(() => {
    const provider = getWalletProvider();
    if (!provider || !walletAddress) return;
    let cancelled = false;
    const check = () =>
      void provider
        .request({ method: 'eth_chainId' })
        .then((id: string) => { if (!cancelled) setWrongNetwork(String(id).toLowerCase() !== BASE_CHAIN_ID_HEX); })
        .catch(() => undefined);
    check();
    const onChain = () => check();
    (provider as unknown as { on?: (e: string, f: () => void) => void }).on?.('chainChanged', onChain);
    return () => {
      cancelled = true;
      (provider as unknown as { removeListener?: (e: string, f: () => void) => void }).removeListener?.('chainChanged', onChain);
    };
  }, [walletAddress]);

  const allSongs = useMemo(() => [...SONGS, ...publishedSongs], [publishedSongs]);
  const songById = useMemo(() => new Map(allSongs.map((s) => [String(s.id), s])), [allSongs]);

  const ownedWithTitles = useMemo(
    () =>
      (ownedSongs ?? [])
        .filter((o) => o.balance > 0n)
        .map((o) => ({ ...o, song: songById.get(String(o.songId)) ?? null })),
    [ownedSongs, songById],
  );

  const eth = Number(ethBalance ?? 0);
  const usdc = holdings?.usdc ?? 0;
  const ethValue = ethUsd ? eth * ethUsd : null;
  const totalUsd = ethValue !== null ? ethValue + usdc : null;
  const valueLoading = (balanceLoading && !ethDisplay) || holdingsLoading;

  const toggleHidden = () => {
    setHidden((h) => {
      try {
        localStorage.setItem(HIDE_KEY, h ? '0' : '1');
      } catch {
        /* the toggle still works for this visit */
      }
      return !h;
    });
  };

  const copyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      toast.success('Address copied');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('Could not copy', { description: walletAddress });
    }
  };

  const refreshAll = () => {
    void refetchBalance();
    void refetchHoldings();
  };

  const mask = (s: string) => (hidden ? '••••' : s);

  if (!user) {
    return (
      <div className="px-4 py-16 pb-28 text-center">
        <div className="mx-auto max-w-2xl">
          <WalletIcon className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="mb-2 font-heading text-2xl font-bold">{battle ? 'Your battle wallet' : 'Your wallet'}</h1>
          <p className="mb-6 text-sm text-muted-foreground">Sign in to see what you hold.</p>
          <Link
            to="/?auth=signin"
            className="inline-flex items-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const wwatRow = wwatIsLive() ? (
    <TokenRow
      symbol="WWAT"
      name="WaveWarz Africa"
      amount={holdingsLoading ? null : mask(Math.floor(holdings?.wwat ?? 0).toLocaleString())}
      note={battle ? 'Hosts battles and turns the voice on' : 'Hosts a battle. Watching and voting stay free.'}
      href={`https://zora.co/coin/base:${WWAT_TOKEN_ADDRESS}`}
    />
  ) : null;

  const tabs: Array<{ id: TabId; label: string; icon: typeof Coins; count?: number }> = [
    { id: 'tokens', label: 'Tokens', icon: Coins },
    { id: 'music', label: 'Music', icon: Music2, count: walletAddress ? ownedWithTitles.length : undefined },
    { id: 'keys', label: 'Keys', icon: KeyRound, count: walletAddress ? holdings?.artistCoins.length : undefined },
    { id: 'art', label: 'Art', icon: ImageIcon, count: walletAddress ? holdings?.drops.length : undefined },
    { id: 'dayones', label: 'Day Ones', icon: BadgeCheck, count: dayOnes.length },
    { id: 'activity', label: 'Activity', icon: History, count: purchases.length },
  ];

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 py-6 pb-28 sm:py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to={L.back}
              aria-label="Back"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              {L.badge && (
                <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <Zap className="h-3 w-3" /> {L.badge}
                </p>
              )}
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{L.title}</h1>
            </div>
          </div>
          {walletAddress && (
            <button
              type="button"
              onClick={refreshAll}
              aria-label="Refresh balances"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className={cn('h-4 w-4', holdingsFetching && 'animate-spin')} />
            </button>
          )}
        </div>

        {/* The card, in the blue of the logo's equaliser. */}
        <section className={`${L.card} relative overflow-hidden rounded-3xl p-5 shadow-sm sm:p-7`} aria-label="Wallet summary">
          <EqualiserBars fill={L.bars} className={L.barsOpacity} />

          {!walletAddress ? (
            <div className="relative">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <Wallet2 className="h-6 w-6 text-white" />
              </span>
              <h2 className="mt-4 font-heading text-xl font-bold text-white sm:text-2xl">No wallet connected</h2>
              <p className="mt-1 max-w-prose text-sm text-white/80">
                You do not need one to listen, post or release your music. Connect one when you want to own a song,
                hold an artist's key or back a side in a battle.
              </p>
              <button
                type="button"
                onClick={() => void requestWalletConnection()}
                className={`mt-5 inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold transition-transform active:scale-95 ${L.action}`}
              >
                <WalletIcon className="h-4 w-4" /> Connect a wallet
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <AddressMark address={walletAddress} className="h-11 w-11 ring-white/40" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{walletName}</p>
                    <button
                      type="button"
                      onClick={() => void copyAddress()}
                      className="inline-flex min-h-8 items-center gap-1.5 font-mono text-xs text-white/80 hover:text-white"
                      aria-label="Copy wallet address"
                    >
                      {shortAddress(walletAddress)}
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
                {wrongNetwork ? (
                  <button
                    type="button"
                    onClick={() => {
                      const provider = getWalletProvider();
                      if (provider) void switchToBaseChain(provider).then((ok) => ok && setWrongNetwork(false));
                    }}
                    className="inline-flex min-h-9 items-center gap-2 rounded-full bg-amber-300 px-3 text-xs font-semibold text-black"
                  >
                    <span className="h-2 w-2 rounded-full bg-black/70" /> Wrong network, switch to Base
                  </button>
                ) : (
                  <span className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold text-white ${L.chip}`}>
                    <span className="h-2 w-2 rounded-full bg-emerald-300" /> Base
                  </span>
                )}
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-white/75">
                    {totalUsd !== null ? 'Estimated value' : 'Balance'}
                  </p>
                  <button
                    type="button"
                    onClick={toggleHidden}
                    aria-label={hidden ? 'Show balances' : 'Hide balances'}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/75 hover:text-white"
                  >
                    {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {valueLoading ? (
                  <div className="mt-1 h-11 w-48 animate-pulse rounded-lg bg-white/20" />
                ) : (
                  <p className={`font-heading text-4xl font-bold tabular-nums tracking-tight text-white sm:text-5xl ${L.value}`}>
                    {mask(totalUsd !== null ? usd.format(totalUsd) : `${ethDisplay ?? '0'} ETH`)}
                  </p>
                )}
                <p className="mt-1 text-xs tabular-nums text-white/80">
                  {mask(`${ethDisplay ?? '0'} ETH`)} · {mask(`${usdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`)}
                  {totalUsd !== null && ' · ETH at a live price, coins not counted'}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-4 gap-2 sm:max-w-md">
                <CardAction icon={QrCode} label="Receive" onClick={() => setReceiveOpen(true)} tone={L.action} />
                <CardAction icon={copied ? Check : Copy} label={copied ? 'Copied' : 'Copy'} onClick={() => void copyAddress()} tone={L.action} />
                {battle ? (
                  <>
                    {wwatIsLive() && <CardAction icon={Coins} label="Get $WWAT" onClick={() => setWwatOpen(true)} tone={L.action} />}
                    <CardAction icon={Swords} label="Battles" to="/wavewarz-africa/battles/live" tone={L.action} />
                  </>
                ) : (
                  <>
                    <CardAction icon={ShoppingBag} label="Collect" to="/marketplace" tone={L.action} />
                    <CardAction
                      icon={Wallet2}
                      label="Wallets"
                      onClick={() => walletsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      tone={L.action}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Said plainly, once, where the money is. */}
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-semibold text-foreground">Your wallet stays yours.</span>{' '}
            {battle ? 'WaveWarz Africa and $ongChainn are not wallets and never hold' : '$ongChainn is not a wallet and never holds'}{' '}
            your money or your keys. This page simply shows what is in the wallet you connected, and nothing
            ever moves unless you approve it yourself, in your own wallet.
          </span>
        </p>


        {/* What is in it, at a glance. */}
        <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Holdings">
          <Stat label="Songs owned" value={walletAddress ? (ownedLoading ? null : ownedWithTitles.length) : 0} onClick={() => setTab('music')} />
          <Stat label="Artist keys" value={walletAddress ? (holdingsLoading ? null : holdings?.artistCoins.length ?? 0) : 0} onClick={() => setTab('keys')} />
          <Stat label="Art and drops" value={walletAddress ? (holdingsLoading ? null : holdings?.drops.length ?? 0) : 0} onClick={() => setTab('art')} />
          <Stat label="Day Ones" value={dayOnes.length} onClick={() => setTab('dayones')} />
        </section>

        {/* The tabs. */}
        <div className={`sticky ${L.sticky} z-10 -mx-4 mt-6 border-b border-border bg-background px-4 sm:mx-0 sm:px-0`}>
          <div role="tablist" aria-label="Wallet sections" className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-medium transition-colors',
                  tab === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                {typeof t.count === 'number' && t.count > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-foreground">{t.count}</span>
                )}
                {tab === t.id && <span className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full ${L.tabBar}`} />}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 min-h-[12rem]" role="tabpanel">
          {tab === 'tokens' && (
            walletAddress ? (
              <>
              <ul className={`divide-y divide-border overflow-hidden rounded-2xl border bg-card ${battle ? 'border-primary/30' : 'border-border'}`}>
                {battle && wwatRow}
                <TokenRow
                  symbol="ETH"
                  name="Ether on Base"
                  amount={balanceLoading && !ethDisplay ? null : mask(ethDisplay ?? '0')}
                  value={ethValue !== null ? mask(usd.format(ethValue)) : undefined}
                  note="Pays for songs, keys and gas"
                />
                <TokenRow
                  symbol="USDC"
                  name="USD Coin on Base"
                  amount={holdingsLoading ? null : mask(usdc.toLocaleString(undefined, { maximumFractionDigits: 2 }))}
                  value={holdingsLoading ? undefined : mask(usd.format(usdc))}
                />
                {!battle && wwatRow}
              </ul>
              {battle && (
                <p className="mt-3 text-xs text-muted-foreground">
                  $WWAT hosts a battle and turns on in-app voice. Watching, voting and chat are free, always.
                </p>
              )}
              </>
            ) : (
              <NeedsWallet what="Your ETH, USDC and $WWAT on Base show here." />
            )
          )}

          {tab === 'music' && (
            !walletAddress ? (
              <NeedsWallet what="The songs you own show here, with unlimited streaming of each." />
            ) : ownedLoading ? (
              <GridSkeleton />
            ) : ownedWithTitles.length === 0 ? (
              <Empty
                icon={Music2}
                title="No songs owned yet"
                body="Owning a song gets you unlimited streaming of it, and you can sell it on whenever you like."
                cta={{ label: 'Find a song to own', to: '/marketplace' }}
              />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ownedWithTitles.map((o) => (
                  <li key={o.songId}>
                    <Link
                      to={o.song ? songPath(o.song) : '/marketplace'}
                      className="group block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-foreground/30"
                    >
                      {o.song?.coverImage ? (
                        <img src={o.song.coverImage} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center bg-muted">
                          <Music2 className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="p-3">
                        <p className="truncate text-sm font-semibold text-foreground">{o.song?.title ?? 'A song'}</p>
                        <p className="truncate text-xs text-muted-foreground">{o.song?.artist ?? ''}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          )}

          {tab === 'keys' && (
            !walletAddress ? (
              <NeedsWallet what="Artist coins open the doors to their worlds, and they show here." />
            ) : holdingsLoading ? (
              <ListSkeleton />
            ) : !holdings?.artistCoins.length ? (
              <Empty
                icon={KeyRound}
                title="No artist keys yet"
                body={`Holding enough of an artist's coin opens their world. ${ARTIST_COINS.length} artists have one, and it pays them every time it trades.`}
                cta={{ label: 'See the artists', to: '/marketplace' }}
              />
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {holdings.artistCoins.map((c) => (
                  <li key={c.coinAddress} className="flex items-center gap-3 p-4">
                    <AddressMark address={c.coinAddress} className="h-10 w-10" />
                    <span className="min-w-0 flex-1">
                      <Link to={artistPath(c.artistId)} className="block truncate text-sm font-semibold text-foreground hover:underline">
                        {c.name}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">@{c.zoraHandle}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-sm font-semibold tabular-nums text-foreground">
                        {mask(c.amount >= 1 ? Math.floor(c.amount).toLocaleString() : c.amount.toFixed(4))}
                      </span>
                      <a
                        href={`https://zora.co/coin/base:${c.coinAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Zora <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            )
          )}

          {tab === 'art' && (
            !walletAddress ? (
              <NeedsWallet what="Art and records you collect inside artist worlds show here." />
            ) : holdingsLoading ? (
              <GridSkeleton />
            ) : !holdings?.drops.length ? (
              <Empty
                icon={ImageIcon}
                title="Nothing collected yet"
                body="Drops are minted inside artist worlds. Walk into one and see what is on the wall."
                cta={{ label: 'Walk the worlds', to: '/worlds' }}
              />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {holdings.drops.map((d) => (
                  <li key={d.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                    {d.imageUrl ? (
                      <img src={d.imageUrl} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="aspect-square w-full bg-muted" />
                    )}
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold text-foreground">{d.title}</p>
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="tabular-nums">x{d.amount}</span>
                        <a
                          href={`https://zora.co/collect/base:${d.contract}/${d.tokenId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-8 items-center gap-1 font-medium hover:text-foreground"
                        >
                          Zora <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}

          {tab === 'dayones' && (
            dayOnes.length === 0 ? (
              <Empty
                icon={BadgeCheck}
                title="No Day Ones yet"
                body="Really listen to a song and like it, and you get its number for good. The earlier you are, the lower it is."
                cta={{ label: 'What is a Day One?', to: '/day-ones' }}
              />
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {dayOnes.filter((d) => d.attestation_uid).length} of {dayOnes.length} recorded on Base
                  </p>
                  <Link to="/day-ones" className="text-xs font-semibold text-foreground hover:underline">
                    Open Day Ones
                  </Link>
                </div>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {dayOnes.map((r) => (
                    <li key={r.id}>
                      <Link to="/day-ones" className="block">
                        <DayOneCard receipt={r} size="sm" className="w-full" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )
          )}

          {tab === 'activity' && (
            purchasesLoading ? (
              <ListSkeleton />
            ) : purchases.length === 0 ? (
              <Empty
                icon={Receipt}
                title="No purchases yet"
                body="Every copy you buy shows up here with what you paid and a link to the transaction."
              />
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {purchases.map((p) => {
                  const song = songById.get(String(p.song_id)) ?? null;
                  const copies = Number(p.copies ?? 0);
                  const paid = Number(p.usd_paid ?? 0);
                  const when = p.purchased_at ? new Date(p.purchased_at) : null;
                  return (
                    <li key={p.id} className="flex items-center gap-3 p-4">
                      {song?.coverImage ? (
                        <img src={song.coverImage} alt="" className="h-11 w-11 rounded-xl object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
                          <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </div>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {song ? <Link to={songPath(song)} className="hover:underline">Bought {song.title}</Link> : 'Bought a song'}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {when && !Number.isNaN(when.getTime())
                            ? when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                            : ''}
                          {song?.artist ? ` · ${song.artist}` : ''}
                          {` · ${copies} ${copies === 1 ? 'copy' : 'copies'}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums text-foreground">{mask(usd.format(paid))}</span>
                        {p.tx_hash && (
                          <a
                            href={`https://basescan.org/tx/${p.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                          >
                            Receipt <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>

        {/* Which wallets are here, and which one pays. */}
        <div ref={walletsRef} className="mt-10 scroll-mt-24">
          <MyWalletsPanel />
        </div>

        {walletAddress && (
          <a
            href={`https://basescan.org/address/${walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            See this wallet on Basescan <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {walletAddress && (
        <Sheet open={receiveOpen} onOpenChange={setReceiveOpen}>
          <SheetContent side="bottom" className={`${L.sheet} mx-auto max-w-md rounded-t-3xl`}>
            <SheetHeader className="text-center">
              <SheetTitle>Receive on Base</SheetTitle>
              <SheetDescription>
                Send ETH, USDC or any Base token to this address. Only use the Base network, or it will not arrive here.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-5 flex flex-col items-center gap-4 pb-4">
              <div className="rounded-2xl bg-white p-4">
                <QRCodeSVG value={walletAddress} size={184} level="M" />
              </div>
              <p className="max-w-full break-all px-2 text-center font-mono text-xs text-muted-foreground">{walletAddress}</p>
              <Button className="h-11 w-full max-w-xs gap-2 rounded-full" onClick={() => void copyAddress()}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy address'}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {battle && (
        <Sheet open={wwatOpen} onOpenChange={setWwatOpen}>
          <SheetContent side="bottom" className="wavewarz-theme mx-auto max-w-md rounded-t-3xl">
            <SheetHeader className="text-center">
              <SheetTitle>Get $WWAT</SheetTitle>
              <SheetDescription>Bought in your own wallet, on Base. You approve it there.</SheetDescription>
            </SheetHeader>
            <div className="mt-5 pb-4">
              <BuyWwat />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

function CardAction({
  icon: Icon,
  label,
  onClick,
  to,
  tone,
}: {
  icon: typeof Coins;
  label: string;
  onClick?: () => void;
  to?: string;
  tone: string;
}) {
  const inner = (
    <>
      <span className={`flex h-12 w-12 items-center justify-center rounded-full transition-transform group-hover:scale-105 group-active:scale-95 ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="whitespace-nowrap text-xs font-medium text-white">{label}</span>
    </>
  );
  const cls = 'group flex flex-col items-center gap-1.5';
  return to ? (
    <Link to={to} className={cls}>{inner}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{inner}</button>
  );
}

/** The logo's equaliser, faint, rising along the bottom of the card. */
function EqualiserBars({ fill, className }: { fill: string; className?: string }) {
  const heights = [18, 30, 22, 44, 34, 58, 40, 70, 52, 82, 60, 48, 74, 38, 56, 28, 42, 20, 32, 16];
  return (
    <svg
      aria-hidden="true"
      className={cn('pointer-events-none absolute bottom-0 right-0 h-24 w-2/5 sm:h-28 sm:w-1/3', className)}
      viewBox="0 0 200 90"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="wallet-eq-battle" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="hsl(145 80% 45%)" />
          <stop offset="100%" stopColor="hsl(195 90% 55%)" />
        </linearGradient>
      </defs>
      {heights.map((h, i) => (
        <rect key={i} x={i * 10 + 2} y={90 - h} width="6" height={h} rx="1.5" fill={fill} />
      ))}
    </svg>
  );
}

function Stat({ label, value, onClick }: { label: string; value: number | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-foreground/30"
    >
      {value === null ? (
        <span className="block h-7 w-8 animate-pulse rounded bg-muted" />
      ) : (
        <span className="block font-heading text-2xl font-bold tabular-nums text-foreground">{value}</span>
      )}
      <span className="block text-xs text-muted-foreground">{label}</span>
    </button>
  );
}

function TokenRow({
  symbol,
  name,
  amount,
  value,
  note,
  href,
}: {
  symbol: string;
  name: string;
  amount: string | null;
  value?: string;
  note?: string;
  href?: string;
}) {
  return (
    <li className="flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold tracking-tight text-foreground">
        {symbol.slice(0, 4)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {symbol === 'WWAT' ? '$WWAT' : symbol}
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${symbol} on Zora`} className="-my-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{note ?? name}</span>
      </span>
      <span className="shrink-0 text-right">
        {amount === null ? (
          <span className="block h-4 w-16 animate-pulse rounded bg-muted" />
        ) : (
          <span className="block font-mono text-sm font-semibold tabular-nums text-foreground">{amount}</span>
        )}
        {value && <span className="block text-xs tabular-nums text-muted-foreground">{value}</span>}
      </span>
    </li>
  );
}

function Empty({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: typeof Coins;
  title: string;
  body: string;
  cta?: { label: string; to: string };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {cta && (
        <Button asChild variant="outline" size="sm" className="mt-4 h-10 rounded-full px-5">
          <Link to={cta.to}>{cta.label}</Link>
        </Button>
      )}
    </div>
  );
}

function NeedsWallet({ what }: { what: string }): ReactNode {
  return (
    <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">{what}</p>
      <Button className="mt-4 h-10 gap-2 rounded-full px-5" onClick={() => void requestWalletConnection()}>
        <WalletIcon className="h-4 w-4" /> Connect a wallet
      </Button>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}
