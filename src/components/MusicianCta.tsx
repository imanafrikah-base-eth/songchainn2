import { Mic2, ShieldCheck, Zap, Wallet, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The musician door on the landing page.
 *
 * Until now the only way onto SONGCHAINN was an application form, so artists
 * had no reason to think this was for them. This says the opposite as loudly
 * as the page allows: you can release here today, for free, and nobody has to
 * approve you.
 */

const POINTS = [
  {
    icon: Zap,
    title: 'Live the same minute',
    body: 'Send a finished record and it goes straight to New Releases. No queue, no gatekeeper waiting to press approve.',
  },
  {
    icon: Wallet,
    title: 'No wallet needed',
    body: 'An account is all it takes to release. A wallet only matters later, when you want to coin a track and get paid to it.',
  },
  {
    icon: ShieldCheck,
    title: 'Held to a real standard',
    body: 'Every upload is measured against the catalog, so the bar is a number and not a mood. Miss it and you are told exactly what to fix.',
  },
];

export function MusicianCta({ onSignUp }: { onSignUp?: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-background to-background p-6 sm:p-10">
      {/* Soft glow, purely decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
          <Mic2 className="h-3.5 w-3.5" />
          For musicians
        </span>

        <h2 className="mt-4 font-heading text-3xl font-black leading-tight text-foreground sm:text-5xl">
          Put your music out.
          <br className="hidden sm:block" />
          <span className="text-gradient"> Today.</span>
        </h2>

        <p className="mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
          SONGCHAINN is open to artists. Sign up, send a finished record, and if it meets the standard it is live to listeners the same minute. Free to release, and the music stays yours.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="mb-2 h-5 w-5 text-primary" />
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={onSignUp}
            className="rounded-full px-7 text-base font-bold"
          >
            Sign up as a musician
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground">
            Already have songs on here? Open your artist page and tell us it is yours.
          </p>
        </div>
      </div>
    </section>
  );
}

export default MusicianCta;
