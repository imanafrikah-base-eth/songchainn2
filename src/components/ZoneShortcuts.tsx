import { Link } from 'react-router-dom';
import { ArrowRight, Bot, Crown, Headphones, ListMusic, Radio, Shuffle, Store, Waves } from 'lucide-react';
import { AmbientBackground } from '@/components/AmbientBackground';
import { CARD_TILES, type BgImage } from '@/data/backgroundPools';
import { cn } from '@/lib/utils';

interface ZoneTileProps {
  to: string;
  title: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
  photo: BgImage;
  accent: string;
  ring: string;
  className?: string;
}

function ZoneTile({ to, title, tagline, icon: Icon, photo, accent, ring, className }: ZoneTileProps) {
  return (
    <Link
      to={to}
      className={cn(
        'group relative isolate overflow-hidden rounded-2xl border border-border/40 p-3.5 sm:p-4',
        'flex flex-col justify-end press-effect transition-shadow duration-500',
        'hover:shadow-lg focus-visible:outline-none focus-visible:ring-2',
        ring,
        className
      )}
    >
      <div aria-hidden className="absolute inset-0 -z-10 pointer-events-none">
        <div
          className="absolute inset-0 opacity-55 transition-all duration-700 ease-out group-hover:opacity-80 group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          style={{
            backgroundImage: `url(${photo.src})`,
            backgroundSize: photo.size ?? 'cover',
            backgroundPosition: photo.position ?? 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/50 to-background/20" />
      </div>

      <div className={cn('inline-flex w-fit rounded-lg p-1.5 mb-2 bg-background/60 backdrop-blur-sm', accent)}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{tagline}</p>
      <ArrowRight
        className={cn(
          'absolute top-3 right-3 w-4 h-4 opacity-0 -translate-x-1 transition-all duration-300',
          'group-hover:opacity-100 group-hover:translate-x-0 motion-reduce:transition-none',
          accent
        )}
      />
    </Link>
  );
}

/**
 * "Step Into The World": cinematic bento navigator for every zone of the
 * app. WaveWarz Africa is the arena centerpiece with a rotating battle
 * backdrop; every other zone breathes behind its own photograph.
 */
export function ZoneShortcuts() {
  return (
    <section className="mb-6 sm:mb-10">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl text-foreground">Step Into The World</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Pick a zone. Feel the vibe.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 auto-rows-[6.5rem] sm:auto-rows-[7.5rem] gap-2.5 sm:gap-3 [grid-auto-flow:dense]">
        {/* Arena centerpiece: WaveWarz Africa Battle Zone */}
        <Link
          to="/wavewarz-africa"
          className="group relative isolate overflow-hidden rounded-2xl border border-orange-400/30 col-span-2 row-span-2 p-4 sm:p-5 flex flex-col justify-end press-effect focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60"
        >
          <AmbientBackground pool="waveWarz" opacity={0.55} overlay="hero" zoom className="-z-10" />
          <span className="absolute top-3.5 left-3.5 sm:top-4 sm:left-4 inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
            <span className="relative flex h-1.5 w-1.5">
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
            </span>
            Battle Zone
          </span>
          <div className="inline-flex w-fit rounded-lg p-1.5 mb-2 bg-background/60 backdrop-blur-sm text-orange-400">
            <Waves className="w-5 h-5" />
          </div>
          <p className="font-heading text-lg sm:text-2xl font-bold text-foreground leading-tight">WaveWarz Africa</p>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-sm">
            Two artists. One battle. Back your favorite live and watch the crowd decide.
          </p>
          <span className="mt-2.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-orange-300 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none">
            Enter the arena
            <ArrowRight className="w-4 h-4" />
          </span>
        </Link>

        {/* Tall booth: DJ $huffle */}
        <ZoneTile
          to="/dj-shuffle"
          title="DJ $huffle"
          tagline="Let the decks decide what plays next."
          icon={Shuffle}
          photo={CARD_TILES.djShuffle}
          accent="text-emerald-400"
          ring="focus-visible:ring-emerald-400/60"
          className="row-span-2"
        />

        <ZoneTile
          to="/room"
          title="The Room"
          tagline="Live listening with everyone at once."
          icon={Radio}
          photo={CARD_TILES.theRoom}
          accent="text-primary"
          ring="focus-visible:ring-primary/60"
        />

        <ZoneTile
          to="/marketplace"
          title="Marketplace"
          tagline="Own the songs you love, onchain."
          icon={Store}
          photo={CARD_TILES.marketplace}
          accent="text-cyan-400"
          ring="focus-visible:ring-cyan-400/60"
        />

        <ZoneTile
          to="/leaderboard"
          title="Leaderboard"
          tagline="Climb the ranks, earn your crown."
          icon={Crown}
          photo={CARD_TILES.leaderboard}
          accent="text-amber-400"
          ring="focus-visible:ring-amber-400/60"
        />

        <ZoneTile
          to="/social"
          title="The Feed"
          tagline="See what the community is playing."
          icon={Headphones}
          photo={CARD_TILES.feed}
          accent="text-pink-400"
          ring="focus-visible:ring-pink-400/60"
        />

        <ZoneTile
          to="/playlists"
          title="Playlists"
          tagline="Your mixes, your mood, your flow."
          icon={ListMusic}
          photo={CARD_TILES.playlists}
          accent="text-blue-400"
          ring="focus-visible:ring-blue-400/60"
        />

        <ZoneTile
          to="/inbox"
          title="Mo$ha"
          tagline="Your vibe guide. Ask anything."
          icon={Bot}
          photo={CARD_TILES.moSha}
          accent="text-purple-400"
          ring="focus-visible:ring-purple-400/60"
        />
      </div>
    </section>
  );
}
