// The Drops step: an artist turns a song, artwork or any content into an NFT
// on Base, from inside their world, with their own wallet.
//
// Nothing here is a fake button. "Mint on Base" opens the artist's wallet,
// the wallet deploys or extends their own Zora 1155 collection, and the drop
// only reads as live once nft-verify has read the chain and agreed. The
// artist picks the price, the copies, the per-wallet limit and the closing
// date; the app records those terms so a Collect button can be rebuilt from
// them later without asking anybody's indexer.
//
// The same panel sits inside the world builder as a step, and on its own at
// /drops/:worldSlug for a world that was not built in the builder (World #001).

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, ExternalLink, Gem, Image as ImageIcon, KeyRound, Loader2, Music, RefreshCw, Store, Trash2, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConsentNotice } from '@/components/ConsentNotice';
import { AdultOnly, useAdultGate } from '@/components/AdultOnly';
import { useAuth } from '@/context/AuthContext';
import { SONGS } from '@/data/musicData';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { useMyMedia } from '@/hooks/useArtistMedia';
import { useDropActions, useMyDrops, type DropKind, type WorldNft } from '@/hooks/useWorldNfts';
import { requestWalletConnection } from '@/lib/walletGate';
import { getConnectedAccounts } from '@/lib/baseWallet';
import { basescanTokenUrl, createDropOnChain, normalisePrice, tokenMetadataUrl, zoraCollectUrl } from '@/lib/nft';
import type { Address } from 'viem';

const input =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-ring';

const KINDS: Array<{ id: DropKind; label: string; blurb: string }> = [
  { id: 'song', label: 'A song', blurb: 'One of your records. The audio travels with the token.' },
  { id: 'artwork', label: 'Artwork', blurb: 'Cover art, a photo, a piece. The image is the token.' },
  { id: 'content', label: 'Other content', blurb: 'A video, a lyric sheet, anything you can link to.' },
];

const EMPTY = {
  kind: 'song' as DropKind,
  title: '',
  description: '',
  song_id: '' as string,
  image_url: '',
  media_url: '',
  price: '0',
  copies: '',
  per_wallet: '',
  sale_end: '',
  in_marketplace: true,
  key_ring: '' as '' | 'fan' | 'insider',
};

export function DropsPanel({
  worldSlug,
  worldId,
  worldName,
  artistId,
}: {
  worldSlug: string;
  worldId: string | null;
  worldName: string;
  artistId: string | null;
}) {
  const { user, isArtist } = useAuth();
  const { allowed: adultAllowed } = useAdultGate();
  const { data: mine = [], isLoading } = useMyDrops(worldSlug);
  const { create, update, remove, verify } = useDropActions();
  const { songs: published } = usePublishedCatalog();
  const { data: media = [] } = useMyMedia();

  const [form, setForm] = useState(EMPTY);
  const [wallet, setWallet] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getConnectedAccounts().then((a) => {
      if (live && a[0]) setWallet(a[0]);
    });
    return () => {
      live = false;
    };
  }, []);

  // Only this artist's songs can become their drop.
  const mySongs = useMemo(() => {
    const fromCatalog = artistId ? SONGS.filter((s) => s.artistId === artistId) : [];
    const fromDb = published.filter((s) => artistId && s.artistId === artistId);
    const seen = new Set<string>();
    return [...fromCatalog, ...fromDb].filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  }, [artistId, published]);
  const myImages = useMemo(() => media.filter((m) => m.kind === 'image'), [media]);

  const pickSong = (id: string) => {
    const s = mySongs.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      song_id: id,
      title: f.title || s?.title || '',
      image_url: s?.coverImage || f.image_url,
      media_url: s?.audioUrl || f.media_url,
    }));
  };

  const priceOk = normalisePrice(form.price) !== null;
  const copiesOk = form.copies === '' || (/^\d+$/.test(form.copies) && Number(form.copies) > 0);
  const perWalletOk = form.per_wallet === '' || (/^\d+$/.test(form.per_wallet) && Number(form.per_wallet) > 0);
  const canSave =
    form.title.trim().length > 0 && /^https?:\/\//.test(form.image_url.trim()) && priceOk && copiesOk && perWalletOk
    && (form.kind !== 'song' || !!form.song_id);

  const draftPayload = () => ({
    world_slug: worldSlug,
    world_id: worldId,
    artist_id: artistId,
    kind: form.kind,
    title: form.title.trim(),
    description: form.description.trim(),
    song_id: form.kind === 'song' ? form.song_id || null : null,
    image_url: form.image_url.trim(),
    media_url: form.media_url.trim() || null,
    media_kind: form.kind === 'song'
      ? ('audio' as const)
      : form.media_url.trim()
        ? (/\.(mp4|webm|mov)(\?|$)/i.test(form.media_url) ? ('video' as const) : ('other' as const))
        : null,
    price_eth: Number(normalisePrice(form.price) ?? '0'),
    copies: form.copies === '' ? null : Number(form.copies),
    per_wallet: form.per_wallet === '' ? null : Number(form.per_wallet),
    sale_end: form.sale_end ? new Date(form.sale_end).toISOString() : null,
    in_marketplace: form.in_marketplace,
    key_ring: form.key_ring === '' ? null : form.key_ring,
  });

  const saveDraft = async () => {
    if (!canSave) {
      toast.error('It needs a title, an image link, and numbers that make sense');
      return;
    }
    try {
      await create.mutateAsync(draftPayload());
      setForm(EMPTY);
      toast.success('Saved as a draft', { description: 'Nobody sees it but you until it is minted.' });
    } catch (e) {
      toast.error('Could not save that', { description: e instanceof Error ? e.message : undefined });
    }
  };

  /** The whole thing: row, wallet, chain, verify. Each step reports itself. */
  const mint = async (existing?: WorldNft) => {
    if (!existing && !canSave) {
      toast.error('It needs a title, an image link, and numbers that make sense');
      return;
    }
    let account = wallet;
    if (!account) {
      account = await requestWalletConnection();
      if (!account) return;
      setWallet(account);
    }
    let row = existing ?? null;
    try {
      setStage('Saving');
      if (!row) row = await create.mutateAsync(draftPayload());

      // The wallet on the row is the wallet that signs. Recorded before the
      // transaction, so a wallet swap half way cannot change who gets paid.
      row = await update.mutateAsync({ id: row.id, status: 'minting', payout_wallet: account, status_note: null });

      const reuse = mine.find(
        (d) => d.id !== row!.id && d.contract_address && (d.status === 'live' || d.status === 'paused'),
      )?.contract_address as Address | undefined;

      const result = await createDropOnChain({
        account: account as Address,
        payout: account as Address,
        worldSlug,
        collectionName: `${worldName} Drops`,
        dropId: row.id,
        terms: {
          priceEth: String(row.price_eth ?? 0),
          copies: row.copies,
          perWallet: row.per_wallet,
          saleEnd: row.sale_end ? new Date(row.sale_end) : null,
        },
        existingContract: reuse ?? null,
        onStage: setStage,
      });

      setStage('Recording');
      await update.mutateAsync({
        id: row.id,
        contract_address: result.contractAddress,
        token_id: Number(result.tokenId),
        tx_hash: result.txHash,
        minter_address: result.minter,
        contract_version: result.contractVersion,
        metadata_uri: tokenMetadataUrl(row.id),
      });

      setStage('Checking the chain');
      await verify.mutateAsync({ id: row.id, world_slug: worldSlug });
      if (!existing) setForm(EMPTY);
      toast.success(`${row.title} is live on Base`, { description: 'It is collectable in your world now.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The mint did not go through';
      const rejected = /reject|denied|closed/i.test(msg);
      if (row && !rejected) {
        await update.mutateAsync({ id: row.id, status: 'failed', status_note: msg }).catch(() => undefined);
      } else if (row && rejected) {
        await update.mutateAsync({ id: row.id, status: 'draft', status_note: null }).catch(() => undefined);
      }
      toast.error('Not minted', { description: rejected ? 'You closed the wallet prompt. The draft is kept.' : msg });
    } finally {
      setStage(null);
    }
  };

  if (!user) {
    return <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Sign in to make a drop.</p>;
  }
  if (!isArtist) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground">Drops are for artist accounts.</p>
        <p className="mt-2 text-sm text-muted-foreground">Put a record out and this opens up.</p>
      </div>
    );
  }
  if (!adultAllowed) return <AdultOnly reason="launch">{null}</AdultOnly>;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setForm((f) => ({ ...f, kind: k.id, song_id: k.id === 'song' ? f.song_id : '' }))}
              className={`rounded-xl border p-3 text-left transition-colors ${
                form.kind === k.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {form.kind === k.id && <Check className="h-3.5 w-3.5 text-primary" />}
                {k.label}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{k.blurb}</span>
            </button>
          ))}
        </div>

        {form.kind === 'song' ? (
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-sm text-foreground"><Music className="h-3.5 w-3.5" /> Which record</span>
            {mySongs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                None of your songs are on SONGCHAINN yet. Upload one in the Studio and it will show up here.
              </p>
            ) : (
              <select className={input} value={form.song_id} onChange={(e) => pickSong(e.target.value)}>
                <option value="">Pick a song</option>
                {mySongs.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            )}
          </label>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-foreground">Title</span>
            <input className={input} value={form.title} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="What it is called" />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-sm text-foreground"><ImageIcon className="h-3.5 w-3.5" /> Image link</span>
            <input className={input} value={form.image_url} onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} placeholder="https://..." spellCheck={false} />
          </label>
        </div>

        {myImages.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Or pick from your gallery</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {myImages.slice(0, 12).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, image_url: m.public_url, title: f.title || m.title || '' }))}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border ${form.image_url === m.public_url ? 'border-primary' : 'border-border'}`}
                  aria-label={m.title || 'Gallery image'}
                >
                  <img src={m.public_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {form.kind !== 'song' ? (
          <label className="block">
            <span className="mb-1 block text-sm text-foreground">Media link (optional)</span>
            <input className={input} value={form.media_url} onChange={(e) => setForm((f) => ({ ...f, media_url: e.target.value }))} placeholder="A video or file the token carries" spellCheck={false} />
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-sm text-foreground">What the holder gets</span>
          <textarea className={`${input} min-h-[80px] resize-none`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Say plainly what this is and what holding it means." />
        </label>

        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-sm text-foreground">Price (ETH)</span>
            <input className={`${input} font-mono`} inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="0.002" />
            {!priceOk && <span className="mt-1 block text-xs text-destructive">A number, up to 8 decimals.</span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-foreground">Copies</span>
            <input className={`${input} font-mono`} inputMode="numeric" value={form.copies} onChange={(e) => setForm((f) => ({ ...f, copies: e.target.value }))} placeholder="Open" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-foreground">Per wallet</span>
            <input className={`${input} font-mono`} inputMode="numeric" value={form.per_wallet} onChange={(e) => setForm((f) => ({ ...f, per_wallet: e.target.value }))} placeholder="No limit" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-foreground">Closes</span>
            <input type="date" className={input} value={form.sale_end} onChange={(e) => setForm((f) => ({ ...f, sale_end: e.target.value }))} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Leave copies empty for an open edition. The price is paid to your wallet by the contract, and the collector pays Zora's protocol fee on top. These terms are set on chain when you mint and do not change after.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3.5 ${form.in_marketplace ? 'border-primary bg-card' : 'border-border bg-card'}`}>
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.in_marketplace} onChange={(e) => setForm((f) => ({ ...f, in_marketplace: e.target.checked }))} />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-medium text-foreground"><Store className="h-3.5 w-3.5" /> Show in the marketplace</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">People outside your world can find and collect it too. Off means it lives in your world only.</span>
            </span>
          </label>
          <div className="rounded-lg border border-border bg-card p-3.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground"><KeyRound className="h-3.5 w-3.5" /> Use it as a key</span>
            <select className={`${input} mt-2`} value={form.key_ring} onChange={(e) => setForm((f) => ({ ...f, key_ring: e.target.value as typeof f.key_ring }))}>
              <option value="">Not a key</option>
              <option value="fan">Holders get fan access</option>
              <option value="insider">Holders get insider access</option>
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">Or lock one street with it in the Streets step.</span>
          </div>
        </div>

        <ConsentNotice which="drop_risk" />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void saveDraft()} disabled={create.isPending || stage != null}>
            Save draft
          </Button>
          <Button onClick={() => void mint()} disabled={!canSave || stage != null} className="gap-1.5">
            {stage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {stage ?? 'Mint on Base'}
          </Button>
          {wallet ? (
            <span className="font-mono text-xs text-muted-foreground">{wallet.slice(0, 6)}...{wallet.slice(-4)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Your wallet opens when you mint.</span>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">Your drops in {worldName}</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : mine.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing dropped yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {mine.map((d) => (
              <li key={d.id} className="flex gap-3 rounded-xl border border-border bg-card p-3">
                <img src={d.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{d.title}</span>
                    <StatusPill status={d.status} />
                    {d.key_ring ? <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">{d.key_ring} key</span> : null}
                    {d.in_marketplace && d.status === 'live' ? <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">In the marketplace</span> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {Number(d.price_eth) > 0 ? `${d.price_eth} ETH` : 'Free'} · {d.copies ? `${d.copies} copies` : 'Open edition'}
                    {d.status_note ? ` · ${d.status_note}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(d.status === 'draft' || d.status === 'failed') && (
                      <>
                        <Button size="sm" className="h-8 rounded-full text-xs" disabled={stage != null} onClick={() => void mint(d)}>
                          <Wallet className="mr-1 h-3.5 w-3.5" /> Mint on Base
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs" onClick={() => void remove.mutateAsync({ id: d.id, world_slug: worldSlug })}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                        </Button>
                      </>
                    )}
                    {d.status === 'minting' && (
                      <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" disabled={verify.isPending} onClick={() => void verify.mutateAsync({ id: d.id, world_slug: worldSlug }).then(() => toast.success('Live on Base')).catch((e: Error) => toast.error(e.message))}>
                        <RefreshCw className="mr-1 h-3.5 w-3.5" /> Check the chain again
                      </Button>
                    )}
                    {(d.status === 'live' || d.status === 'paused') && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => void update.mutateAsync({ id: d.id, status: d.status === 'live' ? 'paused' : 'live' }).catch((e: Error) => toast.error(e.message))}>
                          {d.status === 'live' ? 'Pause' : 'Resume'}
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => void update.mutateAsync({ id: d.id, in_marketplace: !d.in_marketplace })}>
                          <Store className="mr-1 h-3.5 w-3.5" /> {d.in_marketplace ? 'Take off the marketplace' : 'Put in the marketplace'}
                        </Button>
                        <select
                          aria-label="Key"
                          className="h-8 rounded-full border border-border bg-background px-2 text-xs text-foreground"
                          value={d.key_ring ?? ''}
                          onChange={(e) => void update.mutateAsync({ id: d.id, key_ring: (e.target.value || null) as WorldNft['key_ring'] })}
                        >
                          <option value="">Not a key</option>
                          <option value="fan">Fan key</option>
                          <option value="insider">Insider key</option>
                        </select>
                        {d.contract_address && d.token_id != null ? (
                          <>
                            <a href={basescanTokenUrl(d.contract_address, d.token_id)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-xs text-muted-foreground">
                              Basescan <ExternalLink className="h-3 w-3" />
                            </a>
                            <a href={zoraCollectUrl(d.contract_address, d.token_id)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-xs text-muted-foreground">
                              Zora <ExternalLink className="h-3 w-3" />
                            </a>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Drops show in your world's <Link to={`/w/${worldSlug}`} className="underline underline-offset-4">Collectibles</Link> and, if you chose it, in the <Link to="/marketplace" className="underline underline-offset-4">marketplace</Link>. Add a Collectibles block to any street to place them yourself.
        </p>
      </section>

      <p className="max-w-prose rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">What happens when you mint. </span>
        Your wallet deploys a collection of your own on Base through Zora (the first time) and adds this token to it. You pay a small amount of gas. Collectors pay your price to your wallet, plus Zora's fee. SONGCHAINN holds nothing and can change nothing about it afterwards, and neither can we take it down: it is yours.
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const style =
    status === 'live'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
      : status === 'failed'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : status === 'minting'
          ? 'border-primary/30 bg-primary/10 text-primary'
          : status === 'paused'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
            : 'border-border text-muted-foreground';
  const label =
    status === 'live' ? 'Live on Base' : status === 'minting' ? 'Checking' : status === 'failed' ? 'Did not go through' : status === 'paused' ? 'Paused' : 'Draft';
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{label}</span>;
}

export function DropsIcon() {
  return <Gem className="h-4 w-4" />;
}
