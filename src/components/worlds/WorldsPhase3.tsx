import { Link } from 'react-router-dom';
import { ArrowRight, Glasses, Hammer, KeyRound, MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DoorwayCtaGuest, DoorwayCtaMember } from './WorldDoorway';
import { WorldsSlideshow } from './WorldsSlideshow';
import { useWorldsStanding, FOUNDING_PLACES } from '@/hooks/useWorldsStanding';
import { IMAN_AFRIKAH_WORLD } from '@/worlds/registry';
import { useHasWorld } from '@/worlds/builder/useHasWorld';

/**
 * Phase Three, advertised.
 *
 * One section that has to do four jobs at once without turning into a pitch
 * deck: show a stranger what a world is, tell an artist they can have one,
 * tell a listener what it feels like inside, and get somebody to press
 * something. The order below is the argument:
 *
 *   1. THE DOOR      Nobody reads a headline about a world. They open a door
 *                    and look. So the door is first and the words come after.
 *   2. WHAT IS REAL  Three lines, each naming a thing that actually works
 *                    today: a headset, a private word with the artist, and a
 *                    key that opens rooms. Nothing here is a roadmap item.
 *   3. THE OFFER     The founding fifty, with a counted number rather than an
 *                    invented one.
 *
 * TWO AUDIENCES, ONE SECTION. A listener and an artist want opposite things
 * from this, and splitting them into two sections would mean one of them
 * scrolls past a wall addressed to somebody else. So the door serves both, and
 * only the last card changes: the visitor is told what it is like inside, the
 * artist is told they can build one.
 */

/** Every line below names something that exists. Nothing is a promise. */
const W = '/world-assets';
const WHAT_IS_REAL = [
  {
    icon: Glasses,
    title: 'Step inside in VR',
    line: 'A headset puts you in the city. A computer lets you look around it in 3D.',
    image: `${W}/city-music.jpg`,
    video: `${W}/city-music.mp4`,
  },
  {
    icon: MessageSquare,
    title: 'Get a private word',
    line: 'Fifteen minutes with the artist in the Parlour, paid wallet to wallet.',
    image: `${W}/room-parlour.jpg`,
    video: `${W}/room-parlour.mp4`,
  },
  {
    icon: KeyRound,
    title: 'Hold the key, doors open',
    line: "The artist's coin is the key. Hold it and rooms unlock.",
    image: `${W}/entrance-doors.jpg`,
    video: `${W}/entrance.mp4`,
  },
];

export function WorldsPhase3({
  variant,
  onSignUp,
  onSignIn,
  className = '',
}: {
  /** 'guest' is the landing page, 'member' is inside the app. */
  variant: 'guest' | 'member';
  onSignUp?: () => void;
  onSignIn?: () => void;
  className?: string;
}) {
  const { data: standing } = useWorldsStanding();
  const placesLeft = standing?.placesLeft;
  const isGuest = variant === 'guest';
  // One world per artist. A member who already has one is sent into it, not offered another.
  const { hasWorld, worldPath: myWorldPath } = useHasWorld();
  const ownsWorld = !isGuest && hasWorld && Boolean(myWorldPath);

  return (
    <section className={`relative ${className}`}>
      {/* The banner. Says which phase this is, because the whole app has been
          telling people to wait for it. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
          <Sparkles className="h-3 w-3" />
          $ongChainn Phase 3
        </span>
        <span className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Now in beta
        </span>
      </div>

      <h2 className="mt-3 font-heading text-2xl font-bold leading-tight text-foreground sm:text-3xl">
        Artists do not get a page here. They get a world.
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
        World #001 is {IMAN_AFRIKAH_WORLD.artistName}. Push the doors.
      </p>

      {/* 1. THE DOOR. World #001's brass doors, exactly as they always opened
          here; every world an artist opens takes its turn in the same slot
          with whatever its artist chose to show. */}
      <div className="mt-5">
        <WorldsSlideshow
          cta={
            isGuest ? (
              <DoorwayCtaGuest
                onSignUp={() => onSignUp?.()}
                onSignIn={() => onSignIn?.()}
              />
            ) : (
              <DoorwayCtaMember />
            )
          }
        />
      </div>

      {/* 2. WHAT IS REAL, shown: the rooms themselves behind the words. */}
      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {WHAT_IS_REAL.map(({ icon: Icon, title, line, image, video }) => (
          <li key={title} className="group relative min-h-[10rem] overflow-hidden rounded-xl border border-border bg-black">
            <img src={image} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            <video src={video} poster={image} muted loop playsInline autoPlay preload="none" className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <div className="relative flex h-full flex-col justify-end p-4">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
                <Icon className="h-3.5 w-3.5 text-white" />
              </span>
              <p className="mt-2 text-sm font-semibold text-white drop-shadow">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-white/80 drop-shadow">{line}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* 3. THE OFFER */}
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-primary/30 bg-card/60">
        <img src={`${W}/square-hero.jpg`} alt="" loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/40" />
        <div className="relative grid gap-4 p-5 sm:grid-cols-[1.2fr_auto] sm:items-center sm:p-6">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <Hammer className="h-3 w-3" />
              The founding {FOUNDING_PLACES}
            </p>
            <h3 className="mt-2.5 font-heading text-xl font-bold leading-tight text-foreground sm:text-2xl">
              {ownsWorld ? 'Your world is standing.' : 'Build your own world, free.'}
            </h3>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              The first {FOUNDING_PLACES} artists get a full world free. Ask Mo$ha and it builds it with you.
            </p>
            {typeof placesLeft === 'number' && (
              <p className="mt-2 text-xs font-medium text-foreground">
                {placesLeft > 0
                  ? `${placesLeft} of the ${FOUNDING_PLACES} places are still open.`
                  : 'All fifty founding places are taken.'}
                <span className="ml-1 font-normal text-muted-foreground">
                  A place is taken when a world is published, not when one is started.
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:min-w-[190px]">
            {isGuest ? (
              <>
                <Button
                  onClick={() => onSignUp?.()}
                  className="h-11 rounded-full px-6 text-sm font-semibold"
                >
                  Sign up as an artist
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Free to join. Your music stays yours.
                </p>
              </>
            ) : (
              <>
                <Button asChild className="h-11 rounded-full px-6 text-sm font-semibold">
                  <Link to={ownsWorld && myWorldPath ? myWorldPath : '/world-builder'}>
                    {ownsWorld ? 'Walk into your world' : 'Start building'}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-full px-6 text-sm font-semibold"
                >
                  <Link to={`/world/${IMAN_AFRIKAH_WORLD.slug}`}>Walk World #001</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default WorldsPhase3;
