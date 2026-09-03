/**
 * The ETH price in dollars, cached.
 *
 * A song copy is priced in dollars and settled in ETH, so turning an on-chain
 * sell quote back into "what your copy is worth" needs one number the chain does
 * not carry. This fetches it, keeps it for five minutes, and returns null rather
 * than a stale guess when it cannot be had. A null is honest; a wrong dollar
 * figure next to somebody's money is not.
 */

let cached: { usd: number; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

const SOURCES: Array<{ url: string; read: (json: unknown) => number | null }> = [
  {
    url: 'https://api.coinbase.com/v2/prices/ETH-USD/spot',
    read: (j) => {
      const amount = (j as { data?: { amount?: string } })?.data?.amount;
      const n = Number(amount);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
  },
  {
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    read: (j) => {
      const n = Number((j as { ethereum?: { usd?: number } })?.ethereum?.usd);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
  },
];

export async function getEthUsdPrice(): Promise<number | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.usd;

  for (const source of SOURCES) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 6000);
      const res = await fetch(source.url, { signal: controller.signal });
      window.clearTimeout(timer);
      if (!res.ok) continue;
      const usd = source.read(await res.json());
      if (usd !== null) {
        cached = { usd, at: Date.now() };
        return usd;
      }
    } catch {
      // Try the next source.
    }
  }

  // Better a slightly old price than none, but never an invented one.
  return cached?.usd ?? null;
}
