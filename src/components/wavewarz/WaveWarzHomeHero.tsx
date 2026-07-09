import { Link } from 'react-router-dom';
import { ArrowRight, Flame, PlayCircle, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WaveWarzCountryJoinDialog } from '@/components/wavewarz/WaveWarzCountryJoinDialog';
import { AmbientBackground } from '@/components/AmbientBackground';

export function WaveWarzHomeHero() {
  return (
    <section className="mb-6 sm:mb-10">
      <div className="relative isolate overflow-hidden rounded-3xl border border-cyan-400/35 bg-black/70">
        <AmbientBackground
          pool="waveWarz"
          opacity={0.45}
          overlay="hero"
          zoom
          glow
          className="-z-10"
        />
        <div className="grid gap-5 p-4 sm:p-6 lg:p-8">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-100">
              <Trophy className="h-3.5 w-3.5" />
              WaveWarz Africa
            </span>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">Live Music Battles</h1>
            <p className="max-w-2xl text-sm text-zinc-200 sm:text-lg">
              Watch, vote, and speak live in the room, right here in $ongChainn. Two artists battle, the crowd decides.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="bg-emerald-400 text-black hover:bg-emerald-300">
                <Link to="/wavewarz-africa/battles/live">
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Watch Live Battles
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">
                <Link to="/wavewarz-africa/host/create">
                  <Flame className="mr-2 h-4 w-4" />
                  Host a Battle
                </Link>
              </Button>
              <WaveWarzCountryJoinDialog
                triggerLabel="Register Country / City"
                triggerClassName="border-emerald-300/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
              />
              <Button asChild variant="outline" className="border-emerald-300/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20">
                <Link to="/wavewarz-africa/how-it-works">
                  Learn How It Works
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
