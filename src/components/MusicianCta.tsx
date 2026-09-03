import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The musician door on the landing page.
 *
 * Until now the only way onto SONGCHAINN was an application form, so artists
 * had no reason to think this was for them. This says the opposite: you can
 * release here today, for free, and nobody has to approve you.
 *
 * It used to say it as a flyer: an eyebrow pill, a 5xl black headline, a
 * paragraph, three icon-heading-paragraph blocks, a button and a footnote, all
 * inside a bordered card. That is a printed page, and a reader could tell.
 * Same three promises, said in one line each, unboxed, at app scale.
 */

const POINTS = ['Live the same minute', 'No wallet needed', 'Held to a real standard'];

export function MusicianCta({ onSignUp }: { onSignUp?: () => void }) {
  return (
    <section className="relative border-t border-border py-8 sm:py-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        For musicians
      </p>

      <h2 className="mt-2 font-heading text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
        Put your music out today.
      </h2>

      <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
        Send a finished record. If it meets the standard it is live to listeners the same minute.
        Free to release, and the music stays yours.
      </p>

      <ul className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground sm:text-sm">
        {POINTS.map((point, i) => (
          <li key={point} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden className="text-border">/</span> : null}
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onSignUp} className="h-11 rounded-full px-7 text-sm font-semibold">
          Sign up as a musician
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <p className="text-xs text-muted-foreground">
          Already have music on here? Your artist account is waiting, ask us for it.
        </p>
      </div>
    </section>
  );
}

export default MusicianCta;
