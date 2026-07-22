// The Gallery (Ring 1, spec §06): the visual archive. Phase A seeds it with
// the cover art archive from the artist's catalog; photos, lyric sheets and
// collectible image drops land here as the artist posts them.

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { SONGS } from '@/data/musicData';
import type { WorldConfig } from '../../types';

type ArtItem = { key: string; image: string; title: string };

export function GalleryRoom({ world }: { world: WorldConfig }) {
  const [openItem, setOpenItem] = useState<ArtItem | null>(null);

  const covers = useMemo<ArtItem[]>(() => {
    const seen = new Set<string>();
    const items: ArtItem[] = [];
    for (const song of SONGS) {
      if (song.artistId !== world.artistId || !song.coverImage) continue;
      if (seen.has(song.coverImage)) continue;
      seen.add(song.coverImage);
      items.push({ key: song.id, image: song.coverImage, title: song.title });
    }
    return items;
  }, [world.artistId]);

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-white/60">
        The cover art archive, straight from the onchain catalog. Photos, lyric sheets and collectible
        image drops post here as {world.artistName} adds them.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {covers.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setOpenItem(item)}
            className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/5"
          >
            <img
              src={item.image}
              alt={item.title}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] font-medium text-white/90">
              {item.title}
            </span>
          </button>
        ))}
      </div>

      {openItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpenItem(null)}
          role="dialog"
          aria-label={openItem.title}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            onClick={() => setOpenItem(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <figure className="max-h-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={openItem.image} alt={openItem.title} className="max-h-[80vh] w-full rounded-2xl object-contain" />
            <figcaption className="mt-3 text-center text-sm text-white/70">{openItem.title}</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
