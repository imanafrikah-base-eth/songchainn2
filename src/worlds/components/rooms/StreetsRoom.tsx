// The Streets (Ring 0, spec §06): the public feed of the onchain catalog with
// the hot chart. Everything here is already public on songchainn; the world
// frames it as the ground floor of the artist's world.

import { useMemo, useState } from 'react';
import { Flame, ListMusic, Play } from 'lucide-react';
import { SONGS } from '@/data/musicData';
import { usePlayerActions } from '@/context/PlayerContext';
import { useRankedSongs } from '@/hooks/usePopularity';
import type { WorldConfig } from '../../types';
import { WorldTrackRow } from '../WorldTrackRow';

const CATALOG_PAGE = 20;

export function StreetsRoom({ world }: { world: WorldConfig }) {
  const { playQueue } = usePlayerActions();
  const { rankedSongs } = useRankedSongs();
  const [visible, setVisible] = useState(CATALOG_PAGE);

  const artistSongs = useMemo(() => SONGS.filter((s) => s.artistId === world.artistId), [world.artistId]);
  const hot = useMemo(
    () => rankedSongs.filter((s) => s.artistId === world.artistId).slice(0, 10),
    [rankedSongs, world.artistId],
  );
  const latest = useMemo(
    () =>
      [...artistSongs]
        .sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''))
        .slice(0, 6),
    [artistSongs],
  );

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-white">
            <Flame className="h-5 w-5 text-emerald-300" /> The hot chart
          </h3>
          {hot.length > 0 && (
            <button
              type="button"
              onClick={() => playQueue(hot)}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-4 py-1.5 text-xs font-bold text-black transition hover:bg-emerald-300"
            >
              <Play className="h-3.5 w-3.5" /> Play the chart
            </button>
          )}
        </div>
        <div className="space-y-2">
          {hot.map((song, i) => (
            <WorldTrackRow key={song.id} song={song} index={i} accentText="text-emerald-300" />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-heading text-lg font-bold text-white">Latest drops</h3>
        <div className="space-y-2">
          {latest.map((song) => (
            <WorldTrackRow key={song.id} song={song} accentText="text-emerald-300" />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-white">
            <ListMusic className="h-5 w-5 text-emerald-300" /> The onchain catalog
          </h3>
          <span className="text-xs text-white/50">{artistSongs.length} tracks</span>
        </div>
        <div className="space-y-2">
          {artistSongs.slice(0, visible).map((song) => (
            <WorldTrackRow key={song.id} song={song} accentText="text-emerald-300" />
          ))}
        </div>
        {visible < artistSongs.length && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + CATALOG_PAGE)}
            className="mt-4 w-full rounded-xl border border-white/10 py-2.5 text-sm text-white/70 transition hover:bg-white/5"
          >
            Show more of the catalog
          </button>
        )}
      </section>
    </div>
  );
}
