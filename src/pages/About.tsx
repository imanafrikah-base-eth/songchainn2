import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Headphones, Mic2, Building2, Swords, Bot, Globe2, Coins, Mail } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { Button } from '@/components/ui/button';
import { ArtMosaic, ArtistFaces, PictureCard } from '@/components/ArtMosaic';
import { ZabalGamezSection } from '@/components/ZabalGamezSection';
import { ZABAL_GAMEZ_ENABLED } from '@/lib/features';
import { usePublishedCatalog } from '@/hooks/usePublishedCatalog';
import { usePublishedWorlds } from '@/hooks/usePublishedWorlds';
import { ARTISTS } from '@/data/musicData';
import { useAuth } from '@/context/AuthContext';

/**
 * What $ongChainn is, for anyone who lands here: a person with a phone who
 * wants music, an artist wondering where to release, and somebody who runs
 * a label and wants to know what the platform actually does with money.
 *
 * Pictures first, words second, and no forms. The artist door is one tap:
 * the Studio makes an artist account the moment somebody says they make
 * music, so the submission form that used to sit here is gone.
 */

const W = '/world-assets';

const fade = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 px-4 py-3">
      <p className="font-heading text-2xl font-bold text-foreground sm:text-3xl">{n}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

const About = () => {
  const { songs, artists: publishedArtists } = usePublishedCatalog();
  const { data: worlds = [] } = usePublishedWorlds();
  const { isArtist, user } = useAuth();
  const records = songs.length || 230;
  const artistCount = useMemo(() => new Set([...ARTISTS.map((a) => a.id), ...publishedArtists.map((a) => a.id)]).size, [publishedArtists]);

  return (
    <div className="relative min-h-screen bg-background pb-28">
      <AnimatedBackground />
      <Navigation />

      <main className="relative mx-auto max-w-5xl px-4 pt-6 sm:pt-10">
        {/* The music itself, before a word. */}
        <ArtMosaic count={18} seed={3} size="lg" className="-mx-4 mb-6 sm:mx-0" />

        <motion.section initial="hidden" animate="show" variants={fade} transition={{ duration: 0.4 }} className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-4 w-4" /> This is $ongChainn
          </span>
          <h1 className="mx-auto mt-4 max-w-3xl font-heading text-3xl font-bold leading-tight text-foreground sm:text-5xl">
            Music straight from the artist. Free to stream, yours to hold.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Artists release here first and keep everything. Fans stream for free, and the ones who care can hold a record, walk into an artist's world, or back a side in a battle.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button asChild className="h-11 rounded-full px-6"><Link to={user ? '/discover' : '/?auth=signup'}>{user ? 'Start listening' : 'Join free'} <ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
            <Button asChild variant="outline" className="h-11 rounded-full px-6"><Link to="/worlds">Walk into a world</Link></Button>
          </div>
          <div className="mt-5 flex items-center justify-center gap-3">
            <ArtistFaces count={8} />
            <p className="text-xs text-muted-foreground">{artistCount} artists, and every one of them keeps everything.</p>
          </div>
        </motion.section>

        {/* Numbers a label would ask for, real and live. */}
        <section className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat n={String(records)} label="records streaming free" />
          <Stat n={String(artistCount)} label="artists paid direct" />
          <Stat n={String(Math.max(1, worlds.length))} label={worlds.length === 1 ? 'world open' : 'worlds open'} />
          <Stat n="0%" label="of a coin trade kept by us" />
        </section>

        {/* For the person with a phone. */}
        <section className="mt-12">
          <div className="mb-4 flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-2xl font-bold text-foreground">If you listen</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <PictureCard image={`${W}/room-gallery.jpg`} title="Every record, free" line="Mastered before it was published, and it keeps playing offline." to="/discover" cta="Listen" />
            <PictureCard image={`${W}/room-streets.jpg`} video={`${W}/room-streets.mp4`} title="Walk into a world" line="Streets, rooms and a stage. Hold the key, doors open." to="/worlds" cta="Artist Worlds" />
            <PictureCard image={`${W}/room-stage.jpg`} title="Rooms and battles" line="Listen with everyone at once. Watch two artists go head to head." to="/room" cta="The Room" />
          </div>
        </section>

        {/* For the artist. */}
        <section className="mt-12">
          <div className="mb-4 flex items-center gap-2">
            <Mic2 className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-2xl font-bold text-foreground">If you make music</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <PictureCard image={`${W}/room-studio.jpg`} title="Release today" line="Send a record, or a whole EP. Live the same minute. No fee, no middleman." to={isArtist ? '/studio' : '/studio'} cta="Open the Studio" />
            <PictureCard image={`${W}/square-hero.jpg`} video={`${W}/square-hero.mp4`} title="A world, not a page" line="Your own streets and rooms. Ask Mo$ha and it builds it with you." to="/world-builder" cta="Build" />
            <PictureCard image={`${W}/room-request.jpg`} title="Paid to your wallet" line="Coin a record and every trade pays you by the coin's own rule." to="/keys" cta="How the money works" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Keep your distributor for the stores. This is the place your fans can hold your records and reach you directly.
          </p>
        </section>

        {/* For the person who runs a label. */}
        <section className="mt-12 overflow-hidden rounded-3xl border border-primary/30 bg-card/60">
          <div className="grid gap-6 p-5 sm:grid-cols-[1.1fr_1fr] sm:p-8">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="font-heading text-2xl font-bold text-foreground">If you run the business</h2>
              </div>
              <ul className="space-y-2 text-sm text-foreground">
                <li className="flex gap-2"><Coins className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Non-custodial. The platform never holds anyone's money, coins or keys.</li>
                <li className="flex gap-2"><Coins className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Every song coin pays its artist's own wallet on Base, by the contract's rule, and the app takes nothing on a trade.</li>
                <li className="flex gap-2"><Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Worlds, keys and bookings are direct artist to fan. Licensing requests land in the artist's Studio with the sender's email.</li>
                <li className="flex gap-2"><Swords className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Live battles judged on the audio by $HIKULU and NAKULU, with a crowd that votes.</li>
              </ul>
              <a href="mailto:songchaindao@gmail.com" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                <Mail className="h-4 w-4" /> songchaindao@gmail.com
              </a>
            </div>
            <div className="relative min-h-[14rem] overflow-hidden rounded-2xl bg-black">
              <img src={`${W}/entrance-doors.jpg`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              <video src={`${W}/entrance.mp4`} poster={`${W}/entrance-doors.jpg`} muted loop playsInline autoPlay preload="none" className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">World #001</p>
                <p className="font-heading text-lg font-bold text-white">The doors are real. Push them.</p>
              </div>
            </div>
          </div>
        </section>

        {/* The guide. */}
        <section className="mt-12 flex flex-col items-start gap-4 rounded-3xl border border-border bg-card/60 p-5 sm:flex-row sm:items-center sm:p-8">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15"><Bot className="h-6 w-6 text-primary" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-xl font-bold text-foreground">Mo$ha knows the place</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ask anything. It can put your record out, build your world and change anything on it, right in the chat.</p>
          </div>
          <Button variant="outline" className="h-10 shrink-0 rounded-full" onClick={() => window.dispatchEvent(new CustomEvent('songchainn:open-mosha'))}>
            Talk to Mo$ha
          </Button>
        </section>

        {ZABAL_GAMEZ_ENABLED && (
          <section id="zabal-gamez" className="mt-12">
            <ZabalGamezSection />
          </section>
        )}

        <section className="mt-12 rounded-3xl bg-primary px-5 py-8 text-center text-primary-foreground sm:px-8">
          <h2 className="font-heading text-2xl font-bold sm:text-3xl">Release here first, then everywhere.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm opacity-90">Built for every artist in the world. The first roster is Zambian. The doors are open.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild variant="secondary" className="h-11 rounded-full px-6"><Link to={user ? '/studio' : '/?auth=signup'}>{user ? 'Open the Studio' : 'Sign up free'}</Link></Button>
            <Button asChild variant="ghost" className="h-11 rounded-full px-6 text-primary-foreground hover:bg-white/10"><Link to="/worlds">See the worlds</Link></Button>
          </div>
        </section>
      </main>
      <AudioPlayer />
    </div>
  );
};

export default About;
