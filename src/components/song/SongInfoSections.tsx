import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, FileText } from 'lucide-react';
import { useSongDetails } from '@/lib/songDetails';
import { artistPath } from '@/lib/slugRoutes';
import { ArtistName } from '@/components/ArtistName';

/**
 * Lyrics, credits and the record's facts, under the player, where the big
 * apps put them. Nothing renders for a field the artist left empty, and the
 * licensing link is always there because a sync desk arrives from anywhere.
 */
export function SongInfoSections({ songId }: { songId: string }) {
  const { data } = useSongDetails(songId);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  if (!data) return null;

  const hasLyrics = Boolean(data.lyrics);
  const hasCredits = data.credits.length > 0;
  /* Only the ones the artist chose to print. A feature they kept off the
     display is still recorded on the record, it just does not appear here. */
  /* A collaborator is already in the credited name ("A & B"), so they are
     not printed a second time as a feature. */
  const shownFeatures = data.featured.filter((f) => f.show && !f.collab);
  const facts: Array<[string, string]> = [];
  if (data.release_date) facts.push(['Released', new Date(data.release_date + 'T00:00:00Z').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })]);
  if (data.language) facts.push(['Language', data.language]);
  if (data.isrc) facts.push(['ISRC', data.isrc]);
  if (data.iswc) facts.push(['ISWC', data.iswc]);
  if (data.publisher) facts.push(['Publisher', data.publisher]);
  if (data.pro) facts.push(['Collecting society', data.pro]);
  if (data.explicit) facts.push(['Content', 'Explicit']);

  const nothing =
    !hasLyrics && !hasCredits && !data.description && facts.length === 0 && shownFeatures.length === 0;

  return (
    <section className="mt-10 grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        {data.description && (
          <p className="mb-6 max-w-prose text-sm leading-relaxed text-muted-foreground">{data.description}</p>
        )}
        {hasLyrics ? (
          <div>
            <button
              type="button"
              onClick={() => setLyricsOpen((v) => !v)}
              aria-expanded={lyricsOpen}
              className="flex items-center gap-2 font-heading text-xl font-semibold text-foreground"
            >
              Lyrics
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${lyricsOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className={`relative mt-3 overflow-hidden transition-[max-height] duration-300 ${lyricsOpen ? 'max-h-[400rem]' : 'max-h-40'}`}>
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-foreground">{data.lyrics}</pre>
              {!lyricsOpen && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />}
            </div>
            {!lyricsOpen && (
              <button type="button" onClick={() => setLyricsOpen(true)} className="mt-2 text-sm font-medium text-primary">
                Show all
              </button>
            )}
          </div>
        ) : nothing ? (
          <p className="text-sm text-muted-foreground">The artist has not added lyrics or credits for this record yet.</p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-6">
        {/* Who else is on it. A name here is a real artist on SONGCHAINN, so
            it goes through ArtistName like every other name in the app and
            leads to their page. A typed credit could do neither. */}
        {shownFeatures.length > 0 && (
          <div>
            <h2 className="font-heading text-base font-semibold text-foreground">Featuring</h2>
            <ul className="mt-2 divide-y divide-border">
              {shownFeatures.map((f) => (
                <li key={f.artistId ?? `name-${f.name}`} className="py-1.5 text-sm">
                  {f.artistId ? (
                    <Link to={artistPath(f.artistId, f.name)} className="text-foreground transition-colors hover:text-primary">
                      <ArtistName name={f.name} artistId={f.artistId} size={13} />
                    </Link>
                  ) : (
                    <span className="text-foreground">{f.name}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {hasCredits && (
          <div>
            <h2 className="font-heading text-base font-semibold text-foreground">Credits</h2>
            <dl className="mt-2 divide-y divide-border">
              {data.credits.map((c, i) => (
                <div key={i} className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                  <dt className="text-muted-foreground">{c.role}</dt>
                  <dd className="text-right text-foreground">{c.name}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {facts.length > 0 && (
          <div>
            <h2 className="font-heading text-base font-semibold text-foreground">The record</h2>
            <dl className="mt-2 divide-y divide-border">
              {facts.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className={`text-right text-foreground ${k === 'ISRC' || k === 'ISWC' ? 'font-mono text-xs' : ''}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <Link
          to={`/license/${songId}`}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <FileText className="h-4 w-4 text-primary" /> License this song
        </Link>
      </div>
    </section>
  );
}
