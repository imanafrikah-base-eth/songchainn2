import { useQuery } from '@tanstack/react-query';
import { createPublicClient, formatUnits, http, parseAbi, type Address } from 'viem';
import { base } from 'viem/chains';
import { supabase } from '@/integrations/supabase/client';
import { ARTIST_COINS } from '@/lib/artistCoins';
import { useArtistCoinRegistry } from '@/hooks/useArtistCoinMeta';
import { WWAT_TOKEN_ADDRESS, wwatIsLive } from '@/battlezone/config';

/**
 * Everything a wallet holds that SONGCHAINN put in the world, read off Base in
 * one multicall: artist coins (the keys to worlds), $WWAT, USDC, and the Drops
 * minted in artist worlds. Song coins stay with useOwnedSongs, which already
 * batches them.
 */

const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)']);
const ERC1155 = parseAbi(['function balanceOf(address account, uint256 id) view returns (uint256)']);
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

export interface HeldArtistCoin {
  artistId: string;
  name: string;
  zoraHandle: string;
  coinAddress: string;
  amount: number;
}

export interface HeldDrop {
  id: string;
  title: string;
  imageUrl: string | null;
  worldSlug: string | null;
  contract: string;
  tokenId: string;
  amount: number;
}

export interface WalletHoldings {
  artistCoins: HeldArtistCoin[];
  wwat: number;
  usdc: number;
  drops: HeldDrop[];
}

const valid = (a?: string | null): a is Address => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

export function useWalletHoldings(address: string | null | undefined) {
  const { data: registry } = useArtistCoinRegistry();

  return useQuery({
    queryKey: ['wallet-holdings', address, registry?.size ?? 0],
    enabled: valid(address),
    staleTime: 60_000,
    queryFn: async (): Promise<WalletHoldings> => {
      const owner = address as Address;

      const coinsById = new Map<string, { artistId: string; name: string; zoraHandle: string; coinAddress: string }>();
      for (const c of ARTIST_COINS) coinsById.set(c.artistId, c);
      for (const [id, c] of registry ?? new Map()) coinsById.set(id, c);
      const coins = [...coinsById.values()].filter((c) => valid(c.coinAddress));

      const { data: dropRows } = await supabase
        .from('world_nfts' as never)
        .select('id, title, image_url, world_slug, contract_address, token_id, status')
        .eq('status', 'live');
      const drops = ((dropRows ?? []) as unknown as Array<{
        id: string; title: string; image_url: string | null; world_slug: string | null; contract_address: string | null; token_id: number | string | null;
      }>).filter((d) => valid(d.contract_address) && d.token_id != null);

      const contracts = [
        ...coins.map((c) => ({ address: c.coinAddress as Address, abi: ERC20, functionName: 'balanceOf', args: [owner] })),
        { address: USDC_BASE as Address, abi: ERC20, functionName: 'balanceOf', args: [owner] },
        ...(wwatIsLive() && valid(WWAT_TOKEN_ADDRESS) ? [{ address: WWAT_TOKEN_ADDRESS as Address, abi: ERC20, functionName: 'balanceOf', args: [owner] }] : []),
        ...drops.map((d) => ({ address: d.contract_address as Address, abi: ERC1155, functionName: 'balanceOf', args: [owner, BigInt(d.token_id as string | number)] })),
      ];

      const results = contracts.length
        ? await (client.multicall as unknown as (a: unknown) => Promise<Array<{ status: string; result?: bigint }>>)({ contracts, allowFailure: true })
        : [];
      const at = (i: number) => (results[i]?.status === 'success' ? (results[i].result as bigint) : 0n);

      let i = 0;
      const artistCoins: HeldArtistCoin[] = [];
      for (const c of coins) {
        const bal = at(i++);
        if (bal > 0n) artistCoins.push({ ...c, amount: Number(formatUnits(bal, 18)) });
      }
      const usdc = Number(formatUnits(at(i++), 6));
      const wwat = wwatIsLive() && valid(WWAT_TOKEN_ADDRESS) ? Number(formatUnits(at(i++), 18)) : 0;
      const heldDrops: HeldDrop[] = [];
      for (const d of drops) {
        const bal = at(i++);
        if (bal > 0n) {
          heldDrops.push({
            id: d.id,
            title: d.title,
            imageUrl: d.image_url,
            worldSlug: d.world_slug,
            contract: d.contract_address as string,
            tokenId: String(d.token_id),
            amount: Number(bal),
          });
        }
      }
      return { artistCoins: artistCoins.sort((a, b) => b.amount - a.amount), wwat, usdc, drops: heldDrops };
    },
  });
}
