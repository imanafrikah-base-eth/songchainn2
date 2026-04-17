import { Link } from 'react-router-dom';
import { ArrowRight, Flame, Music2, PlayCircle, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WaveWarzBattleCard } from '@/components/wavewarz/WaveWarzBattleCard';
import { WaveWarzCountryJoinDialog } from '@/components/wavewarz/WaveWarzCountryJoinDialog';
import { WAVEWARZ_AFRICA_ASSETS, WAVEWARZ_AFRICA_LINKS, WAVEWARZ_BATTLE_CARDS, WAVEWARZ_HERO_STATS } from '@/data/wavewarzAfrica';

export function WaveWarzHomeHero() {
  return (
    <section className="mb-6 sm:mb-10">
      <div
        className="overflow-hidden rounded-3xl border border-cyan-400/35 bg-black/70"
        style={{
          backgroundImage: `linear-gradient(120deg, rgba(0,0,0,0.88), rgba(0,0,0,0.45)), url(${WAVEWARZ_AFRICA_ASSETS.heroLogoWithBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="grid gap-5 p-4 sm:p-6 lg:p-8">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-100">
              <Trophy className="h-3.5 w-3.5" />
              WaveWarz Africa
            </span>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
              <Link to="/wavewarz-africa" className="hover:text-emerald-200 transition-colors">
                Enter The African BattleZone
              </Link>
            </h1>
            <p className="max-w-2xl text-sm text-zinc-200 sm:text-lg">
              Make some money while voting and supporting your favorite artist or song. Compete, vote, earn, and discover the hottest artists across Africa in real-time music battles.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="bg-emerald-400 text-black hover:bg-emerald-300">
                <Link to={WAVEWARZ_AFRICA_LINKS.enterBattlez}>
                  <Flame className="mr-2 h-4 w-4" />
                  Enter BattleZ
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">
                <Link to={WAVEWARZ_AFRICA_LINKS.watchLiveBattles}>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Watch Live Battles
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-emerald-300/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20">
                <a href={WAVEWARZ_AFRICA_LINKS.learnMore} target="_blank" rel="noreferrer">
                  Learn How It Works
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {WAVEWARZ_HERO_STATS.map((stat) => (
                <Link
                  key={stat.label}
                  to={stat.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/45 px-3 py-2 text-xs text-zinc-100 transition hover:border-cyan-300/40"
                >
                  <span className="font-semibold">{stat.value}</span>
                  <span>{stat.label}</span>
                </Link>
              ))}
            </div>
            <div className="grid gap-2 rounded-2xl border border-cyan-400/25 bg-black/45 p-3 text-sm text-zinc-100 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="font-semibold text-cyan-100">Past Battle Result</p>
                <p>NDA won on votes.</p>
                <p>IMan Afrikah won on trades.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Link
                  to={WAVEWARZ_AFRICA_LINKS.quickBattles}
                  className="inline-flex items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
                >
                  Join $ongChain Artists To Battle
                </Link>
                <WaveWarzCountryJoinDialog
                  triggerClassName="h-auto justify-center rounded-xl border border-cyan-300/30 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-cyan-300/25 bg-black/55 p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
            <Music2 className="h-5 w-5 text-emerald-300" />
            Passed BattleZ
          </h2>
          <Link
            to={WAVEWARZ_AFRICA_LINKS.quickBattles}
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/30 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/10"
          >
            See All
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {WAVEWARZ_BATTLE_CARDS.map((battle) => (
            <WaveWarzBattleCard key={battle.id} battle={battle} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-300">
          <Users className="h-3.5 w-3.5 text-cyan-200" />
          BattleZone runs in $ongChainn app first, with embedded fallback only on hard errors.
        </div>
      </div>
    </section>
  );
}
