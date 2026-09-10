// A world's drops, and the card that collects one.
//
// A drop is a Zora 1155 token on Base that the artist made from inside their
// world (src/lib/nft.ts). This is the collector's side: what it is, what it
// costs, how many are left, and a Collect button that mints to the connected
// wallet with the connected wallet. Supply is read from the chain on every
// card, not from the row, so "3 of 50 left" is always what Base says.
//
// INSIDE THE ANDROID SHELL there is no Collect button. Google Play reads a
// mint for money inside the app as digital goods sold outside Play Billing,
// so the native build shows the drop and says where to collect it, the same
// rule GetKeyCta follows.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Gem, KeyRound, Loader2, Minus, Plus, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConsentNotice } from '@/components/ConsentNotice';
import { isNativeApp } from '@/lib/native';
import { requestWalletConnection } from '@/lib/walletGate';
import { getConnectedAccounts } from '@/lib/baseWallet';
import {
  basescanTokenUrl,
  collectOnChain,
  formatEth,
  quoteCollect,
  readTokenInfo,
  zoraCollectUrl,
  type DropTerms,
} from '@/lib/nft';
import { useWorldDrops, type WorldNft } from '@/hooks/useWorldNfts';
import { usePlayerActions } from '@/context/PlayerContext';
import { SONGS } from '@/data/musicData';
import type { Address } from 'viem';

export function termsOf(drop: WorldNft): DropTerms {
  return {
    priceEth: String(drop.price_eth ?? 0),
    copies: drop.copies,
    perWallet: drop.per_wallet,
    saleEnd: drop.sale_end ? new Date(drop.sale_end) : null,
  };
}

function kindLabel(kind: WorldNft['kind']): string {
  return kind === 'song' ? 'Song' : kind === 'artwork' ? 'Artwork' : 'Content';
}

/** Live supply from Base. Null while loading or if the read fails. */
function useSupply(drop: WorldNft) {
  const [supply, setSupply] = useState<{ minted: number; max: number | null } | null>(null);
  const contract = drop.contract_address as Address | null;
  const tokenId = drop.token_id;
  useEffect(() => {
    let live = true;
    if (!contract || tokenId == null) return;
    void readTokenInfo(contract, BigInt(tokenId))
      .then((info) => {
        if (!live) return;
        const max = info.maxSupply >= 2n ** 63n ? null : Number(info.maxSupply);
        setSupply({ minted: Number(info.totalMinted), max });
      })
      .catch(() => {
        if (live) setSupply(null);
      });
    return () => {
      live = false;
    };
  }, [contract, tokenId, drop.updated_at]);
  return supply;
}

export function DropCard({
  drop,
  showWorld = false,
  dark = false,
}: {
  drop: WorldNft;
  /** Outside the world (the marketplace), say which world it is from. */
  showWorld?: boolean;
  /** World #001 is drawn on a dark ground; the rest of the app is themed. */
  dark?: boolean;
}) {
  const supply = useSupply(drop);
  const { playSong } = usePlayerActions();
  const [qty, setQty] = useState(1);
  const [stage, setStage] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ total: string; fee: string } | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const native = isNativeApp();

  const soldOut = supply?.max != null && supply.minted >= supply.max;
  const closed = drop.sale_end ? new Date(drop.sale_end).getTime() < Date.now() : false;
  const paused = drop.status === 'paused';
  const canCollect = drop.status === 'live' && !soldOut && !closed && !native
    && drop.contract_address && drop.token_id != null && drop.minter_address && drop.contract_version;

  const song = useMemo(() => (drop.song_id ? SONGS.find((s) => s.id === drop.song_id) ?? null : null), [drop.song_id]);

  useEffect(() => {
    let live = true;
    void getConnectedAccounts().then((a) => {
      if (live && a[0]) setWallet(a[0]);
    });
    return () => {
      live = false;
    };
  }, []);

  // A quote before the wallet opens, so the total is never a surprise.
  useEffect(() => {
    let live = true;
    if (!canCollect || !wallet) {
      setQuote(null);
      return;
    }
    void quoteCollect({
      account: wallet as Address,
      contract: drop.contract_address as Address,
      tokenId: BigInt(drop.token_id as number),
      minter: drop.minter_address as Address,
      contractVersion: drop.contract_version as string,
      terms: termsOf(drop),
      quantity: qty,
    })
      .then((q) => {
        if (live) setQuote({ total: formatEth(q.totalWei), fee: formatEth(q.feeWei) });
      })
      .catch(() => {
        if (live) setQuote(null);
      });
    return () => {
      live = false;
    };
  }, [canCollect, wallet, qty, drop]);

  const collect = async () => {
    if (!canCollect) return;
    let account = wallet;
    if (!account) {
      account = await requestWalletConnection();
      if (!account) return;
      setWallet(account);
    }
    try {
      setStage('Preparing');
      const { txHash } = await collectOnChain({
        account: account as Address,
        contract: drop.contract_address as Address,
        tokenId: BigInt(drop.token_id as number),
        minter: drop.minter_address as Address,
        contractVersion: drop.contract_version as string,
        terms: termsOf(drop),
        quantity: qty,
        onStage: setStage,
      });
      setDone(txHash);
      toast.success(`${drop.title} is in your wallet`, {
        description: qty > 1 ? `${qty} copies, on Base.` : 'One copy, on Base.',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The mint did not go through';
      toast.error('Not collected', { description: /reject|denied/i.test(msg) ? 'You closed the wallet prompt.' : msg });
    } finally {
      setStage(null);
    }
  };

  const text = dark ? 'text-white' : 'text-foreground';
  const muted = dark ? 'text-white/60' : 'text-muted-foreground';
  const frame = dark ? 'border-white/10 bg-white/5' : 'border-border bg-card';
  const priceLabel = Number(drop.price_eth) > 0 ? `${drop.price_eth} ETH` : 'Free, plus fees';

  return (
    <article className={`overflow-hidden rounded-2xl border ${frame}`}>
      <div className="relative aspect-square w-full overflow-hidden bg-black/20">
        <img src={drop.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
          {kindLabel(drop.kind)}
        </span>
        {drop.key_ring ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold text-black">
            <KeyRound className="h-3 w-3" /> {drop.key_ring === 'insider' ? 'Insider key' : 'Fan key'}
          </span>
        ) : null}
        {song ? (
          <button
            type="button"
            onClick={() => playSong(song)}
            aria-label={`Play ${song.title}`}
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg"
          >
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          </button>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h3 className={`font-heading text-lg font-semibold leading-tight ${text}`}>{drop.title}</h3>
          {showWorld ? (
            <Link to={`/w/${drop.world_slug}`} className={`mt-0.5 block text-xs ${muted} underline-offset-4 hover:underline`}>
              From {drop.world_slug.replace(/-/g, ' ')} world
            </Link>
          ) : null}
          {drop.description ? (
            <p className={`mt-1.5 line-clamp-3 text-sm leading-relaxed ${muted}`}>{drop.description}</p>
          ) : null}
        </div>

        <dl className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${muted}`}>
          <div>
            <dt className="sr-only">Price</dt>
            <dd className={`font-semibold ${text}`}>{priceLabel}</dd>
          </div>
          <div>
            <dt className="sr-only">Copies</dt>
            <dd>
              {supply
                ? supply.max == null
                  ? `${supply.minted} collected, open edition`
                  : `${Math.max(0, supply.max - supply.minted)} of ${supply.max} left`
                : drop.copies
                  ? `${drop.copies} copies`
                  : 'Open edition'}
            </dd>
          </div>
          {drop.sale_end ? (
            <div>
              <dt className="sr-only">Closes</dt>
              <dd>{closed ? 'Closed' : `Closes ${new Date(drop.sale_end).toLocaleDateString()}`}</dd>
            </div>
          ) : null}
        </dl>

        {drop.key_ring ? (
          <p className={`text-xs ${muted}`}>
            Holding one opens the {drop.key_ring} doors in this world.
          </p>
        ) : null}

        {done ? (
          <a
            href={`https://basescan.org/tx/${done}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-500"
          >
            Collected. See it on Basescan <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : canCollect ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={`inline-flex items-center rounded-full border ${dark ? 'border-white/15' : 'border-border'}`}>
                <button
                  type="button"
                  aria-label="Fewer copies"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className={`flex h-11 w-11 items-center justify-center ${text}`}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className={`w-6 text-center text-sm tabular-nums ${text}`}>{qty}</span>
                <button
                  type="button"
                  aria-label="More copies"
                  onClick={() => setQty((q) => Math.min(drop.per_wallet ?? 20, q + 1))}
                  className={`flex h-11 w-11 items-center justify-center ${text}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <Button
                onClick={() => void collect()}
                disabled={stage != null}
                className="h-10 flex-1 rounded-full font-semibold"
              >
                {stage ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {stage}
                  </>
                ) : (
                  <>
                    <Gem className="mr-1.5 h-4 w-4" /> Collect{quote ? ` for ${quote.total} ETH` : ''}
                  </>
                )}
              </Button>
            </div>
            {quote ? (
              <p className={`text-[11px] ${muted}`}>
                Includes {quote.fee} ETH protocol fee. Gas on Base is extra and small.
              </p>
            ) : !wallet ? (
              <p className={`text-[11px] ${muted}`}>Connect a wallet to see the exact total.</p>
            ) : null}
            <ConsentNotice which="collect_risk" className="!mt-2" />
          </div>
        ) : (
          <p className={`text-sm ${muted}`}>
            {native
              ? 'Collect this on songchainn.xyz in a browser with your wallet.'
              : soldOut
                ? 'All copies are collected.'
                : closed
                  ? 'This drop has closed.'
                  : paused
                    ? 'The artist has paused this drop.'
                    : 'Not collectable yet.'}
          </p>
        )}

        {drop.contract_address && drop.token_id != null ? (
          <div className={`flex flex-wrap gap-x-3 text-[11px] ${muted}`}>
            <a href={basescanTokenUrl(drop.contract_address, drop.token_id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
              Basescan <ExternalLink className="h-3 w-3" />
            </a>
            <a href={zoraCollectUrl(drop.contract_address, drop.token_id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
              Zora <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Every collectable drop in a world. Renders nothing at all when there are
 * none, so a world without drops looks exactly as it did.
 */
export function WorldDrops({
  worldSlug,
  heading = 'Collectibles',
  note = 'Made here, minted on Base, yours to keep.',
  dark = false,
  limit,
  ownerLink,
}: {
  worldSlug: string;
  heading?: string;
  note?: string;
  dark?: boolean;
  limit?: number;
  /** Where the artist goes to make one; shown only when passed. */
  ownerLink?: string | null;
}) {
  const { data: drops = [], isLoading } = useWorldDrops(worldSlug);
  const shown = limit ? drops.slice(0, limit) : drops;
  if (!isLoading && shown.length === 0 && !ownerLink) return null;

  return (
    <section className="py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className={`font-heading text-xl font-semibold sm:text-2xl ${dark ? 'text-white' : 'text-foreground'}`}>
            {heading}
          </h3>
          {note ? <p className={`mt-1 text-sm ${dark ? 'text-white/60' : 'text-muted-foreground'}`}>{note}</p> : null}
        </div>
        {ownerLink ? (
          <Link
            to={ownerLink}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-xs font-semibold ${
              dark ? 'border-white/15 text-white' : 'border-border text-foreground'
            }`}
          >
            <Gem className="h-3.5 w-3.5" /> Make a drop
          </Link>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className={`text-sm ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
          Nothing has been dropped here yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((d) => (
            <DropCard key={d.id} drop={d} dark={dark} />
          ))}
        </div>
      )}
    </section>
  );
}
