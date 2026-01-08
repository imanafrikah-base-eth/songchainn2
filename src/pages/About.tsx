import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Sparkles, Headphones, Users, Music, ArrowRight, Radio, Brain, ShieldCheck, LineChart } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { Button } from '@/components/ui/button';

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

export default function About() {
  return (
    <div className="min-h-screen bg-background pb-24 relative">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="container mx-auto px-3 sm:px-4 py-8 sm:py-12 relative z-10">
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
                <span>👀 What to Do Now</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="font-heading text-2xl sm:text-3xl md:text-4xl font-bold text-foreground leading-tight"
              >
                $ongChainn is where sound becomes signal and culture becomes tradeable.
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
                  onClick={() => {
                    const el = document.getElementById('listener-mode');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  Listeners
                </button>
                <span className="opacity-50">•</span>
                <button
                  type="button"
                  className="px-2 py-0.5 rounded-full hover:bg-muted/80 transition-colors"
                  onClick={() => {
                    const el = document.getElementById('culture');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  Culture
                </button>
                <span className="opacity-50">•</span>
                <button
                  type="button"
                  className="px-2 py-0.5 rounded-full hover:bg-muted/80 transition-colors"
                  onClick={() => {
                    const el = document.getElementById('for-traders');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  Traders
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
                    Right now:
                  </p>
                  <div className="grid gap-2 sm:gap-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs sm:text-sm w-max">
                      <Headphones className="w-4 h-4" />
                      <span>Listen</span>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs sm:text-sm w-max">
                      <Sparkles className="w-4 h-4" />
                      <span>Observe</span>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs sm:text-sm w-max">
                      <Music className="w-4 h-4" />
                      <span>Track what people are replaying</span>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-400 text-xs sm:text-sm w-max">
                      <Users className="w-4 h-4" />
                      <span>Watch what communities gravitate toward</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
                    <p>You don’t need to ape. You don’t need to rush.</p>
                    <p>
                      But if you understand markets, you’ll recognize this moment.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 sm:px-5 sm:py-4 space-y-2">
                    <p className="text-sm sm:text-base text-primary font-medium">
                      🎶 Music. Markets. Meet.
                    </p>
                    <p className="text-xs sm:text-sm text-primary/90">
                      If you’ve ever wished you could trade meaning instead of noise,
                      you’re early to the right place.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-5">
                  <div className="glass rounded-2xl p-4 sm:p-5 space-y-3">
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      $ongChainn is your on-chain listening home built around Create On
                      Base Town Squares.
                    </p>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      Listen in public with the community, or in private with your
                      own queue, while every play helps surface what actually matters.
                    </p>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      Here, listening is a market signal. Culture is tradable. Attention
                      is a primitive, not an accident.
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
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:gap-6 md:grid-cols-3 mb-10 sm:mb-12"
        >
          <motion.div
            variants={itemVariants}
            className="glass-card rounded-2xl p-4 sm:p-5 shine-overlay space-y-2"
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/15">
                <Headphones className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-heading text-sm sm:text-base font-semibold text-foreground">
                Listener Mode
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Listen, replay, and share while every action quietly builds your footprint inside
              $ongChainn.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 gap-1 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => {
                const el = document.getElementById('listener-mode');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              Learn more
              <ArrowRight className="w-3 h-3" />
            </Button>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="glass-card rounded-2xl p-4 sm:p-5 shine-overlay space-y-2"
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/15">
                <Radio className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="font-heading text-sm sm:text-base font-semibold text-foreground">
                Why $ongChainn
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              A music platform where songs live onchain and listeners finally matter.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 gap-1 border-emerald-400/40 text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => {
                const el = document.getElementById('why-songchainn');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              Learn more
              <ArrowRight className="w-3 h-3" />
            </Button>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="glass-card rounded-2xl p-4 sm:p-5 shine-overlay space-y-2"
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500/15">
                <LineChart className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="font-heading text-sm sm:text-base font-semibold text-foreground">
                For Traders
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Treat songs as onchain, liquid cultural assets and position before the crowd.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 gap-1 border-cyan-400/40 text-cyan-400 hover:bg-cyan-500/10"
              onClick={() => {
                const el = document.getElementById('for-traders');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              Learn more
              <ArrowRight className="w-3 h-3" />
            </Button>
          </motion.div>
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
                $ongChainn is for simply means music thats not just for listening, but for participating.
              </p>
              <p>
                Music has always moved culture, shaped moments and brought people together. But the value created by
                great songs rarely flows back to the people who actually support them: the listeners.
              </p>
              <p>$ongChainn changes that.</p>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Music className="w-4 h-4 text-primary" />
                <span>What $ongChainn Is</span>
              </p>
              <p>
                $ongChainn is a music platform built on Base, where songs live onchain and listeners matter. Here, music
                isn’t just streamed and forgotten. Every play, like, share and conversation leaves a real footprint.
              </p>
              <p>You’re not just consuming music, you’re part of its journey.</p>
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
                Listener Mode (Where You Are Now)
              </h2>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p>Right now, you’re in Listener Mode.</p>
              <p>That means:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>You listen to music</li>
                <li>You like, share, and discover tracks</li>
                <li>You earn points just by being active</li>
              </ul>
              <p>
                These points aren’t random. They unlock future drops, access and experiences as $ongChainn grows. If you
                have good taste, it will eventually matter.
              </p>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>What Makes $ongChainn Different</span>
              </p>
              <p>On most platforms:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>You stream</li>
                <li>The song blows up</li>
                <li>You get… nothing</li>
              </ul>
              <p>On $ongChainn:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Songs are preparing to become music tokens</li>
                <li>These tokens live on Base</li>
                <li>They can be collected, traded and moved like any other onchain asset</li>
              </ul>
              <p>
                When a song people love starts gaining attention, the community and the artist can share in that upside.
                No fake promises. No guaranteed profits. Just a system where attention actually counts for something.
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
              <p>Music doesn’t stay in one place. It spreads, from friend to friend, chats to timelines, rooms to cities.</p>
              <p>$ongChainn is designed around that idea.</p>
              <p>As songs move:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Artists benefit</li>
                <li>Listeners are recognized</li>
                <li>Communities form around sound, not algorithms</li>
              </ul>
              <p>Your taste becomes visible. Your support becomes meaningful and rewarding.</p>
            </div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="glass-card rounded-2xl p-5 sm:p-7 shine-overlay space-y-4 sm:space-y-5"
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-slate-500/15">
                <ShieldCheck className="w-5 h-5 text-slate-300" />
              </div>
              <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground">
                Why Blockchain
              </h2>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p>We use blockchain not for hype, but for clarity.</p>
              <p>Blockchain lets us:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Make ownership transparent</li>
                <li>Make participation provable</li>
                <li>Make music portable and programmable</li>
              </ul>
              <p>Built on Base, $ongChainn benefits from:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Ethereum-level security</li>
                <li>Low fees</li>
                <li>Deep liquidity</li>
                <li>A growing onchain culture</li>
              </ul>
              <p>
                You don’t need to understand blockchain to enjoy $ongChainn, but it’s there to make sure the system stays
                open and fair.
              </p>
            </div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="glass-card rounded-2xl p-5 sm:p-7 shine-overlay space-y-4 sm:space-y-5"
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-500/15">
                <Brain className="w-5 h-5 text-purple-400" />
              </div>
              <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground">
                Culture First, Tech Second
              </h2>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p>$ongChainn isn’t trying to replace music culture. It’s trying to protect and extend it.</p>
              <p>That’s why:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Music plays first</li>
                <li>Community comes before numbers</li>
                <li>Identity matters more than clout</li>
              </ul>
              <p>
                Whether you’re here to discover new music, hang out in The Room, support artists early or just vibe and
                listen, you belong here.
              </p>
            </div>
          </motion.div>

          <motion.div
            id="for-traders"
            variants={itemVariants}
            className="glass-card rounded-2xl p-5 sm:p-7 shine-overlay space-y-4 sm:space-y-5"
          >
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500/15">
                <LineChart className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground">
                For Traders: Music as an Asset Class
              </h2>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p>If you trade markets, pause for a second.</p>
              <p>Now imagine this:</p>
              <p>
                What if you bought Michael Jackson’s biggest song the week it dropped, not the vinyl, not royalties, but a
                liquid, tradeable onchain position tied to that song’s cultural momentum?
              </p>
              <p>Not thousands of dollars. Not millions. A few dollars. And then you simply held.</p>
              <p className="font-medium text-foreground flex items-center gap-2 pt-2">
                <Music className="w-4 h-4 text-cyan-400" />
                <span>Songs Are Not Like Other Assets</span>
              </p>
              <p>Most assets decay. Companies die, products expire, narratives rotate, markets forget.</p>
              <p>
                Music doesn’t. A great song can trend again 10 years later, go viral across generations, resurface in films,
                games, social media, clubs and culture cycles, and even outlive its creator.
              </p>
              <p>Music is a timeless asset, but until now, it hasn’t been tradeable like one.</p>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground flex items-center gap-2">
                <LineChart className="w-4 h-4 text-cyan-400" />
                <span>What $ongChainn Unlocks</span>
              </p>
              <p>$ongChainn brings music into the same world as tokens, liquidity and onchain discovery.</p>
              <p>Songs on $ongChainn are evolving into music tokens on Base. That means:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Songs can be collected early</li>
                <li>Songs can be traded peer-to-peer</li>
                <li>Attention becomes a measurable signal</li>
                <li>Cultural momentum becomes market momentum</li>
              </ul>
              <p>This isn’t streaming. This is price discovery for sound.</p>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Brain className="w-4 h-4 text-cyan-400" />
                <span>Think Like a Trader</span>
              </p>
              <p>
                If you trade forex, crypto, or NFTs, you already understand this: markets move on attention, narrative,
                volume, community belief.
              </p>
              <p>Music has all of these, before price ever exists.</p>
              <p>
                On $ongChainn, traders can spot songs early, watch community activity, track engagement before mainstream
                exposure and position before wider discovery.
              </p>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>Liquidity Meets Culture</span>
              </p>
              <p>
                Traditional music deals lock value behind contracts and gatekeepers. Onchain music is different:
                ownership is transparent, movement is permissionless, transfers are instant, markets are global.
              </p>
              <p>Built on Base, $ongChainn benefits from low fees, Ethereum security and deep onchain liquidity.</p>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Why Being Early Matters</span>
              </p>
              <p>
                Early crypto wasn’t about perfect products. It was about new primitives. $ongChainn is introducing one:
                music as a liquid, onchain asset.
              </p>
              <p>Not every song will moon. Not every trade will win.</p>
              <p>
                But being early means understanding the mechanics before the crowd, learning how music moves onchain and
                building conviction before noise arrives.
              </p>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground flex items-center gap-2">
                <LineChart className="w-4 h-4 text-cyan-400" />
                <span>The Asymmetry</span>
              </p>
              <p>
                A song can be bought for a few dollars today and be listened to by millions tomorrow. That asymmetry
                doesn’t exist in most markets.
              </p>
              <p>Music doesn’t dilute. Music doesn’t expire. Music doesn’t sleep. It waits.</p>
            </div>
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
                  <span>You&apos;re early to $ongChainn</span>
                </p>
                <h2 className="font-heading text-lg sm:text-xl md:text-2xl font-semibold text-foreground">
                  Press play, stay a while, and help shape what music onchain feels like.
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Discover artists, hang out in The Room, and let your listening, taste and attention leave a real onchain footprint.
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
