import { useQuery } from '@tanstack/react-query';
import { getCoin } from '@zoralabs/coins-sdk';
import { getArtistCoin, type ArtistCoin } from '@/lib/artistCoins';

/**
 * Live numbers for an artist's coin, read from Zora.
 *
 * Everything here is real and current. Nothing on this panel is ever a
 * placeholder: if Zora does not answer, the panel says so rather than showing
 * a zero that looks like a fact.
 */

export interface ArtistCoinStats {
  /** The static record: address, handle, where royalties go. */
  meta: ArtistCoin;
  name: string;
  symbol: string;
  marketCapUsd: number | null;
  /** Change in market cap over 24h, in USD. Negative is a fall. */
  marketCapDelta24h: number | null;
  volume24h: number | null;
  totalVolume: number | null;
  uniqueHolders: number | null;
  totalSupply: string | null;
  priceUsd: number | null;
  createdAt: string | null;
  /** Where Zora actually pays this coin's earnings, read live. */
  payoutRecipient: string | null;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param artistId  who to read.
 * @param override  a coin record resolved elsewhere (the database registry).
 *                  When given it wins, so an artist who added their own coin is
 *                  read from their row rather than from the static file.
 */
export function useArtistCoin(artistId: string | undefined, override?: ArtistCoin | null) {
  const meta = override ?? (artistId ? getArtistCoin(artistId) : null);

  return useQuery<ArtistCoinStats | null>({
    queryKey: ['artist-coin', meta?.coinAddress ?? null],
    enabled: Boolean(meta),
    // Market data, so it should feel live without being wasteful.
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
    queryFn: async () => {
      if (!meta) return null;
      const res = await getCoin({ address: meta.coinAddress, chain: 8453 });
      const z = (res as { data?: { zora20Token?: Record<string, unknown> } })?.data?.zora20Token;
      if (!z) throw new Error('Zora did not return this coin');

      const price = z.tokenPrice as { priceInUsdc?: string } | undefined;

      return {
        meta,
        name: String(z.name ?? meta.name),
        symbol: String(z.symbol ?? ''),
        marketCapUsd: num(z.marketCap),
        marketCapDelta24h: num(z.marketCapDelta24h),
        volume24h: num(z.volume24h),
        totalVolume: num(z.totalVolume),
        uniqueHolders: num(z.uniqueHolders),
        totalSupply: z.totalSupply != null ? String(z.totalSupply) : null,
        priceUsd: num(price?.priceInUsdc),
        createdAt: z.createdAt ? String(z.createdAt) : null,
        payoutRecipient: z.payoutRecipientAddress ? String(z.payoutRecipientAddress) : null,
      };
    },
  });
}
