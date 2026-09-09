import { Link } from 'react-router-dom';
import { ArrowRight, Glasses, Hammer, KeyRound, MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DoorwayCtaGuest, DoorwayCtaMember } from './WorldDoorway';
import { WorldsSlideshow } from './WorldsSlideshow';
import { useWorldsStanding, FOUNDING_PLACES } from '@/hooks/useWorldsStanding';
import { IMAN_AFRIKAH_WORLD } from '@/worlds/registry';

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
const WHAT_IS_REAL = [
  {
    icon: Glasses,
    title: 'Step inside in VR',
    line: 'Put on a VR headset and you are standing in the city itself. No headset? On a computer you can still look around it in 3D on screen.',
  },
  {
    icon: MessageSquare,
    title: 'Get a private word',
    line: 'Book fifteen minutes with the artist in the Parlour. You pay them straight from your own wallet, and we never hold the money.',
  },
  {
    icon: KeyRound,
    title: 'Hold the key, doors open',
    line: "The artist's coin is the key. Hold it and rooms unlock, sell it and they close. No subscription anywhere.",
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
        Streets you walk, rooms that open on a key, a stage built for live moments. World
        #001 is {IMAN_AFRIKAH_WORLD.artistName}, and every world an artist opens takes its
        turn below. Push the doors and see.
      </p>

      {/* 1. THE DOORS. Every open world, sliding on its own. */}
      <div className="mt-5">
        <WorldsSlideshow />
        <div className="mt-3">
          {isGuest ? (
            <DoorwayCtaGuest
              onSignUp={() => onSignUp?.()}
              onSignIn={() => onSignIn?.()}
            />
          ) : (
            <DoorwayCtaMember />
          )}
        </div>
      </div>

      {/* 2. WHAT IS REAL */}
      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {WHAT_IS_REAL.map(({ icon: Icon, title, line }) => (
          <li
            key={title}
            className="rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/30"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12">
              <Icon className="h-4 w-4 text-primary" />
            </span>
            <p className="mt-2.5 text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{line}</p>
          </li>
        ))}
      </ul>

      {/* 3. THE OFFER */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-primary/30 bg-card/60">
        <div className="grid gap-4 p-5 sm:grid-cols-[1.2fr_auto] sm:items-center sm:p-6">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <Hammer className="h-3 w-3" />
              The founding {FOUNDING_PLACES}
            </p>
            <h3 className="mt-2.5 font-heading text-xl font-bold leading-tight text-foreground sm:text-2xl">
              Build your own world, free.
            </h3>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              The first {FOUNDING_PLACES} artists on $ongChainn each get a full world of their
              own, VR and all, at no cost. Name it, lay out the streets, fill the rooms, decide
              who gets in. Six screens, one afternoon, no code.
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
                  <Link to="/world-builder">
                    Start building
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
