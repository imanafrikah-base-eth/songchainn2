// The Gate (Ring 0, spec §06): the story, three featured tracks, and the way
// in. Public to everyone, no wallet needed.

import { Link } from 'react-router-dom';
import { ArrowRight, CameraOff } from 'lucide-react';
import { ARTISTS, SONGS } from '@/data/musicData';
import { getArtistSlugUrl } from '@/lib/slugRoutes';
import { useRankedSongs } from '@/hooks/usePopularity';
import type { WorldConfig, WorldRings } from '../../types';
import { GetKeyCta } from '../GetKeyCta';
import { WorldTrackRow } from '../WorldTrackRow';

export function GateRoom({ world, rings }: { world: WorldConfig; rings: WorldRings }) {
  const artist = ARTISTS.find((a) => a.id === world.artistId);
  const { rankedSongs } = useRankedSongs();

  const featured =
    world.featuredSongIds.length > 0
      ? world.featuredSongIds
          .map((id) => SONGS.find((s) => s.id === id))
          .filter((s): s is NonNullable<typeof s> => Boolean(s))
          .slice(0, 3)
      : rankedSongs.filter((s) => s.artistId === world.artistId).slice(0, 3);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        {world.story.map((paragraph) => (
          <p key={paragraph.slice(0, 32)} className="text-sm leading-relaxed text-white/70 sm:text-base">
            {paragraph}
          </p>
        ))}
        <p className="font-heading text-lg font-bold text-amber-300">{world.positioning}</p>

        {/* The owner's wish, said once, on the way in. Worded as the ask it
            actually is: we cannot stop a screenshot in a browser and will not
            imply we can. Marked data-protect so that if the Android app ever
            gains FLAG_SECURE there is one hook to honour, not two. */}
        {world.noScreenshots && (
          <p
            data-protect=""
            className="flex items-start gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70"
          >
            <CameraOff className="mt-0.5 h-4 w-4 shrink-0 text-white/50" aria-hidden="true" />
            <span>{world.artistName} asks you not to screenshot this world. Please keep it between us.</span>
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-3 font-heading text-lg font-bold text-white">Three tracks from inside</h3>
        <div className="space-y-2">
          {featured.map((song) => (
            <WorldTrackRow key={song.id} song={song} />
          ))}
        </div>
      </section>

      <GetKeyCta world={world} rings={rings} />

      <section className="flex flex-wrap gap-3">
        <Link
          to={`/world/${world.slug}/streets`}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-5 py-2 text-sm text-white/80 transition hover:bg-white/10"
        >
          Walk the Streets <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {artist && (
          <Link
            to={getArtistSlugUrl(artist)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-5 py-2 text-sm text-white/80 transition hover:bg-white/10"
          >
            {world.artistName} on songchainn <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </section>
    </div>
  );
}
