import { createWalletClient, createPublicClient, custom, http, parseEther, parseAbi, type Address } from 'viem';
import { base } from 'viem/chains';
import { tradeCoin, createQuote } from '@zoralabs/coins-sdk';
import { getWalletProvider } from './baseWallet';

/*
 * THE 4% WE CANNOT CURRENTLY CLAIM, and why there is no referrer below.
 *
 * Zora's 1% trading fee splits creator 50, platform referrer 20, LP 20,
 * protocol 5, TRADE REFERRER 4, doppler 1. The trade referrer is set per trade
 * by whoever routes it, which would be us on every buy and sell in this app.
 *
 * CHECKED PROPERLY ON 12 SEP 2026, so nobody has to go and look again:
 *
 *   - 0.7.1 `TradeParameters` has no referrer. Its members are sell, buy,
 *     amountIn, slippage, sender, signer, recipient, signatures and
 *     permitActiveSeconds.
 *   - 0.8.0 IS PUBLISHED AND CHANGES NOTHING HERE. Read its type definitions
 *     straight from the tarball: `TradeParameters` is those same nine members,
 *     field for field. The old note here told the next person to upgrade and
 *     see whether the field had appeared. It has been checked. It has not.
 *   - The REST API underneath DOES take one. `PostQuoteData`, the body of
 *     POST /quote in the generated client, carries `referrer?: string`. But
 *     `createQuote` and `createTradeCall` both accept only `TradeParameters`
 *     and build that body themselves, so the SDK gives a caller no way to set
 *     it in either version.
 *
 * So the only route left is to stop using `tradeCoin`: post the quote ourselves
 * with a referrer and send the returned call with viem. That replaces the
 * execution path for every buy and sell across 231 coins, permit2 handling on
 * sells included, so it is its own piece of work with its own testing and not
 * something to slip in beside anything else. Confirm with Zora first that this
 * `referrer` really is the 4% trade referrer; the field name is suggestive, and
 * suggestive is not the same as verified.
 *
 * The 20% platform referrer is a different slice and IS being claimed, on every
 * coin launched through scripts/launch-coin.mjs. It is set once at creation and
 * is permanent, which is why coins created before SONGCHAINN existed can never
 * pay us that share.
 */
const RPC_URL = 'https://mainnet.base.org';
const ERC20_BALANCE_OF_ABI = parseAbi(['function balanceOf(address account) view returns (uint256)']);

export interface TradeResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

function getPublicClient() {
  return createPublicClient({ chain: base, transport: http(RPC_URL) });
}

function getUserWalletClient() {
  const provider = getWalletProvider();
  if (!provider) return null;
  return createWalletClient({ chain: base, transport: custom(provider) });
}

function describeTradeError(err: any): string {
  if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') return 'Transaction cancelled';
  if (typeof err?.message === 'string' && err.message.toLowerCase().includes('rejected')) {
    return 'Transaction cancelled';
  }
  if (typeof err?.message === 'string' && err.message.toLowerCase().includes('insufficient')) {
    return 'Insufficient balance for this trade plus network fee';
  }
  return err?.message || 'Trade failed';
}

/**
 * Buy a song's Zora Content Coin by spending ETH, using the connected user's own wallet.
 */
export async function buyCoinWithEth(params: {
  coinAddress: Address;
  ethAmount: string;
  userAddress: Address;
}): Promise<TradeResult> {
  const walletClient = getUserWalletClient();
  if (!walletClient) return { success: false, error: 'No wallet detected' };
  const publicClient = getPublicClient();

  try {
    const receipt = await tradeCoin({
      tradeParameters: {
        sell: { type: 'eth' },
        buy: { type: 'erc20', address: params.coinAddress },
        amountIn: parseEther(params.ethAmount),
        sender: params.userAddress,
        slippage: 0.05,
      },
      walletClient,
      account: params.userAddress,
      publicClient,
    });
    return { success: receipt.status === 'success', txHash: receipt.transactionHash };
  } catch (err: any) {
    return { success: false, error: describeTradeError(err) };
  }
}

/**
 * Sell a song's Zora Content Coin back for ETH, using the connected user's own wallet.
 */
export async function sellCoinForEth(params: {
  coinAddress: Address;
  tokenAmount: bigint;
  userAddress: Address;
}): Promise<TradeResult> {
  const walletClient = getUserWalletClient();
  if (!walletClient) return { success: false, error: 'No wallet detected' };
  const publicClient = getPublicClient();

  try {
    const receipt = await tradeCoin({
      tradeParameters: {
        sell: { type: 'erc20', address: params.coinAddress },
        buy: { type: 'eth' },
        amountIn: params.tokenAmount,
        sender: params.userAddress,
        slippage: 0.05,
      },
      walletClient,
      account: params.userAddress,
      publicClient,
    });
    return { success: receipt.status === 'success', txHash: receipt.transactionHash };
  } catch (err: any) {
    return { success: false, error: describeTradeError(err) };
  }
}

/**
 * Estimate how much ETH a sell of the given token amount would return, without submitting a trade.
 * Returns null if a quote can't be obtained (e.g. no liquidity) -- callers should degrade gracefully.
 */
export async function getSellQuote(params: {
  coinAddress: Address;
  tokenAmount: bigint;
  userAddress: Address;
}): Promise<bigint | null> {
  if (params.tokenAmount <= BigInt(0)) return BigInt(0);
  try {
    const quote = await createQuote({
      sell: { type: 'erc20', address: params.coinAddress },
      buy: { type: 'eth' },
      amountIn: params.tokenAmount,
      sender: params.userAddress,
    });
    if (!quote.success || !quote.quote?.amountOut) return null;
    return BigInt(quote.quote.amountOut);
  } catch {
    return null;
  }
}

/**
 * Estimate how many coins a spend of ETH would buy, without submitting a trade.
 * Returns null when there is no quote (no liquidity, wrong address); callers say
 * "no quote yet" rather than inventing a number.
 */
export async function getBuyQuote(params: {
  coinAddress: Address;
  ethAmount: string;
  userAddress: Address;
}): Promise<bigint | null> {
  try {
    const quote = await createQuote({
      sell: { type: 'eth' },
      buy: { type: 'erc20', address: params.coinAddress },
      amountIn: parseEther(params.ethAmount),
      sender: params.userAddress,
    });
    if (!quote.success || !quote.quote?.amountOut) return null;
    return BigInt(quote.quote.amountOut);
  } catch {
    return null;
  }
}

/**
 * Real on-chain ERC-20 balance check for a song coin (replaces the old fake ERC-1155 balanceOf).
 */
export async function getCoinTokenBalance(coinAddress: Address, userAddress: Address): Promise<bigint> {
  const publicClient = getPublicClient();
  try {
    // Cast bypasses a viem/TS overload resolution quirk on this read-only call; runtime behavior is unaffected.
    const balance = await (publicClient.readContract as any)({
      address: coinAddress,
      abi: ERC20_BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
    });
    return balance as bigint;
  } catch {
    return BigInt(0);
  }
}

/**
 * Batched balance check across every song coin in ONE multicall round trip,
 * so "My Collection" can list real on-chain holdings without hammering the
 * RPC with hundreds of individual balanceOf calls.
 */
export async function getOwnedCoinBalances(
  coins: Array<{ songId: string; coinAddress: Address }>,
  userAddress: Address
): Promise<Array<{ songId: string; balance: bigint }>> {
  if (coins.length === 0) return [];
  const publicClient = getPublicClient();
  try {
    const results = await (publicClient.multicall as any)({
      contracts: coins.map((coin) => ({
        address: coin.coinAddress,
        abi: ERC20_BALANCE_OF_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      })),
      allowFailure: true,
    });
    return coins
      .map((coin, i) => ({
        songId: coin.songId,
        balance: results[i]?.status === 'success' ? (results[i].result as bigint) : BigInt(0),
      }))
      .filter((entry) => entry.balance > BigInt(0));
  } catch {
    return [];
  }
}
