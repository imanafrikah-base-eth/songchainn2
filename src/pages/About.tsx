import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { Sparkles, Headphones, Users, ArrowRight, Flame, Shuffle, Bot, Store, Mic } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { Button } from '@/components/ui/button';
import { ArtistSubmissionForm } from '@/components/ArtistSubmissionForm';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const FEATURE_HIGHLIGHTS = [
  {
    title: 'The Room',
    description: 'A live listening session with the community. Chat, vibe together, feel it bounce in real time.',
    icon: Headphones,
    accent: 'text-primary',
    surface: 'bg-primary/10',
  },
  {
    title: 'WaveWarz Africa',
    description: 'Two artists, one battle. Back your favorite in a live song battle and watch the crowd decide.',
    icon: Flame,
    accent: 'text-orange-400',
    surface: 'bg-orange-500/10',
  },
  {
    title: 'DJ $huffle',
    description: "Pick your artists, songs or catalogs and let DJ $huffle keep the mix flowing, nonstop.",
    icon: Shuffle,
    accent: 'text-emerald-400',
    surface: 'bg-emerald-500/10',
  },
  {
    title: 'Mo$ha',
    description: 'Your vibe guide around $ongChainn. Ask anything, get put on to new music, never feel lost.',
    icon: Bot,
    accent: 'text-purple-400',
    surface: 'bg-purple-500/10',
  },
  {
    title: 'Marketplace',
    description: 'Support a song or artist early and matter to the music you love, not just the algorithm.',
    icon: Store,
    accent: 'text-cyan-400',
    surface: 'bg-cyan-500/10',
  },
] as const;

export default function About() {
  const hasTriggeredBottomPromptRef = useRef(false);
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        // Let the page paint first so scrollIntoView measures real layout.
        window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    }
  }, [location.hash]);

  useEffect(() => {
    const onScroll = () => {
      if (hasTriggeredBottomPromptRef.current) return;
      const viewportBottom = window.scrollY + window.innerHeight;
      const threshold = document.documentElement.scrollHeight - 120;
      if (viewportBottom < threshold) return;
      hasTriggeredBottomPromptRef.current = true;
      window.dispatchEvent(
        new CustomEvent('songchainn:mosha-prompt', {
          detail: {
            text: 'Malakas, ready to move on now?',
            ctaLabel: 'Lets Go..',
            ctaPath: '/',
          },
        })
      );
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 lg:pl-28 pt-4 sm:pt-6 relative z-10">
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="mb-8 sm:mb-12"
        >
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl glass-card p-5 sm:p-8 md:p-12 shine-overlay">
            <div className="absolute -top-24 -right-10 w-60 sm:w-80 h-60 sm:h-80 opacity-40">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, hsl(var(--primary) / 0.9) 0%, transparent 70%)',
                  filter: 'blur(60px)',
                }}
                animate={{ scale: [1, 1.2, 1], x: [0, 20, 0], y: [0, -16, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
            <div className="absolute -bottom-24 -left-10 w-56 sm:w-72 h-56 sm:h-72 opacity-40">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, hsl(200 100% 60% / 0.7) 0%, transparent 70%)',
                  filter: 'blur(60px)',
                }}
                animate={{ scale: [1.1, 0.9, 1.1] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>

            <div className="relative z-10 space-y-4 sm:space-y-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full glass text-xs sm:text-sm font-medium text-primary"
              >
                <Sparkles className="w-4 h-4" />
                <span>What's $ongChainn?</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="font-heading text-2xl sm:text-3xl md:text-4xl font-bold text-foreground leading-tight"
              >
                Music that comes alive, where early listeners get to matter.
              </motion.h1>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22 }}
                className="inline-flex flex-wrap items-center gap-2 rounded-full bg-background/70 border border-border/60 px-2.5 py-1 text-[11px] sm:text-xs text-muted-foreground"
              >
                <button
                  type="button"
                  className="px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  onClick={() => scrollTo('features')}
                >
                  Features
                </button>
                <span className="opacity-50">•</span>
                <button
                  type="button"
                  className="px-2 py-0.5 rounded-full hover:bg-muted/80 transition-colors"
                  onClick={() => scrollTo('culture')}
                >
                  Community
                </button>
                <span className="opacity-50">•</span>
                <button
                  type="button"
                  className="px-2 py-0.5 rounded-full hover:bg-muted/80 transition-colors"
                  onClick={() => scrollTo('artist-submission')}
                >
                  Artists
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24 }}
                className="grid gap-4 sm:gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-start"
              >
                <div className="space-y-4 sm:space-y-5">
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                    Here's what you can do right now:
                  </p>
                  <div className="grid gap-2 sm:gap-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs sm:text-sm w-max">
                      <Headphones className="w-4 h-4" />
                      <span>Listen and hang out in The Room</span>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 text-orange-400 text-xs sm:text-sm w-max">
                      <Flame className="w-4 h-4" />
                      <span>Back an artist in a WaveWarz Africa battle</span>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs sm:text-sm w-max">
                      <Shuffle className="w-4 h-4" />
                      <span>Let DJ $huffle and Mo$ha keep you company</span>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs sm:text-sm w-max">
                      <Store className="w-4 h-4" />
                      <span>Support your favorite songs on the Marketplace</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-5">
                  <div className="glass rounded-2xl p-4 sm:p-5 space-y-3">
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      $ongChainn is your onchain listening home. Play music, hang out with the community,
                      and let every play, like and share build your footprint here.
                    </p>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      Listening isn't passive anymore, it's how you show up for the music and artists you love.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-background/80 p-4 sm:p-5 space-y-2">
                    <p className="text-sm sm:text-base text-foreground font-medium">
                      Welcome to $ongChainn.
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Press play. Stay a while.
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                      Founded and Built By{' '}
                      <span className="font-semibold text-foreground">
                        IMan Afrikah
                      </span>{' '}
                      [
                      <a
                        href="https://basescan.org/address/imanafrikah.base.eth"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-dotted underline-offset-2"
                      >
                        imanafrikah.base.eth
                      </a>
                      ] for musicians, fans and traders.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <Link to="/">
                      <Button className="gradient-primary text-primary-foreground shadow-glow gap-2">
                        <Headphones className="w-4 h-4" />
                        <span>Start Listening</span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link to="/community">
                      <Button
                        variant="outline"
                        className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
                      >
                        <Users className="w-4 h-4" />
                        <span>Explore Community</span>
                      </Button>
                    </Link>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.section>

        <motion.section
          id="features"
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="mb-10 sm:mb-12 scroll-mt-24"
        >
          <div className="mb-4 sm:mb-5">
            <h2 className="font-heading text-xl sm:text-2xl font-bold text-foreground mb-1.5">
              The fun stuff
            </h2>
            <p className="text-sm text-muted-foreground">
              Five ways to vibe on $ongChainn right now.
            </p>
          </div>
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_HIGHLIGHTS.map(({ title, description, icon: Icon, accent, surface }) => (
              <motion.div
                key={title}
                variants={itemVariants}
                className="glass-card rounded-2xl p-4 sm:p-5 shine-overlay space-y-2"
              >
                <div className={`inline-flex rounded-xl p-2 ${surface}`}>
                  <Icon className={`w-5 h-5 ${accent}`} />
                </div>
                <h3 className="font-heading text-sm sm:text-base font-semibold text-foreground">{title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{description}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-6 sm:space-y-8"
        >
          <motion.div
            id="why-songchainn"
            variants={itemVariants}
            className="glass-card rounded-2xl p-5 sm:p-7 shine-overlay space-y-4 sm:space-y-5"
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/15">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground">
                About $ongChainn
              </h2>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p>
                Music has always moved culture, but the people who support a song early rarely get to
                share in what it becomes. $ongChainn changes that.
              </p>
              <p>
                Every play, like, share and comment leaves a real footprint. You're not just streaming
                music here, you're part of its story.
              </p>
            </div>
          </motion.div>

          <motion.div
            id="listener-mode"
            variants={itemVariants}
            className="glass-card rounded-2xl p-5 sm:p-7 shine-overlay space-y-4 sm:space-y-5"
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/15">
                <Headphones className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground">
                Being an early supporter matters
              </h2>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p>
                On most platforms, you stream a song, it blows up, and you get nothing for having found it first.
              </p>
              <p>
                On $ongChainn, showing love early, listening, liking, sharing, pulsing, is how you build your
                place in the community and how you support the artists you believe in before everyone else
                catches on.
              </p>
            </div>
          </motion.div>

          <motion.div
            id="culture"
            variants={itemVariants}
            className="glass-card rounded-2xl p-5 sm:p-7 shine-overlay space-y-4 sm:space-y-5"
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500/15">
                <Users className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground">
                Music That Moves Like Culture
              </h2>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p>Music doesn't stay in one place. It spreads, from friend to friend, chats to timelines, rooms to cities.</p>
              <p>As songs move on $ongChainn: artists benefit, listeners get recognized, and communities form around sound.</p>
              <p>
                Whether you're here to discover new music, hang out in The Room, or support artists early,
                you belong here.
              </p>
            </div>
          </motion.div>

          <motion.div
            id="artist-submission"
            variants={itemVariants}
            className="glass-card rounded-2xl p-5 sm:p-7 shine-overlay space-y-4 sm:space-y-5 scroll-mt-24"
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/15">
                <Mic className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground">
                Are You An Artist?
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Want your music on $ongChainn? Tell us about yourself below, our team reviews every
              submission personally.
            </p>
            <ArtistSubmissionForm />
          </motion.div>
        </motion.section>

        <motion.footer
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-10 sm:mt-12"
        >
          <div className="glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-7 shine-overlay relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 opacity-25">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle, hsl(var(--primary) / 0.7) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }}
                animate={{ scale: [1, 1.1, 1], x: [0, 8, 0], y: [0, -6, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
            <div className="absolute -bottom-16 -left-10 w-40 h-40 opacity-20">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle, hsl(200 100% 60% / 0.7) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }}
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              />
            </div>
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
              <div className="space-y-2 sm:space-y-3 max-w-xl">
                <p className="text-xs sm:text-sm uppercase tracking-wide text-primary font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <span>You're early to $ongChainn</span>
                </p>
                <h2 className="font-heading text-lg sm:text-xl md:text-2xl font-semibold text-foreground">
                  Press play, stay a while, and help shape what music onchain feels like.
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Discover artists, hang out in The Room, and let your listening leave a real footprint.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <Link to="/">
                  <Button className="w-full sm:w-auto gradient-primary text-primary-foreground shadow-glow gap-2">
                    <Headphones className="w-4 h-4" />
                    <span>Back to Home</span>
                  </Button>
                </Link>
                <Link to="/discover">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto gap-2 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <Users className="w-4 h-4" />
                    <span>Discover Music</span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </motion.footer>
      </main>

      <AudioPlayer />
    </div>
  );
}
