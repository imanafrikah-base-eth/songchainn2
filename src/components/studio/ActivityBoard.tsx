import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileText } from 'lucide-react';
import { DayBars } from '@/components/charts/DayBars';
import { BarList } from '@/components/charts/BarList';
import { useArtistActivity } from '@/lib/songDetails';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const basescan = (tx: string) => `https://basescan.org/tx/${tx}`;

interface HostFee { id: string; battle_id: string; quoted_usd: number | null; token_symbol: string | null; tx_hash: string | null; paid_at: string }
interface SyncRequest { id: string; song_id: string; requester_name: string; requester_email: string; company: string | null; use_type: string; territory: string | null; budget: string | null; message: string | null; status: string; created_at: string }

/**
 * The artist's activity board: the numbers a manager asks for on Monday and
 * an investor asks for before backing a record, on one screen.
 *
 * Streams by day, by city and by source; saves, followers, holders, copies
 * sold; every song ranked by the last thirty days; every purchase with its
 * transaction on Base; battle hosting fees; and the sync requests that came
 * in through the licensing page. All of it is counted server-side.
 */
export function ActivityBoard({ artistId }: { artistId: string }) {
  const { user } = useAuth();
  const { data, isLoading } = useArtistActivity(artistId);

  const { data: hostFees = [] } = useQuery({
    queryKey: ['host-fees', user?.id],
    enabled: Boolean(user?.id) && isSupabaseConfigured,
    queryFn: async (): Promise<HostFee[]> => {
      const { data } = await supabase
        .from('battle_host_fees' as never)
        .select('id, battle_id, quoted_usd, token_symbol, tx_hash, paid_at')
        .eq('host_user_id', user!.id)
        .order('paid_at', { ascending: false })
        .limit(50);
      return (data as HostFee[] | null) ?? [];
    },
  });

  const { data: syncRequests = [] } = useQuery({
    queryKey: ['sync-requests', artistId],
    enabled: Boolean(user?.id) && isSupabaseConfigured,
    queryFn: async (): Promise<SyncRequest[]> => {
      const { data } = await supabase
        .from('sync_requests' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      return (data as SyncRequest[] | null) ?? [];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Counting.</p>;
  if (!data) return null;

  const usd = (n: number) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const purchaseTotal = (data.money ?? []).reduce((s, p) => s + Number(p.usd || 0), 0);
  const hostTotal = hostFees.reduce((s, f) => s + Number(f.quoted_usd || 0), 0);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-heading text-lg font-bold text-foreground">Activity</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Counted on the server, not estimated. Plays are listens past thirty seconds. Cities come from the network. This board is the one to send your manager.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Plays, 30 days" value={data.plays_30d.toLocaleString()} hint={`${data.plays_total.toLocaleString()} all time`} />
        <Tile label="Listeners, 30 days" value={data.listeners_30d.toLocaleString()} />
        <Tile label="Saves" value={data.saves.toLocaleString()} />
        <Tile label="Followers" value={data.followers.toLocaleString()} />
        <Tile label="Holders" value={data.holders.toLocaleString()} hint="wallets holding a song of yours" />
        <Tile label="Copies sold" value={data.purchases.toLocaleString()} hint={data.usd_volume > 0 ? `${usd(data.usd_volume)} volume` : undefined} />
      </div>

      {data.by_day?.length ? (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Plays per day, whole catalog</p>
          <DayBars data={data.by_day} height={110} />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cities, 90 days</p>
          <BarList items={data.cities.map((c) => ({ label: c.city, sub: c.country, value: c.plays }))} emptyText="No city data yet. It fills in as people listen from today." />
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Where plays come from, 90 days</p>
          <BarList items={data.sources.map((s) => ({ label: s.source, value: s.plays }))} emptyText="Sources are recorded from today." />
        </div>
      </div>

      {data.per_song.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Song</th>
                <th className="px-3 py-2 text-right font-semibold">30 days</th>
                <th className="px-3 py-2 text-right font-semibold">All time</th>
                <th className="px-3 py-2 text-right font-semibold">Saves</th>
                <th className="px-3 py-2 text-right font-semibold">Copies</th>
                <th className="px-3 py-2 text-right font-semibold">Holders</th>
                <th className="px-3 py-2 text-right font-semibold">Volume</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.per_song.map((s) => (
                <tr key={s.song_id} className="border-t border-border">
                  <td className="px-3 py-2 text-foreground">{s.title}</td>
                  <td className="px-3 py-2 text-right text-foreground">{s.plays_30d.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{s.plays_total.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{s.saves.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{s.purchases.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{s.holders.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{s.usd_volume > 0 ? usd(s.usd_volume) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.money && (
        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <h3 className="font-heading text-base font-semibold text-foreground">Money</h3>
            <p className="text-xs tabular-nums text-muted-foreground">
              {usd(purchaseTotal)} in copies{hostTotal > 0 ? `, ${usd(hostTotal)} in hosting fees` : ''}
            </p>
          </div>
          {data.money.length === 0 && hostFees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has been bought yet. When somebody buys a copy of a song of yours, it lands here with its transaction on Base.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {data.money.map((p, i) => (
                <li key={`${p.tx_hash ?? i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">
                    {Number(p.copies).toLocaleString()} {Number(p.copies) === 1 ? 'copy' : 'copies'} of {p.title}
                    <span className="ml-2 text-xs text-muted-foreground">{new Date(p.at).toLocaleDateString()}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums text-foreground">
                    {usd(Number(p.usd || 0))}
                    {p.tx_hash && (
                      <a href={basescan(p.tx_hash)} target="_blank" rel="noopener noreferrer" aria-label="View on Basescan" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </span>
                </li>
              ))}
              {hostFees.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">
                    Hosting fee, battle
                    <span className="ml-2 text-xs text-muted-foreground">{new Date(f.paid_at).toLocaleDateString()}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums text-foreground">
                    {f.quoted_usd != null ? usd(Number(f.quoted_usd)) : f.token_symbol ?? ''}
                    {f.tx_hash && (
                      <a href={basescan(f.tx_hash)} target="_blank" rel="noopener noreferrer" aria-label="View on Basescan" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Trades of your coins pay your wallet directly on Base and are not listed here; your wallet is the record of those.
          </p>
        </div>
      )}

      <div>
        <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" /> Licensing requests
        </h3>
        {syncRequests.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            None yet. Every song page carries a "License this song" link; requests from film, TV, adverts and games land here with the sender's email.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
            {syncRequests.map((r) => (
              <li key={r.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">{r.requester_name}{r.company ? `, ${r.company}` : ''}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.use_type}{r.territory ? ` in ${r.territory}` : ''}{r.budget ? `, budget ${r.budget}` : ''} for song {r.song_id}
                </p>
                {r.message && <p className="mt-1 text-sm text-foreground">{r.message}</p>}
                <a href={`mailto:${r.requester_email}`} className="mt-1 inline-block text-xs font-medium text-primary">Reply to {r.requester_email}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
