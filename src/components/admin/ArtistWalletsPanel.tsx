import { useCallback, useEffect, useState } from 'react';
import { Wallet, Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * Where each artist gets paid.
 *
 * Every song coin currently pays its creator earnings into one shared wallet, so
 * there is no per-artist figure anywhere and nothing honest the app can say
 * about what an artist earns. The coins are re-pointable, so this screen is the
 * first half of fixing that: put an address against each artist, then run
 * scripts/zora-mint/route-payouts.mjs to point their coins at it on chain.
 *
 * "Routed" only lights up once the coins have actually been changed on Base, not
 * when the address is typed here. An address on file that no coin pays to is
 * exactly the kind of thing that looks finished and is not.
 */

interface Row {
  artist_id: string;
  artist_name: string;
  wallet_address: string | null;
  minted_coins: number;
  routed_at: string | null;
  routed_coins: number;
}

const isAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v.trim());
const isCollab = (name: string) =>
  /\s(x|ft\.?|feat\.?|&|vs\.?)\s/i.test(name) || /[A-Za-z](vs|ft|feat)[A-Z]/i.test(name);

const nameKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Pull the individual artists out of a collaboration name.
 *
 * "IMAN AFRIKAH x RVSSIAN" is two people, "NEMESISvsLADYRYN" is two people
 * written without spaces. Splitting on the joining word gives the names to offer
 * as the person who receives, so the decision is a tap rather than a paste.
 */
const partsOf = (name: string) =>
  name
    .replace(/([A-Za-z])(?:vs|ft|feat)([A-Z])/g, '$1|$2')
    .split(/\s(?:x|ft\.?|feat\.?|&|vs\.?)\s|\|/i)
    .map((p) => p.trim())
    .filter(Boolean);

export function ArtistWalletsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_payout_routing_status' as never);
    if (error) {
      toast.error('Could not load the payout list', { description: error.message });
      setLoading(false);
      return;
    }
    const list = (data ?? []) as unknown as Row[];
    setRows(list);
    setDrafts(Object.fromEntries(list.map((r) => [r.artist_id, r.wallet_address ?? ''])));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (row: Row) => {
    const value = (drafts[row.artist_id] ?? '').trim();
    if (value && !isAddress(value)) {
      toast.error('That is not a wallet address', {
        description: 'It should start with 0x and be 42 characters long.',
      });
      return;
    }
    setSaving(row.artist_id);
    /*
     * Select the row back and check it actually changed.
     *
     * A row level security policy that refuses an update does not raise an
     * error, it just matches nothing. Without this check the panel would show a
     * success toast for a write that never landed, which is precisely the kind
     * of quiet failure this whole review has been digging out.
     */
    const { data: updated, error } = await supabase
      .from('artist_wallets' as never)
      .update({ wallet_address: value || null, updated_at: new Date().toISOString() } as never)
      .eq('artist_id', row.artist_id)
      .select('artist_id');
    setSaving(null);
    if (error) {
      toast.error('Could not save that address', { description: error.message });
      return;
    }
    if (!updated || (updated as unknown[]).length === 0) {
      toast.error('That did not save', {
        description: 'Your account cannot change payout addresses.',
      });
      return;
    }
    toast.success(value ? `${row.artist_name} will be paid at ${value.slice(0, 10)}...` : 'Address cleared');
    void load();
  };

  const withWallet = rows.filter((r) => r.wallet_address).length;
  const coinsWaiting = rows.filter((r) => !r.wallet_address).reduce((n, r) => n + Number(r.minted_coins), 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold text-foreground flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          Artist payouts
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every song coin currently pays into one shared wallet. Put an address against each artist
          here, then run <code className="text-xs">scripts/zora-mint/route-payouts.mjs</code> to point
          their coins at it. After that they are paid directly, and anyone can check it on Basescan.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg border border-border bg-card px-3 py-1.5 text-muted-foreground">
          <b className="text-foreground">{withWallet}</b> of {rows.length} artists have an address
        </span>
        {coinsWaiting > 0 && (
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-amber-400">
            <b>{coinsWaiting}</b> coins still paying the shared wallet
          </span>
        )}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const collab = isCollab(r.artist_name);
            const routed = !!r.routed_at;
            return (
              <li key={r.artist_id} className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{r.artist_name}</span>
                  <span className="text-xs text-muted-foreground">{r.minted_coins} coins</span>
                  {routed && (
                    <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                      <Check className="h-3 w-3" /> {r.routed_coins} routed
                    </span>
                  )}
                  {collab && (
                    r.wallet_address ? (
                      <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        <Check className="h-3 w-3" /> split decided
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                        <AlertCircle className="h-3 w-3" /> more than one artist
                      </span>
                    )
                  )}
                </div>

                {collab && !r.wallet_address && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    More than one person made this. A coin has one payout address, so choose who
                    receives it. They can settle with the others off chain, or you can paste a
                    splitter contract address instead.
                  </p>
                )}

                {collab && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {partsOf(r.artist_name).map((part) => {
                      const match = rows.find(
                        (o) => !isCollab(o.artist_name) && nameKey(o.artist_name) === nameKey(part),
                      );
                      const disabled = !match?.wallet_address;
                      return (
                        <button
                          key={part}
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            setDrafts((d) => ({ ...d, [r.artist_id]: match?.wallet_address ?? '' }))
                          }
                          className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 min-h-10"
                          title={disabled ? `${part} has no address on file yet` : `Pay ${part}`}
                        >
                          Pay {part}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={drafts[r.artist_id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.artist_id]: e.target.value }))}
                    placeholder="0x..."
                    spellCheck={false}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-primary"
                  />
                  <Button
                    size="sm"
                    className="h-10"
                    disabled={saving === r.artist_id || (drafts[r.artist_id] ?? '') === (r.wallet_address ?? '')}
                    onClick={() => void save(r)}
                  >
                    {saving === r.artist_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                  {r.wallet_address && (
                    <a
                      href={`https://basescan.org/address/${r.wallet_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-10 items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Basescan <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
