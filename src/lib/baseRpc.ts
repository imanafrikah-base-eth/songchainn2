/**
 * One place for the Base RPC endpoint.
 *
 * Five files each carried their own `https://mainnet.base.org`, the public,
 * shared, rate limited endpoint. One Home load on 18 Sep 2026 produced four
 * 429s from it (wallet balance, holdings, holder standing) before a single
 * song played, and every one of those reads then failed silently. Set
 * VITE_BASE_RPC_URL in Vercel to a keyed endpoint and every read moves over
 * at once; leave it unset and the public one is used as before.
 */
export const BASE_RPC_URL: string =
  (import.meta.env.VITE_BASE_RPC_URL as string | undefined)?.trim() || 'https://mainnet.base.org';
