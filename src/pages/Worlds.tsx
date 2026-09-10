import { Link } from 'react-router-dom';
import { ArtistName } from '@/components/ArtistName';
import { ArrowLeft, ArrowRight, Globe2, Hammer } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { WorldArt } from '@/worlds/components/WorldArt';
import { formatWorldNumber } from '@/worlds/registry';
import { usePublishedWorlds, worldPath } from '@/hooks/usePublishedWorlds';
import { useAuth } from '@/context/AuthContext';
import { WORLD_BUILDER_ENABLED } from '@/lib/features';

/**
 * Artist Worlds: every world that is open, in the order they were numbered.
 * The page the slideshow on Home points at.
 */
const Worlds = () => {
  const { data: worlds = [], isLoading } = usePublishedWorlds();
  const { isArtist } = useAuth();

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navigation />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="mb-2 flex items-center gap-3">
          <Globe2 className="h-7 w-7 text-primary" />
          <h1 className="font-heading text-3xl font-bold text-foreground">Artist Worlds</h1>
        </div>
        <p className="mb-8 max-w-2xl text-sm text-muted-foreground">
          Every open world, in the order it was numbered. Walk in.
        </p>

        {isLoading && worlds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading the worlds.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {worlds.map((w) => (
              <li key={w.slug}>
                <Link
                  to={worldPath(w)}
                  className="group block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/50"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-black">
                    <WorldArt poster={w.heroImage} video={w.heroVideo} fit={w.artFit?.hero} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                    <p className="absolute left-4 top-4 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
                      {formatWorldNumber(w)}
                    </p>
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <h2 className="font-heading text-xl font-bold text-white"><ArtistName name={w.artistName} artistId={(w as { artistId?: string | null }).artistId} size={16} /></h2>
                      {w.positioning ? <p className="mt-0.5 text-xs text-white/75 line-clamp-2">{w.positioning}</p> : null}
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-muted-foreground">{w.cities?.length ? `${w.cities.length} cities` : 'Open now'}</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-primary">
                      Walk in <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {WORLD_BUILDER_ENABLED && (
          <div className="mt-10 flex flex-col gap-3 rounded-2xl border border-primary/30 bg-card/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                <Hammer className="h-3 w-3" /> Your own
              </p>
              <h2 className="mt-1 font-heading text-xl font-bold text-foreground">Build a world of your own</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isArtist
                  ? 'Name it, lay out the streets, dress it, set the key. Six screens, one afternoon.'
                  : 'Make music? Open your Studio and this same account becomes an artist account; the builder is right there.'}
              </p>
            </div>
            <Link
              to={isArtist ? '/world-builder' : '/studio'}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {isArtist ? 'Start building' : 'Open the Studio'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
      <AudioPlayer />
    </div>
  );
};

export default Worlds;
