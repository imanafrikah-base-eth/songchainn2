import { useQuery } from '@tanstack/react-query';
import { getCoin } from '@zoralabs/coins-sdk';
import { WWAT_TOKEN_ADDRESS, wwatIsLive } from '@/battlezone/config';

/**
 * What a $WWAT fee really costs today, in the words people read first.
 *
 * Both battle fees are priced in dollars but never charge more than a fixed
 * number of tokens, and while $WWAT is cheap that ceiling is what leaves the
 * wallet: hosting is about a penny and voice a few cents, not $1 and $3. So
 * the screen leads with the real amount (founder, 15 Sep 2026), worked out
 * from the live price the same way battle-host-fee and battle-voice charge it,
 * and falls back to "a few cents" when the price cannot be read. It never
 * prints a dollar figure the host will not actually pay.
 */
export interface WwatFee {
  /** The tokens that will leave the wallet, rounded for reading. */
  tokens: number;
  /** "about 1 cent", "about 3 cents", "about $1.00". */
  words: string;
  /** True while the token ceiling is what gets charged. */
  capped: boolean;
}

function centsWords(usd: number): string {
  if (usd >= 1) return `about $${usd.toFixed(2)}`;
  const cents = Math.max(1, Math.round(usd * 100));
  return `about ${cents} ${cents === 1 ? 'cent' : 'cents'}`;
}

export function useWwatFee(usdPrice: number, maxTokens: number): WwatFee {
  const { data: priceUsd } = useQuery({
    queryKey: ['wwat-price-usd'],
    enabled: wwatIsLive(),
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const res = await getCoin({ address: WWAT_TOKEN_ADDRESS, chain: 8453 });
      const raw = (res as { data?: { zora20Token?: { tokenPrice?: { priceInUsdc?: string } } } })?.data?.zora20Token?.tokenPrice?.priceInUsdc;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
  });

  if (!priceUsd) return { tokens: maxTokens, words: 'a few cents', capped: true };
  const atPrice = usdPrice / priceUsd;
  const capped = atPrice > maxTokens;
  const tokens = Math.ceil(capped ? maxTokens : atPrice);
  return { tokens, words: centsWords(tokens * priceUsd), capped };
}
