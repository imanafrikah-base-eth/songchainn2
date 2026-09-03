/**
 * How much of a coin a wallet holds, read straight from Base.
 *
 * A public read of a public number, done from the browser so a page can
 * answer "does this person hold any of this artist" without a server hop.
 * Never the basis for anything that moves money or opens a locked room:
 * the world gate does those reads on the server. This is for small courtesies
 * such as showing a holder when the artist is online.
 */

const RPC = 'https://mainnet.base.org';
const BALANCE_OF = '0x70a08231';
const cache = new Map<string, { at: number; value: number }>();
const TTL = 60_000;

export async function readCoinBalance(token: string, wallet: string, decimals = 18): Promise<number> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(token) || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) return 0;
  const key = `${token.toLowerCase()}:${wallet.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  try {
    const data = BALANCE_OF + wallet.toLowerCase().slice(2).padStart(64, '0');
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: token, data }, 'latest'] }),
    });
    if (!res.ok) return hit?.value ?? 0;
    const body = (await res.json()) as { result?: string };
    if (!body.result || !/^0x[a-fA-F0-9]*$/.test(body.result)) return hit?.value ?? 0;
    const raw = BigInt(body.result === '0x' ? '0x0' : body.result);
    // Whole tokens with three decimals of precision, enough for a dollar check.
    const value = Number(raw / BigInt(10) ** BigInt(decimals - 3)) / 1000;
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value ?? 0;
  }
}
