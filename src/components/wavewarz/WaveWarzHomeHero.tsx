import { Link } from 'react-router-dom';
import { ArrowRight, Flame, PlayCircle, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WaveWarzCountryJoinDialog } from '@/components/wavewarz/WaveWarzCountryJoinDialog';
import { WAVEWARZ_AFRICA_ASSETS, WAVEWARZ_AFRICA_LINKS } from '@/data/wavewarzAfrica';

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
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">Coming Soon</h1>
            <p className="max-w-2xl text-sm text-zinc-200 sm:text-lg">
              Register your music and/or country on $ongChainn. All WaveWarz Africa battle activity happens on WaveWarz.com.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="bg-emerald-400 text-black hover:bg-emerald-300">
                <Link to={WAVEWARZ_AFRICA_LINKS.enterBattlez}>
                  <Flame className="mr-2 h-4 w-4" />
                  Register on $ongChainn
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">
                <a href="https://www.wavewarz.com" target="_blank" rel="noreferrer">
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Open WaveWarz.com
                </a>
              </Button>
              <WaveWarzCountryJoinDialog
                triggerLabel="Register Country / City"
                triggerClassName="border-emerald-300/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
              />
              <Button asChild variant="outline" className="border-emerald-300/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20">
                <a href={WAVEWARZ_AFRICA_LINKS.learnMore} target="_blank" rel="noreferrer">
                  Learn How It Works
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
