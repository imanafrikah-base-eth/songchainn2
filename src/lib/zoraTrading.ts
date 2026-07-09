import { createWalletClient, createPublicClient, custom, http, parseEther, parseAbi, type Address } from 'viem';
import { base } from 'viem/chains';
import { tradeCoin, createQuote } from '@zoralabs/coins-sdk';
import { getWalletProvider } from './baseWallet';

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
