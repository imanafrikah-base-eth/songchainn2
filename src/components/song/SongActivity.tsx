import { DayBars } from '@/components/charts/DayBars';
import { BarList } from '@/components/charts/BarList';
import { useSongActivity } from '@/lib/songDetails';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * What is happening to this record, for anyone looking: a manager, a fan
 * deciding whether to hold it, a stranger deciding whether to back it.
 *
 * Every number is an event counted on the server. Plays are listens past
 * thirty seconds. Saves are hearts. Copies and holders come from Base via
 * the purchase records and the holdings cache. Cities are where the request
 * came from, never where somebody said they are.
 */
export function SongActivity({ songId }: { songId: string }) {
  const { data } = useSongActivity(songId);
  if (!data || data.plays_total === 0 && data.saves === 0 && data.purchases === 0) return null;

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold text-foreground">Activity</h2>
          <p className="text-xs text-muted-foreground">Real events, counted on the server. Plays are listens past thirty seconds.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Plays, 30 days" value={data.plays_30d.toLocaleString()} hint={`${data.plays_total.toLocaleString()} all time`} />
        <Tile label="Listeners, 30 days" value={data.listeners_30d.toLocaleString()} hint="signed-in people" />
        <Tile label="Saves" value={data.saves.toLocaleString()} />
        <Tile label="Copies sold" value={Number(data.copies_sold).toLocaleString()} hint={data.usd_volume > 0 ? `$${Number(data.usd_volume).toLocaleString()} volume` : undefined} />
        <Tile label="Holders" value={data.holders.toLocaleString()} hint="wallets holding now" />
      </div>

      {data.by_day?.length ? (
        <div className="mt-5 rounded-xl border border-border bg-card p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Plays per day</p>
          <DayBars data={data.by_day} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cities, 90 days</p>
          <BarList
            items={data.cities.map((c) => ({ label: c.city, sub: c.country, value: c.plays }))}
            emptyText="No city data yet. Cities are recorded from the network, and start appearing as people listen."
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Where plays come from, 90 days</p>
          <BarList
            items={data.sources.map((s) => ({ label: s.source, value: s.plays }))}
            emptyText="Sources start being recorded from today."
          />
        </div>
      </div>
    </section>
  );
}
