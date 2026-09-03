import { useEffect, useState } from 'react';
import { X, Play, ChevronLeft, ChevronRight, Coins, ImageIcon } from 'lucide-react';
import { useArtistGallery, type ArtistMediaItem } from '@/hooks/useArtistMedia';

/**
 * An artist's visual work, shown the way they made it.
 *
 * A masonry column layout rather than a grid of squares, because cropping
 * somebody's photograph into a thumbnail to make the rows line up is the app
 * deciding how their work looks. Portrait stays portrait.
 *
 * The coin pill only appears when a coin address genuinely exists. A piece the
 * artist has not coined says nothing about coins at all.
 */

interface Props {
  artistId: string | null | undefined;
  /** Shown when the artist has published nothing yet. */
  emptyMessage?: string;
}

export function ArtistGallery({ artistId, emptyMessage }: Props) {
  const { data: items = [], isLoading } = useArtistGallery(artistId);
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
        <ImageIcon className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {emptyMessage ?? 'No artwork or video here yet.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="columns-2 gap-3 sm:columns-3 [&>*]:mb-3">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenAt(i)}
            className="group relative block w-full break-inside-avoid overflow-hidden rounded-xl border border-border bg-muted text-left"
            style={aspect(item)}
          >
            {item.kind === 'video' ? (
              <>
                {item.poster_url ? (
                  <img src={item.poster_url} alt={item.title ?? ''} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <video src={item.public_url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                )}
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                    <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
                  </span>
                </span>
              </>
            ) : (
              <img
                src={item.public_url}
                alt={item.title ?? ''}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                loading="lazy"
              />
            )}

            {item.coin_status === 'minted' && item.zora_coin_address && (
              <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                <Coins className="h-3 w-3" /> Coined
              </span>
            )}
            {item.title && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-2 pt-6 text-xs font-medium text-white">
                <span className="line-clamp-1">{item.title}</span>
              </span>
            )}
          </button>
        ))}
      </div>

      {openAt !== null && items[openAt] && (
        <Lightbox
          items={items}
          index={openAt}
          onIndex={setOpenAt}
          onClose={() => setOpenAt(null)}
        />
      )}
    </>
  );
}

/* Reserve the right shape before the file loads, so the column does not jump
   as each piece arrives. Falls back to a portrait-ish box when we never
   measured it. */
function aspect(item: ArtistMediaItem): React.CSSProperties {
  if (item.width && item.height) return { aspectRatio: `${item.width} / ${item.height}` };
  return { aspectRatio: '4 / 5' };
}

function Lightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: ArtistMediaItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = items[index];

  // Arrow keys and Escape, because this is a full screen viewer and a keyboard
  // is how anybody on a laptop will try to move through it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-white/60">
          {index + 1} of {items.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        {item.kind === 'video' ? (
          <video
            key={item.id}
            src={item.public_url}
            poster={item.poster_url ?? undefined}
            className="max-h-full max-w-full"
            controls
            autoPlay
            playsInline
          />
        ) : (
          <img key={item.id} src={item.public_url} alt={item.title ?? ''} className="max-h-full max-w-full object-contain" />
        )}
      </div>

      <div className="px-4 pb-6 pt-3">
        {(item.title || item.caption) && (
          <div className="mx-auto max-w-xl text-center">
            {item.title && <p className="text-sm font-semibold text-white">{item.title}</p>}
            {item.caption && <p className="mt-1 text-xs text-white/70">{item.caption}</p>}
          </div>
        )}
        {item.zora_coin_address && item.coin_status === 'minted' && (
          <p className="mt-3 text-center">
            <a
              href={`https://basescan.org/address/${item.zora_coin_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-[11px] text-white/80"
            >
              <Coins className="h-3 w-3" /> Coined on Base
            </a>
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onIndex(index - 1)}
            aria-label="Previous"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            disabled={index === items.length - 1}
            onClick={() => onIndex(index + 1)}
            aria-label="Next"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
