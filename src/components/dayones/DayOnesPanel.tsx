import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useArtistDayOnes, useMyDayOnes } from '@/lib/dayOnes';
import { DayOneCard } from '@/components/dayones/DayOneCard';

/**
 * The Home sidebar's Day Ones block, in place of the old "Live now" list of
 * slogans. A fan sees their own cards; an artist sees the people who found
 * them first.
 */
export function DayOnesPanel() {
  const { user, isArtist, artistId } = useAuth();
  const { data: mine = [] } = useMyDayOnes();
  const { data: fans = [] } = useArtistDayOnes(isArtist ? artistId : null, 5);

  if (!user) return null;

  if (isArtist) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-semibold text-foreground sm:text-base">Your Day Ones</h3>
          <Link to="/day-ones" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">The first people to find your music, in the order they got there.</p>
        {fans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
            Your Day One #1 is whoever listens to a song of yours and likes it first. Share a record and see who it is.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {fans.map((f) => (
              <li key={f.user_id}>
                <Link to={`/audience/${f.user_id}`} className="flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-muted/50">
                  <span className="w-9 shrink-0 font-mono text-sm font-bold tabular-nums text-foreground">#{f.fan_number}</span>
                  {f.avatar_url ? (
                    <img src={f.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                      {f.display_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate text-sm text-foreground">{f.display_name}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }

  const best = mine.length ? mine.reduce((a, b) => (b.fan_number < a.fan_number ? b : a)) : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold text-foreground sm:text-base">Your Day Ones</h3>
        {mine.length > 0 && (
          <Link to="/day-ones" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            {mine.length} {mine.length === 1 ? 'card' : 'cards'} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {mine.length === 0 ? (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Get there first. Listen to a song and like it, and you get its number for good. The earlier you are, the lower it is.
          </p>
          <Link
            to="/discover"
            className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
          >
            Find something early
          </Link>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {best
              ? `Your lowest: #${best.fan_number} for ${best.kind === 'song' ? best.song_title ?? 'a record' : best.artist_name ?? 'an artist'}.`
              : ''}
          </p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
            {mine.slice(0, 6).map((r) => (
              <Link key={r.id} to="/day-ones" className="shrink-0">
                <DayOneCard receipt={r} size="sm" className="w-32" />
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default DayOnesPanel;
