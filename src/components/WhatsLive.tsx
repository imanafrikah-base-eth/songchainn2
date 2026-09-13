import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useArtistOwnership } from '@/hooks/useArtistOwnership';
import { ArtMosaic, ArtistFaces, PictureCard } from '@/components/ArtMosaic';
import { useHasWorld } from '@/worlds/builder/useHasWorld';

/**
 * What is actually here, shown rather than listed.
 *
 * This used to be a column of icons and paragraphs. Now every thing that
 * works has a picture of itself: the records are the records, the rooms are
 * the rooms, the world is the world. Two versions still: a listener and an
 * artist want different doors.
 */

const W = '/world-assets';

export function WhatsLive() {
  const { isArtist, isLoading } = useArtistOwnership();
  // One world per artist: an artist who has theirs is sent into it, not told to build one.
  const { hasWorld, worldPath: myWorldPath } = useHasWorld();
  if (isLoading) return null;

  return (
    <section className="glass-card overflow-hidden rounded-2xl sm:rounded-3xl shine-overlay">
      <div className="p-5 pb-3 sm:p-6 sm:pb-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Live now</span>
        </div>
        <h3 className="font-heading text-lg font-bold text-foreground sm:text-xl">
          {isArtist ? 'Everything you can do here' : "What's on $ongChainn"}
        </h3>
      </div>

      <ArtMosaic count={16} seed={isArtist ? 11 : 5} size="sm" className="px-5 sm:px-6" />

      <div className="grid gap-3 p-5 pt-4 sm:grid-cols-2 sm:p-6 sm:pt-4">
        {isArtist ? (
          <>
            <PictureCard image={`${W}/room-studio.jpg`} title="Release today, free" line="Send a finished record. The judges listen, it is live the same minute." to="/studio" cta="Open the Studio" />
            {hasWorld && myWorldPath ? (
              <PictureCard image={`${W}/square-hero.jpg`} video={`${W}/square-hero.mp4`} title="Your world is standing" line="Walk in to see what visitors find, or ask Mo$ha to change anything on it." to={myWorldPath} cta="Walk into your world" />
            ) : (
              <PictureCard image={`${W}/square-hero.jpg`} video={`${W}/square-hero.mp4`} title="Build your own world" line="Streets, rooms, a key. Six screens, no code, or ask Mo$ha to build it." to="/world-builder" cta="Start building" />
            )}
            <PictureCard image={`${W}/room-request.jpg`} title="Paid to your own wallet" line="Coin a record and the earnings land with you. We never hold the money." to="/studio" cta="See the activity board" />
            <PictureCard image={`${W}/room-council.jpg`} title="See who really listens" line="Points come from real listening, so you see the fans who show up." to="/leaderboard" cta="The leaderboard" />
          </>
        ) : (
          <>
            <PictureCard image={`${W}/room-gallery.jpg`} title="Every record, streaming free" line="Mastered before it was published. Plays offline too." to="/discover" cta="Start listening" />
            <PictureCard image={`${W}/room-streets.jpg`} video={`${W}/room-streets.mp4`} title="Walk into a world" line="An artist's streets, rooms and stage. Hold the key and doors open." to="/worlds" cta="Artist Worlds" />
            <PictureCard image={`${W}/room-stage.jpg`} title="Rooms and battles" line="Listen with everyone at once, or watch two artists go head to head." to="/room" cta="The Room" />
            <PictureCard image={`${W}/room-wall.jpg`} title="Own the songs you love" line="Some records are coins on Base. Back one early and hold a piece." to="/marketplace" cta="The marketplace" />
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <ArtistFaces count={6} size="sm" />
          <p className="text-xs text-muted-foreground">The artists are here. Every one of them keeps everything.</p>
        </div>
        <Link to={isArtist ? '/studio' : '/artists'} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
          {isArtist ? 'Studio' : 'Meet them'} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}

export default WhatsLive;
