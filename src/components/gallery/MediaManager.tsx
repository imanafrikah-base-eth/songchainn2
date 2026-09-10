import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Eye, EyeOff, Coins, Play, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AdultOnly } from '@/components/AdultOnly';
import {
  useMyMedia,
  useMediaUpload,
  useMediaActions,
  type ArtistMediaItem,
} from '@/hooks/useArtistMedia';

/**
 * Where an artist puts their visual work up and decides what happens to it.
 *
 * The same two paths the music takes. Uploading needs an account and nothing
 * else. Coining a piece on Zora is separate, optional, and needs a wallet,
 * because a coin has to pay somebody and that somebody needs an address.
 *
 * Nothing here says a piece is on chain until an address exists for it, and
 * "Coin this" is deliberately a request rather than a claim: it records the
 * intent and says plainly that it is not minted yet.
 */

const MAX_IMAGE_MB = 20;
const MAX_VIDEO_MB = 200;

/** The sections the page shows, in the same order. Nothing sits loose. */
const SECTIONS: Array<{ key: 'video' | 'image'; label: string }> = [
  { key: 'video', label: 'Clips' },
  { key: 'image', label: 'Pictures' },
];

interface Props {
  /** Their wallet, if they have connected one. Coining is offered only then. */
  walletAddress?: string | null;
}

export function MediaManager({ walletAddress }: Props) {
  const { data: items = [], isLoading } = useMyMedia();
  const upload = useMediaUpload();
  const { update, remove } = useMediaActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', caption: '' });

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const capMb = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
    if (file.size > capMb * 1024 * 1024) {
      toast.error(`That file is too big`, {
        description: `${isVideo ? 'Video' : 'Images'} must be under ${capMb} MB.`,
      });
      return;
    }
    const item = await upload.upload(file, {});
    if (item) toast.success('Up. It is on your page now.');
    if (fileRef.current) fileRef.current.value = '';
  };

  const startEdit = (item: ArtistMediaItem) => {
    setEditing(item.id);
    setDraft({ title: item.title ?? '', caption: item.caption ?? '' });
  };

  const saveEdit = async (id: string) => {
    try {
      await update.mutateAsync({ id, title: draft.title.trim() || null, caption: draft.caption.trim() || null });
      setEditing(null);
      toast.success('Saved');
    } catch (e) {
      toast.error('Could not save that', { description: e instanceof Error ? e.message : undefined });
    }
  };

  const busy = upload.phase === 'preparing' || upload.phase === 'uploading';

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-lg font-semibold text-foreground">Your visual work</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Artwork, photographs, video. It goes on your page the moment it lands, and no wallet is
          needed to put it up. A wallet is only needed to coin a piece.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />

      {/* "Uploading photographs or video" is one of the four things the Terms
          close to under-18s. Music is not one of them and stays open: an
          under-18 artist can still release records, which is the whole point. */}
      <AdultOnly reason="media">
        <Button onClick={() => fileRef.current?.click()} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {upload.phase === 'uploading' ? `Uploading ${upload.progress}%` : 'Add a picture or a clip'}
        </Button>
      </AdultOnly>

      {upload.phase === 'error' && upload.error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {upload.error}
        </p>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing up yet. What you add here is what people see on your page.
        </p>
      ) : (
        <div className="space-y-6">
          {SECTIONS.filter((sec) => items.some((i) => i.kind === sec.key)).map((sec) => (
            <section key={sec.key} aria-label={sec.label}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {sec.label} <span className="font-normal text-muted-foreground/70">{items.filter((i) => i.kind === sec.key).length}</span>
              </h4>
        <ul className="space-y-2">
          {items.filter((i) => i.kind === sec.key).map((item) => (
            <li key={item.id} className="flex gap-3 rounded-xl border border-border bg-card p-3">
              <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                {item.kind === 'video' ? (
                  <>
                    <video src={item.public_url} className="h-full w-full object-cover" muted preload="metadata" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Play className="h-5 w-5 fill-white text-white drop-shadow" />
                    </span>
                  </>
                ) : (
                  <img src={item.public_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                {editing === item.id ? (
                  <div className="space-y-2">
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="Title"
                      className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <input
                      value={draft.caption}
                      onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
                      placeholder="Say something about it"
                      className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-10 gap-1" onClick={() => void saveEdit(item.id)}>
                        <Check className="h-3.5 w-3.5" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-10 gap-1" onClick={() => setEditing(null)}>
                        <X className="h-3.5 w-3.5" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="block text-left text-sm font-semibold text-foreground hover:underline"
                    >
                      {item.title || 'Untitled'}
                    </button>
                    {item.caption && <p className="line-clamp-2 text-xs text-muted-foreground">{item.caption}</p>}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {item.kind}
                      </span>
                      {!item.is_published && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                          Hidden
                        </span>
                      )}
                      {item.coin_status === 'minted' && item.zora_coin_address ? (
                        <a
                          href={`https://basescan.org/address/${item.zora_coin_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500"
                        >
                          <Coins className="h-3 w-3" /> Coined
                        </a>
                      ) : item.coin_status === 'requested' ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                          Coin requested. Not live yet.
                        </span>
                      ) : null}
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-shrink-0 flex-col gap-1.5">
                <button
                  type="button"
                  title={item.is_published ? 'Hide from your page' : 'Show on your page'}
                  aria-label={item.is_published ? 'Hide from your page' : 'Show on your page'}
                  onClick={() => void update.mutateAsync({ id: item.id, is_published: !item.is_published })}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                >
                  {item.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>

                {item.coin_status === 'none' && (
                  <button
                    type="button"
                    title={walletAddress ? 'Coin this on Zora' : 'Connect a wallet to coin this'}
                    aria-label="Coin this piece"
                    disabled={!walletAddress}
                    onClick={() => {
                      void update.mutateAsync({ id: item.id, coin_status: 'requested' });
                      toast('Noted', {
                        description:
                          'It is queued to be coined. Nothing is on chain until the coin actually exists, and the page will say so when it does.',
                      });
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <Coins className="h-4 w-4" />
                  </button>
                )}

                <button
                  type="button"
                  title="Delete"
                  aria-label="Delete this piece"
                  onClick={() => {
                    if (!window.confirm('Delete this? It comes off your page for good.')) return;
                    void remove.mutateAsync(item.id);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
            </section>
          ))}
        </div>
      )}

      {!walletAddress && items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Connect a wallet if you want to coin any of this. Everything above stays up either way.
        </p>
      )}
    </div>
  );
}
