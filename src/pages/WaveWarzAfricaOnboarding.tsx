import { ExternalLink } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { AudioPlayer } from '@/components/AudioPlayer';

export default function WaveWarzAfricaOnboarding() {
  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="px-4 pt-4 sm:pt-6 relative z-10">
        <section className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-cyan-400/35 bg-black/70 p-6 text-center sm:p-10">
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-5xl">WaveWarz Africa</h1>
          <p className="mt-3 text-sm text-zinc-200 sm:text-lg">Coming soon.</p>
          <p className="mt-4 text-sm text-zinc-300">
            You can register your music and country inside $ongChainn. All WaveWarz Africa battle activity happens on WaveWarz.com.
          </p>
          <a
            href="https://www.wavewarz.com"
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 py-3 text-sm font-bold text-black hover:bg-emerald-300 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Open WaveWarz.com
          </a>
        </section>
      </main>

      <AudioPlayer />
    </div>
  );
}
