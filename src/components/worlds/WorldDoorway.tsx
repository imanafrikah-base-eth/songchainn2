import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GetKeyModal } from '@/worlds/components/GetKeyModal';
import { getArtistCoin } from '@/lib/artistCoins';
import { Link } from 'react-router-dom';
import { ArrowRight, DoorOpen, Glasses, Volume2, VolumeX } from 'lucide-react';
import { IMAN_AFRIKAH_WORLD } from '@/worlds/registry';
import { Button } from '@/components/ui/button';
import { isNativeApp } from '@/lib/native';

/**
 * The doors, on a page that is not the world.
 *
 * Somebody who has never heard of a world will not click a link that says
 * "world". They will open a door. So this is the door: his own filmed brass
 * doors, the ones that stand at the front of World #001, brought out to where
 * strangers actually are.
 *
 * Three beats, and the order matters more than any of the styling:
 *
 *   CLOSED    A shut door and one thing to do. No feature list, no paragraph.
 *   OPENING   His entrance clip plays, the doors part, and that is the whole
 *             screen for two and a half seconds. Nothing is asked of anybody
 *             during it.
 *   INSIDE    Real rooms, moving, one after another with their real names.
 *             The ask arrives here and only here, once they have seen it.
 *
 * Asking before the doors open is the mistake this component exists to avoid.
 * A sign-up form in front of a thing nobody has seen yet is a toll gate; the
 * same form after ninety frames of somebody's world is an invitation.
 *
 * HOW THE PICTURE IS BUILT, and why it is built this way.
 *
 * The first version of this swapped whole <video> elements in and out through
 * an animation library's presence wrapper. On a real desktop it never played a
 * single frame: the wrapper waited for the closed card to finish leaving, the
 * closed card had an endlessly pulsing seam of light inside it, and the two
 * disagreed about whether "finished" would ever come. The state machine walked
 * all the way to the last room while the screen sat on the shut doors. A
 * slideshow of stills was the best case, and the founder saw exactly that.
 *
 * So there is no wrapper now. The picture is three layers that are always in
 * the tree: one <img> for the still of whatever beat we are on, and two <video>
 * players stacked over it that take turns. The next clip loads into whichever
 * player is underneath, and only once the browser reports that it is actually
 * playing does that player fade to the top. If a clip refuses (a browser that
 * blocks even muted video, a network that drops it, a device that cannot
 * decode it), the players fade out and the still underneath carries the walk
 * on its own. Nobody ever sees a black frame, and nobody ever sees nothing.
 *
 * Every clip is muted, inline and started by the visitor's own tap, which is
 * the one combination every phone and desktop browser lets play.
 *
 * ART OWNERSHIP: every path comes from the registry, never typed here. That
 * file is the only module allowed to name the world-assets folder, because
 * this art was commissioned for World #001 and no other world may point at it.
 */

/** The rooms worth showing a stranger, in the order they tell the best story. */
const TOUR: Array<{ slug: string; name: string; line: string }> = [
  { slug: 'streets', name: 'The Streets', line: 'Open to everyone who walks up.' },
  { slug: 'gallery', name: 'The Gallery', line: 'His work, hung. Opens for fans.' },
  { slug: 'studio', name: 'The Studio', line: 'Where the records get made.' },
  { slug: 'stage', name: 'The Stage', line: 'Built for live moments. The first is being scheduled.' },
  { slug: 'council', name: 'The Council', line: 'Ten seats. The most devoted hold them.' },
];

/** How long each room stays on screen. Long enough to read, short enough to keep. */
const ROOM_MS = 2600;

/** The last room lingers a little, then the doors close on it. */
const LAST_ROOM_MS = 3600;

/** The entrance clip is 2.4s. If it has not ended on its own by now, walk in anyway. */
const OPENING_MAX_MS = 3500;

type Phase = 'closed' | 'opening' | 'inside';
type Slot = 0 | 1;

/** Somebody who has asked their system for less motion. Read once; it does not change mid-visit. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Somebody who has asked their browser to go easy on their data plan. */
function prefersLessData(): boolean {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { connection?: { saveData?: boolean } }) : undefined;
  return Boolean(nav?.connection?.saveData);
}

/**
 * Clips are fetched by hand and handed to the players as local blob URLs,
 * never as plain network URLs. This is the difference between the doors
 * opening and the doors being a photograph, and it took a day to find.
 *
 * A <video> loads its file at the browser's lowest network priority. On the
 * pages this card sits on, Home and the front door, there are dozens of
 * artwork downloads in flight from the catalog at the same moment, and
 * Chrome holds any low-priority request back while that many are open. On a
 * slow connection the clip request simply never went out: play() was called,
 * the element reported itself playing, and not one frame ever arrived, so
 * the visitor saw the poster and nothing else. A fetch() is high priority
 * and goes straight through the same queue. So the clip is fetched, kept in
 * memory (each is under a megabyte), and played from there. The same trick
 * also makes every later replay instant. If the fetch itself fails, the raw
 * URL goes to the player anyway and it takes its chances.
 */
const clipCache = new Map<string, Promise<string>>();

/**
 * A whole tour is six clips. Anything beyond eight is a clip from a tour that
 * has already finished, so it is let go and its memory handed back. Oldest
 * first, which is always the entrance clip, long over by the time an eighth
 * clip is asked for.
 */
const CLIP_CACHE_MAX = 8;

function fetchClip(src: string): Promise<string> {
  let hit = clipCache.get(src);
  if (!hit) {
    while (clipCache.size >= CLIP_CACHE_MAX) {
      const oldest = clipCache.keys().next().value as string | undefined;
      if (!oldest) break;
      const gone = clipCache.get(oldest);
      clipCache.delete(oldest);
      void gone?.then((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    }
    hit = fetch(src, { priority: 'high' } as RequestInit)
      .then((r) => {
        if (!r.ok) throw new Error(`clip ${r.status}`);
        return r.blob();
      })
      .then((b) => URL.createObjectURL(b))
      .catch(() => {
        clipCache.delete(src);
        return src;
      });
    clipCache.set(src, hit);
  }
  return hit;
}

export function WorldDoorway({
  /** Rendered under the tour once the visitor is inside. This is the ask. */
  cta,
  className = '',
}: {
  cta: React.ReactNode;
  className?: string;
}) {
  const world = IMAN_AFRIKAH_WORLD;
  const reduceMotion = useMemo(prefersReducedMotion, []);
  const [phase, setPhase] = useState<Phase>('closed');
  const [room, setRoom] = useState(0);
  const [muted, setMuted] = useState(true);
  /** Which of the two players is on top. */
  const [active, setActive] = useState<Slot>(0);
  /** False from the moment a clip refuses to play. The stills take over from there. */
  const [motionOk, setMotionOk] = useState(true);
  /** True once the whole walk has been seen. The doors shut again, the ask stays. */
  const [toured, setToured] = useState(false);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const playerA = useRef<HTMLVideoElement | null>(null);
  const playerB = useRef<HTMLVideoElement | null>(null);
  const activeRef = useRef<Slot>(0);
  const mutedRef = useRef(true);

  const tour = useMemo(
    () =>
      TOUR.map((t) => ({
        ...t,
        poster: world.roomArt?.[t.slug],
        video: world.roomVideo?.[t.slug],
      })).filter((t) => t.poster),
    [world],
  );

  const entranceVideo = world.entrance?.video;
  const entrancePoster = world.entrance?.poster;

  /* Both players are muted by attribute as well as by property. React only
     sets the property, and a couple of mobile browsers decide whether a video
     may start by looking at the attribute. */
  useEffect(() => {
    for (const ref of [playerA, playerB]) {
      if (ref.current) {
        ref.current.defaultMuted = true;
        ref.current.muted = true;
      }
    }
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
    for (const ref of [playerA, playerB]) {
      if (ref.current) ref.current.muted = muted;
    }
  }, [muted]);

  /**
   * Load a clip into the player that is underneath and, once it is really
   * playing, bring that player to the top. Resolves true on success and false
   * when the browser refused, so the caller can fall back to the still.
   */
  const play = useCallback(async (src: string, poster: string | undefined, loop: boolean): Promise<boolean> => {
    const slot: Slot = activeRef.current === 0 ? 1 : 0;
    const el = (slot === 0 ? playerA : playerB).current;
    if (!el) return false;

    const url = await fetchClip(src);
    el.loop = loop;
    el.muted = mutedRef.current;
    if (poster) el.poster = poster;
    if (el.getAttribute('src') !== url) {
      el.setAttribute('src', url);
      el.load();
    } else {
      el.currentTime = 0;
    }

    try {
      await (el.play() ?? Promise.resolve());
    } catch {
      return false;
    }
    activeRef.current = slot;
    setActive(slot);
    return true;
  }, []);

  /* Warm the entrance clip once the card is near the screen, so the doors
     open the instant they are pushed rather than after a download. Skipped
     for anyone on a data-saver connection: they still get the clip when they
     ask for it, they just wait for it then. */
  useEffect(() => {
    const el = playerB.current;
    const host = frameRef.current;
    if (!entranceVideo || !el || !host || reduceMotion || prefersLessData()) return;

    const warm = () => {
      void fetchClip(entranceVideo).then((url) => {
        if (el.getAttribute('src') !== url) {
          el.preload = 'auto';
          el.setAttribute('src', url);
          el.load();
        }
      });
    };

    if (typeof IntersectionObserver === 'undefined') {
      warm();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          warm();
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(host);
    return () => io.disconnect();
  }, [entranceVideo, reduceMotion]);

  /* Somebody who has asked their system for less motion gets the inside
     without the cinema. They are usually people who get ill or disoriented by
     it, so it is honoured completely rather than shortened. */
  const open = useCallback(() => {
    if (reduceMotion || !entranceVideo) {
      setPhase('inside');
      return;
    }
    setPhase('opening');
    /* The first room starts downloading while the doors are still parting,
       so the walk begins the moment they are open. */
    if (tour[0]?.video && !prefersLessData()) void fetchClip(tour[0].video);
    void play(entranceVideo, entrancePoster, false).then((ok) => {
      if (!ok) {
        setMotionOk(false);
        setPhase('inside');
      }
    });
  }, [reduceMotion, entranceVideo, entrancePoster, play, tour]);

  /* The doors run on their own clock as well as on the clip's end event: a
     clip that stalls must not leave somebody staring at a frame with nothing
     to do. */
  useEffect(() => {
    if (phase !== 'opening') return;
    const t = window.setTimeout(() => setPhase('inside'), OPENING_MAX_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  /* Each room's loop starts the moment we arrive in it. A refusal here does
     not stop the walk; it just continues on the stills. */
  useEffect(() => {
    if (phase !== 'inside' || reduceMotion || !motionOk) return;
    const current = tour[Math.min(room, tour.length - 1)];
    if (!current?.video) return;
    let cancelled = false;
    void play(current.video, current.poster, true).then((ok) => {
      if (!cancelled && !ok) setMotionOk(false);
    });
    /* One room ahead, always, so a slow line shows motion and not a still. */
    const next = tour[room + 1];
    if (next?.video && !prefersLessData()) void fetchClip(next.video);
    return () => {
      cancelled = true;
    };
  }, [phase, room, tour, reduceMotion, motionOk, play]);

  /* Walking from room to room. After the last room the doors shut again and
     the walk is over: a preview that stays open on a loop reads as if the
     visitor is already inside, and they are not. The shut doors, with the ask
     still under them, say the true thing: you have seen it, the way in is
     below. A montage that never ends is wallpaper besides. */
  useEffect(() => {
    if (phase !== 'inside' || reduceMotion) return;
    const last = room >= tour.length - 1;
    const t = window.setTimeout(() => {
      if (last) {
        setToured(true);
        setPhase('closed');
        setRoom(0);
      } else {
        setRoom((r) => r + 1);
      }
    }, last ? LAST_ROOM_MS : ROOM_MS);
    return () => window.clearTimeout(t);
  }, [phase, room, tour.length, reduceMotion]);

  /* Shut doors play nothing. */
  useEffect(() => {
    if (phase !== 'closed') return;
    for (const ref of [playerA, playerB]) ref.current?.pause();
  }, [phase]);

  const current = tour[Math.min(room, tour.length - 1)];
  const still = phase === 'inside' ? current?.poster : entrancePoster;
  const showVideo = phase !== 'closed' && motionOk && !reduceMotion;

  /* The entrance clip does not loop; the room clips do. So a clip ending on
     its own can only ever be the doors finishing, which means we are in. */
  const onClipEnded = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!e.currentTarget.loop) setPhase('inside');
  }, []);

  const playerClass = (slot: Slot) =>
    `absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${
      showVideo && active === slot ? 'opacity-100' : 'opacity-0'
    }`;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-black ${className}`}
    >
      {/* The picture. Three layers, always mounted: the still, then the two
          players that take turns on top of it. */}
      <div
        ref={frameRef}
        className="relative aspect-[4/5] w-full sm:aspect-[16/10] lg:aspect-[21/9]"
      >
        <img
          src={still}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <video
          ref={playerA}
          className={playerClass(0)}
          muted
          playsInline
          preload="metadata"
          disablePictureInPicture
          aria-hidden="true"
          onEnded={onClipEnded}
        />
        <video
          ref={playerB}
          className={playerClass(1)}
          muted
          playsInline
          preload="metadata"
          disablePictureInPicture
          aria-hidden="true"
          onEnded={onClipEnded}
        />

        {/* Deep enough that white type is readable over any frame. Heavier
            while the doors are shut, because that is where the headline sits. */}
        <div
          className={`absolute inset-0 bg-gradient-to-t transition-colors duration-500 ${
            phase === 'closed'
              ? 'from-black via-black/55 to-black/25'
              : 'from-black via-black/50 to-transparent'
          }`}
        />

        {/* The seam of light between two shut doors. It is the only moving
            thing on the closed card, so the eye goes to it. */}
        {phase === 'closed' && (
          <div
            aria-hidden="true"
            className="absolute inset-y-8 left-1/2 w-px -translate-x-1/2 animate-pulse bg-white/70 motion-reduce:hidden"
            style={{ filter: 'blur(1.5px)' }}
          />
        )}

        {/* Who this belongs to. Present on every beat, so a screenshot of any
            frame still says whose world it is. */}
        <div className="absolute left-4 top-4 flex items-center gap-2">
          <span className="rounded-full border border-white/25 bg-black/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/85 backdrop-blur-sm">
            World #001
          </span>
          <span className="text-[11px] font-semibold text-white/75">{world.artistName}</span>
        </div>

        {/* Sound is off until asked for. An ad that makes noise at somebody is
            an ad they close. Only offered while there is a clip to hear. */}
        {showVideo && (
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            style={{ minWidth: 40, minHeight: 40 }}
            className="absolute right-4 top-4 rounded-full border border-white/25 bg-black/50 p-2 text-white/85 backdrop-blur-sm transition hover:bg-black/70"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        )}

        {/* CLOSED: one thing to do. */}
        {phase === 'closed' && (
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <h3 className="font-heading text-2xl font-bold leading-tight text-white sm:text-3xl">
              {toured ? 'The doors are shut again.' : 'His doors are right here.'}
            </h3>
            <p className="mt-1.5 max-w-md text-sm text-white/75">
              {toured
                ? 'That was a look through them. To walk in for real, the way is just below.'
                : world.positioning}
            </p>
            <Button
              onClick={open}
              size="lg"
              variant={toured ? 'outline' : 'default'}
              className={`mt-4 h-12 rounded-full px-7 text-sm font-semibold ${
                toured ? 'border-white/40 bg-black/40 text-white hover:bg-black/60 hover:text-white' : ''
              }`}
            >
              <DoorOpen className="mr-2 h-4 w-4" />
              {toured ? 'Look again' : 'Open the doors'}
            </Button>
          </div>
        )}

        {/* OPENING: nothing is asked. Just the name of what is happening. */}
        {phase === 'opening' && (
          <p className="absolute inset-x-0 bottom-6 flex justify-center animate-in fade-in fill-mode-both delay-500 duration-300">
            <span className="rounded-full bg-black/55 px-3 py-1 text-sm font-medium tracking-wide text-white/85 backdrop-blur-sm">
              Walking in...
            </span>
          </p>
        )}

        {/* INSIDE: which room this is, and how far through the walk we are. */}
        {phase === 'inside' && current && (
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
            <div className="mb-3 flex gap-1.5" aria-hidden="true">
              {tour.map((t, i) => (
                <span
                  key={t.slug}
                  className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${
                    i <= room ? 'bg-white/85' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
            <div
              key={current.slug}
              className="animate-in fade-in slide-in-from-bottom-1 duration-500"
            >
              <p className="font-heading text-xl font-bold text-white sm:text-2xl">
                {current.name}
              </p>
              <p className="text-sm text-white/75">{current.line}</p>
            </div>
          </div>
        )}
      </div>

      {/* The ask, under the picture rather than over it, so it is never
          competing with his art for the same pixels. */}
      {(phase === 'inside' || toured) && (
        <div className="border-t border-border bg-card animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="p-4 sm:p-5">{cta}</div>
        </div>
      )}
    </div>
  );
}

/**
 * What a stranger is offered at the end of the walk.
 *
 * WHO THIS IS TALKING TO. Almost everybody who reaches this is a listener, not
 * a musician, so it speaks to a listener: they get to walk in, and what they
 * find there is the artist, closer than a profile has ever put them. An
 * earlier draft said "that is one world, yours is the next one", which is a
 * fine line to say to an artist and a baffling one to say to somebody who has
 * no intention of making music. The artist offer still exists, one card down,
 * where it is clearly addressed to artists; the small link at the end of this
 * is the bridge for the few who are both.
 *
 * Walking on without an account stays available, because a person who is not
 * ready is better off inside the world than bounced off a form.
 */
export function DoorwayCtaGuest({
  onSignUp,
  onSignIn,
}: {
  onSignUp: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-foreground">
          That was a look inside. Now come in.
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Sign up free and you can walk these streets, hear the records where they were
          made, and get close enough to ask the artist a question yourself. The key to the
          inner rooms is offered once you are in.
        </p>
      </div>
      {/* A stranger is asked for one thing, an account. The key comes after,
          from the signed-in card, because a coin offered to someone with no
          account is a purchase with nowhere to land. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSignUp} className="h-10 rounded-full px-6 text-sm font-semibold">
          Sign up free
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          onClick={onSignIn}
          className="h-10 rounded-full px-5 text-sm font-semibold"
        >
          Log in
        </Button>
        <Link
          to={`/world/${IMAN_AFRIKAH_WORLD.slug}`}
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Or just look around first
        </Link>
      </div>
      {/* The one line for the minority who came here to make something rather
          than to listen. Small, and pointing at the card below, so it never
          competes with the ask above it. */}
      <div>
        <p className="text-[11px] text-muted-foreground">
          Make music yourself? You can have a world like this one, free.{' '}
          <button
            type="button"
            onClick={onSignUp}
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Join as an artist
          </button>
        </p>
      </div>
    </div>
  );
}

/**
 * What somebody already signed in is offered.
 *
 * They do not need an account, they need the key. The rooms in the walk they
 * just watched are gated on holding $IMAN, so this says that plainly and sends
 * them to his creator coin on Zora. It is stated as access, never as an investment,
 * and the app never touches the transaction.
 */
export function DoorwayCtaMember() {
  const world = IMAN_AFRIKAH_WORLD;
  const coin = getArtistCoin(world.artistId);
  const [keyOpen, setKeyOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-foreground">
          The key to those doors is {world.tokenSymbol}.
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Hold it and the Gallery and the Studio you just saw open, and the Screening Room with them. Sell it and they
          close again. You buy it from your own wallet on Base, and it stays there.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* No buy link inside the Android shell: Play reads "buy to unlock"
            as selling access outside its billing. The words stay; the sale
            happens in the person's own wallet. See ANDROID.md. */}
        {coin && !isNativeApp() && (
          <>
            <Button className="h-10 rounded-full px-6 text-sm font-semibold" onClick={() => setKeyOpen(true)}>
              Get {world.tokenSymbol}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <GetKeyModal
              open={keyOpen}
              onOpenChange={setKeyOpen}
              coinAddress={coin.coinAddress}
              symbol={world.tokenSymbol}
              artistName={world.artistName}
              worldSlug={world.slug}
            />
          </>
        )}
        <Button
          asChild
          variant="outline"
          className="h-10 rounded-full px-5 text-sm font-semibold"
        >
          <Link to={`/world/${world.slug}`}>
            <Glasses className="mr-1.5 h-4 w-4" />
            Enter the world
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default WorldDoorway;
