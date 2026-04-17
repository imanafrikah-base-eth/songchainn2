import { ArrowUpRight, CalendarDays, Coins, Flame, Landmark, MapPin, Trophy, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Button } from '@/components/ui/button';
import { WaveWarzRoleTabs } from '@/components/wavewarz/WaveWarzRoleTabs';
import { WaveWarzCountryJoinDialog } from '@/components/wavewarz/WaveWarzCountryJoinDialog';
import { WaveWarzCountryStatusPill } from '@/components/wavewarz/WaveWarzCountryStatusPill';
import { WaveWarzBattleCard } from '@/components/wavewarz/WaveWarzBattleCard';
import {
  WAVEWARZ_AFRICA_ASSETS,
  WAVEWARZ_AFRICA_LINKS,
  WAVEWARZ_BATTLE_CARDS,
  WAVEWARZ_BATTLE_RULES,
  WAVEWARZ_COUNTRY_ROLLOUT,
} from '@/data/wavewarzAfrica';

const onboardingSteps = [
  {
    title: 'Step 1: Connect Your Wallet',
    icon: Wallet,
    copy: 'You need a wallet on Solana to continue. Phantom is recommended and Solflare is supported. Start with about 0.05 SOL.',
    ctaLabel: 'Connect Wallet',
    ctaHref: WAVEWARZ_AFRICA_LINKS.connectWallet,
  },
  {
    title: 'Step 2: Open a Live Battle',
    icon: Flame,
    copy: 'Enter a live battle, buy/sell while the timer runs, and support your side with real-time market activity.',
    ctaLabel: 'Enter Live BattleZ',
    ctaHref: WAVEWARZ_AFRICA_LINKS.quickBattles,
  },
  {
    title: 'Step 3: Withdraw Your Winnings',
    icon: Coins,
    copy: 'When the timer ends, press Withdraw. Winning and losing holders split payouts by token position.',
    ctaLabel: 'Withdraw SOL',
    ctaHref: WAVEWARZ_AFRICA_LINKS.watchLiveBattles,
  },
];

export default function WaveWarzAfricaOnboarding() {
  const nextBattle = WAVEWARZ_BATTLE_CARDS.find((battle) => battle.status === 'upcoming') ?? WAVEWARZ_BATTLE_CARDS[0];

  return (
    <div className="min-h-screen bg-background pb-24 relative">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="container mx-auto px-3 py-4 sm:px-4 sm:py-8 relative z-10 space-y-6 sm:space-y-8">
        <section className="overflow-hidden rounded-3xl border border-cyan-400/35 bg-black/70">
          <div className="grid gap-6 p-5 lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
            <div className="space-y-4">
              <img
                src={WAVEWARZ_AFRICA_ASSETS.heroLogoTransparent}
                alt="WaveWarz Africa"
                className="h-16 w-auto object-contain sm:h-20"
              />
              <h1 className="text-3xl font-bold leading-tight text-white sm:text-5xl">
                Prepare For The Next Music Battle Wave Across Africa
              </h1>
              <p className="max-w-2xl text-sm text-zinc-200 sm:text-lg">
                Compete, support artists, and discover new talent across the continent in high-energy, real-time BattleZ.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="bg-emerald-400 text-black hover:bg-emerald-300">
                  <Link to={WAVEWARZ_AFRICA_LINKS.quickBattles}>
                    Join Now
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">
                  <a href={WAVEWARZ_AFRICA_LINKS.learnMore} target="_blank" rel="noreferrer">
                    Learn More
                  </a>
                </Button>
              </div>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl border border-cyan-300/25 p-4 sm:p-5"
              style={{
                backgroundImage: `linear-gradient(145deg, rgba(2,8,23,0.82), rgba(15,23,42,0.55)), url(${WAVEWARZ_AFRICA_ASSETS.heroBackgroundImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <p className="text-center text-2xl font-black tracking-wide text-white sm:text-3xl">NEXT BATTLE</p>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <article className="rounded-xl border border-emerald-300/30 bg-black/45 p-3 text-center">
                  <img
                    src={nextBattle.artistAImage}
                    alt={nextBattle.artistA}
                    className="mx-auto h-20 w-20 rounded-full border border-emerald-300/40 object-cover sm:h-24 sm:w-24"
                  />
                  <p className="mt-2 text-lg font-extrabold text-amber-200 sm:text-xl">{nextBattle.artistA}</p>
                  <p className="text-xs font-semibold tracking-wide text-zinc-200 sm:text-sm">SINGER · SONGWRITER</p>
                </article>
                <div className="text-3xl font-black text-amber-300 sm:text-4xl">VS</div>
                <article className="rounded-xl border border-cyan-300/30 bg-black/45 p-3 text-center">
                  <img
                    src={nextBattle.artistBImage}
                    alt={nextBattle.artistB}
                    className="mx-auto h-20 w-20 rounded-full border border-cyan-300/40 object-cover sm:h-24 sm:w-24"
                  />
                  <p className="mt-2 text-lg font-extrabold text-amber-200 sm:text-xl">{nextBattle.artistB}</p>
                  <p className="text-xs font-semibold tracking-wide text-zinc-200 sm:text-sm">SINGER · SONGWRITER</p>
                </article>
              </div>
              <div className="mt-4 space-y-2 rounded-xl border border-white/20 bg-black/45 px-3 py-2 text-sm text-white">
                <p className="flex items-center justify-center gap-2 text-center font-semibold sm:text-base">
                  <CalendarDays className="h-4 w-4 text-emerald-300" />
                  Scheduled for Apr 25, 2026, 6:00 PM
                </p>
                <p className="mx-auto flex w-fit items-center justify-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-100 sm:text-sm">
                  <MapPin className="h-3.5 w-3.5" />
                  Zambia
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-400/25 bg-black/55 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-white">Country Rollout</h2>
            <WaveWarzCountryJoinDialog triggerLabel="Click Here To Add Your Country" triggerClassName="bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {WAVEWARZ_COUNTRY_ROLLOUT.map((item) => (
              <div key={item.country} className="rounded-2xl border border-white/15 bg-black/40 p-3">
                <p className="text-sm font-semibold text-white">{item.country}</p>
                <div className="mt-2">
                  <WaveWarzCountryStatusPill state={item.state} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-400/25 bg-black/55 p-4 sm:p-6">
          <h2 className="text-2xl font-semibold text-white">Getting Started / How It Works</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {onboardingSteps.map((step) => (
              <article key={step.title} className="rounded-2xl border border-cyan-300/20 bg-black/45 p-4">
                <step.icon className="h-5 w-5 text-emerald-300" />
                <h3 className="mt-3 text-base font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm text-zinc-200">{step.copy}</p>
                <Button asChild size="sm" className="mt-4 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30">
                  {step.ctaHref.startsWith('http') ? (
                    <a href={step.ctaHref} target="_blank" rel="noreferrer">
                      {step.ctaLabel}
                    </a>
                  ) : (
                    <Link to={step.ctaHref}>
                      {step.ctaLabel}
                    </Link>
                  )}
                </Button>
              </article>
            ))}
          </div>
          <div className="mt-4 grid gap-4 rounded-2xl border border-emerald-300/20 bg-black/45 p-4 lg:grid-cols-2">
            <div>
              <h3 className="text-base font-semibold text-emerald-100">How A Battle Works</h3>
              <div className="mt-2 space-y-1.5">
                {WAVEWARZ_BATTLE_RULES.map((rule) => (
                  <p key={rule} className="text-sm text-zinc-200">
                    {rule}
                  </p>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-base font-semibold text-cyan-100">Wallet Setup</h3>
              <p className="mt-2 text-sm text-zinc-200">Phantom (recommended): phantom.com</p>
              <p className="text-sm text-zinc-200">Solflare (supported): solflare.com</p>
              <p className="mt-2 text-sm text-zinc-300">
                Recommended to start: buy about 0.05 SOL so you do not need to guess how much is needed.
              </p>
              <p className="text-sm text-zinc-300">You can buy SOL inside your wallet app/extension (tap/click SOL then Buy).</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-400/25 bg-black/55 p-4 sm:p-6">
          <h2 className="mb-4 text-2xl font-semibold text-white">Role-Based Onboarding</h2>
          <WaveWarzRoleTabs />
        </section>

        <section className="rounded-3xl border border-emerald-400/25 bg-black/55 p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Flame className="h-5 w-5 text-emerald-300" />
            <h2 className="text-2xl font-semibold text-white">Passed Battles</h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {WAVEWARZ_BATTLE_CARDS.map((battle) => (
              <WaveWarzBattleCard key={`zambia-${battle.id}`} battle={battle} />
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-400/25 bg-black/55 p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Landmark className="h-5 w-5 text-cyan-200" />
            <h2 className="text-2xl font-semibold text-white">FAQ & Next Actions</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button asChild className="bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30">
              <a href={WAVEWARZ_AFRICA_LINKS.learnMore} target="_blank" rel="noreferrer">Learn More</a>
            </Button>
            <Button asChild className="bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30">
              <Link to={WAVEWARZ_AFRICA_LINKS.createBattlez}>Create a BattleZ</Link>
            </Button>
            <Button asChild className="bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30">
              <Link to={WAVEWARZ_AFRICA_LINKS.supportCommunityBattle}>Support a Community Battle</Link>
            </Button>
            <Button asChild className="bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30">
              <Link to={WAVEWARZ_AFRICA_LINKS.launchNextQuickBattle}>Launch Next Quick Battle</Link>
            </Button>
          </div>
          <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-black/40 p-4">
            <p className="text-sm text-zinc-200">
              WaveWarz Africa is event-driven and battle-first. $ongChainn keeps the premium shell while WaveWarz adds competitive glow, velocity, and live conversion moments.
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              Need rollout support for your city? Use <span className="font-semibold text-cyan-100">Register Country / City</span> and we route details to {WAVEWARZ_AFRICA_LINKS.contactEmail}.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" className="border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">
              <a href={WAVEWARZ_AFRICA_LINKS.phantom} target="_blank" rel="noreferrer">
                <Wallet className="mr-2 h-4 w-4" />
                Phantom
              </a>
            </Button>
            <Button asChild variant="outline" className="border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">
              <a href={WAVEWARZ_AFRICA_LINKS.solflare} target="_blank" rel="noreferrer">
                <Trophy className="mr-2 h-4 w-4" />
                Solflare
              </a>
            </Button>
          </div>
        </section>
      </main>

      <AudioPlayer />
    </div>
  );
}
