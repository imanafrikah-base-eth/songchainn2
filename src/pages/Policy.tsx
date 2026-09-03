import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, ScrollText, Users } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { TERMS, PRIVACY, GUIDELINES, type PolicyDoc } from '@/legal/policies';

/**
 * One page that renders any of the three documents.
 *
 * They were three routes pointing at one Terms page before, so /privacy showed
 * the terms and there was no privacy policy at all. Splitting them is not
 * decoration: a privacy policy is a thing people are entitled to read, and
 * "see the terms" is not an answer to "what do you know about me".
 */

const DOCS: Record<string, PolicyDoc> = {
  terms: TERMS,
  privacy: PRIVACY,
  guidelines: GUIDELINES,
};

const ICON: Record<string, typeof ScrollText> = {
  terms: ScrollText,
  privacy: ShieldCheck,
  guidelines: Users,
};

export default function Policy({ which }: { which?: string }) {
  const params = useParams();
  const key = which ?? params.policy ?? 'terms';
  const doc = DOCS[key] ?? TERMS;
  const Icon = ICON[doc.key] ?? ScrollText;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-6">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <header className="mb-8 border-b border-border pb-6">
          <Icon className="mb-3 h-7 w-7 text-primary" />
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            {doc.title}
          </h1>
          <p className="mt-3 max-w-prose text-muted-foreground">{doc.summary}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            Version {doc.version} &middot; updated {doc.updated}
          </p>
        </header>

        <div className="space-y-8">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                {section.heading}
              </h2>
              <div className="mt-2 space-y-3">
                {section.body.map((para, i) => (
                  <p key={i} className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                    {para}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <nav className="mt-12 flex flex-wrap gap-2 border-t border-border pt-6">
          {Object.values(DOCS)
            .filter((d) => d.key !== doc.key)
            .map((d) => (
              <Link
                key={d.key}
                to={`/${d.key}`}
                className="rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                {d.title}
              </Link>
            ))}
        </nav>
      </main>
    </div>
  );
}
