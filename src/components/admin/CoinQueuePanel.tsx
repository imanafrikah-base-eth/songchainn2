import { useQuery } from '@tanstack/react-query';
import { Coins, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface QueueRow {
  id: string;
  title: string | null;
  artist_name: string | null;
  artist_id: string | null;
  owner_id: string | null;
  onchain_requested_at: string | null;
  is_published: boolean;
}

/**
 * Records whose artist asked for a coin and do not have one yet.
 *
 * The mint runs from scripts/zora-mint with the platform signer, so this is
 * a work list, not a button: the song id is what the script takes, and the
 * row disappears the moment song_coins has a minted entry for it.
 */
export function CoinQueuePanel() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['coin-queue'],
    queryFn: async (): Promise<QueueRow[]> => {
      const [{ data: songs }, { data: coins }] = await Promise.all([
        supabase
          .from('songs')
          .select('id, title, artist_name, artist_id, owner_id, onchain_requested_at, is_published')
          .eq('distribution' as never, 'onchain' as never)
          .order('onchain_requested_at', { ascending: true }),
        supabase.from('song_coins' as never).select('song_id, mint_status'),
      ]);
      const minted = new Set(
        ((coins as Array<{ song_id: string; mint_status: string }> | null) ?? [])
          .filter((c) => c.mint_status === 'minted')
          .map((c) => c.song_id),
      );
      return ((songs as unknown as QueueRow[] | null) ?? []).filter((s) => !minted.has(s.id));
    },
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-heading text-xl font-semibold text-foreground flex items-center gap-2"><Coins className="h-5 w-5 text-primary" /> Coin queue</h2>
        <p className="text-sm text-muted-foreground">
          Artists who chose "on chain" or pressed "Take it onchain", waiting for a mint. Run the mint script with the song id; the row clears when song_coins shows it minted.
        </p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing waiting. Every requested coin is minted.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{r.title || 'Untitled'} <span className="text-muted-foreground">by {r.artist_name || 'unknown'}</span></p>
                <p className="text-xs text-muted-foreground">
                  {r.onchain_requested_at ? `asked ${new Date(r.onchain_requested_at).toLocaleString()}` : 'asked at upload'}
                  {!r.is_published ? ' · not yet published, mint after it passes' : ''}
                </p>
              </div>
              <button type="button" onClick={() => copy(r.id)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted">
                <Copy className="h-3.5 w-3.5" /> song id
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
