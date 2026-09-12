import { useState } from 'react';
import { Coins, TrendingUp, TrendingDown, Users, ExternalLink, Loader2 } from 'lucide-react';
import { useArtistCoin } from '@/hooks/useArtistCoin';
import { useArtistCoinMeta } from '@/hooks/useArtistCoinMeta';

/**
 * An artist's coin, on their own page, behind a button.
 *
 * Behind a button on purpose. Someone who came to hear the music should not
 * have a market pushed at them, and someone who wants the market should be one
 * tap away from all of it. Nothing here is a placeholder: every number is read
 * live from Zora, and when Zora does not answer this says so rather than
 * showing a zero that reads like a fact.
 */

function money(n: number | null, dp = 2): string {
  if (n == null) return 'n/a';
  if (Math.abs(n) >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return '$' + n.toFixed(dp);
}

export function ArtistCoinPanel({ artistId }: { artistId: string | undefined }) {
  const [open, setOpen] = useState(false);
  // The database first, the static file as the fallback, so an artist who adds
  // their own coin gets this panel without waiting for a deploy.
  const meta = useArtistCoinMeta(artistId);
  const { data, isLoading, isError } = useArtistCoin(open ? artistId : undefined, meta);

  // No coin recorded for this artist, so there is nothing honest to show.
  if (!artistId || !meta) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm font-medium transition-colors hover:bg-card"
      >
        <Coins className="h-4 w-4 shrink-0" aria-hidden="true" />
        View this artist's coin
      </button>
    );
  }

  const up = (data?.marketCapDelta24h ?? 0) >= 0;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Coins className="h-4 w-4 shrink-0" aria-hidden="true" />
          {data?.symbol ? '$' + data.symbol : 'Artist coin'}
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Hide
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Reading the market
        </div>
      )}

      {isError && (
        <p className="py-4 text-sm text-muted-foreground">
          The market data would not load just now. The coin is fine, this panel is not.
          Try again in a moment.
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Market cap" value={money(data.marketCapUsd, 0)} />
            <Stat
              label="24 hours"
              value={data.marketCapDelta24h == null ? 'n/a' : money(Math.abs(data.marketCapDelta24h), 0)}
              tone={data.marketCapDelta24h == null ? undefined : up ? 'up' : 'down'}
            />
            <Stat
              label="Holders"
              value={data.uniqueHolders == null ? 'n/a' : String(data.uniqueHolders)}
              icon={<Users className="h-3 w-3" aria-hidden="true" />}
            />
            <Stat label="Traded all time" value={money(data.totalVolume, 0)} />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            This coin belongs to the artist, on their own Zora profile. SONGCHAINN does not
            hold it and cannot move it. Every trade pays the artist directly.
          </p>

          <a
            href={`https://zora.co/@${data.meta.zoraHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            See it on Zora
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={
          'mt-0.5 flex items-center gap-1 text-base font-semibold tabular-nums ' +
          (tone === 'up' ? 'text-emerald-500' : tone === 'down' ? 'text-red-500' : '')
        }
      >
        {tone === 'up' && <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
        {tone === 'down' && <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
        {value}
      </div>
    </div>
  );
}
