import { formatEther, parseEther } from 'viem';
import { buyCoinWithEth } from '@/lib/zoraTrading';
import { getWalletProvider } from '@/lib/baseWallet';
import { getPublicClient } from '@/lib/nft';
import { requestWalletConnection } from '@/lib/walletGate';
import { supabase } from '@/integrations/supabase/client';

/**
 * Buying anything here, in one path, with the checks done before the money
 * moves rather than after.
 *
 * Every asset on SONGCHAINN is bought the same way: a coin on Base, from the
 * person's own wallet. So there is one function for all of it, and it does
 * the things a person cannot do for themselves:
 *
 *   - makes sure a wallet is actually connected, without asking twice
 *   - makes sure it is on Base, and offers to switch rather than failing
 *   - checks the balance covers the amount AND leaves something for the fee,
 *     because a wallet emptied to the last wei cannot pay for its own
 *     transaction and the purchase dies having cost the fee anyway
 *   - turns a chain error into a sentence a person can act on
 *
 * Nothing here holds anyone's money and nothing here signs on their behalf.
 * The wallet asks, the person approves, and this only makes sure the ask is
 * one that can succeed.
 */

/** Enough left over to pay the network. Base fees are cents; this is generous. */
const FEE_HEADROOM_ETH = '0.00004';

export interface BuyCheck {
  ok: boolean;
  /** Said to the person before anything is signed. */
  warning?: string;
  /** Stops the purchase entirely. */
  problem?: string;
  balanceEth?: string;
}

export interface BuyOutcome {
  success: boolean;
  txHash?: string;
  /** Plain words. Always set when success is false. */
  message: string;
  /** True when the money definitely did not move. */
  nothingSpent: boolean;
  /** What Mo$ha should say if the person asks for help with this. */
  advice?: string;
}

/** The chain we are on. Base mainnet. */
const BASE_CHAIN_ID = 8453;

async function currentChainId(): Promise<number | null> {
  const provider = getWalletProvider();
  if (!provider) return null;
  try {
    const hex = (await provider.request({ method: 'eth_chainId' })) as string;
    return Number.parseInt(hex, 16);
  } catch {
    return null;
  }
}

/** Ask the wallet to move to Base. Returns true when it is there. */
export async function ensureBase(): Promise<boolean> {
  const id = await currentChainId();
  if (id === BASE_CHAIN_ID || id === null) return id === BASE_CHAIN_ID;
  const provider = getWalletProvider();
  if (!provider) return false;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
    return true;
  } catch {
    try {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x2105',
          chainName: 'Base',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://mainnet.base.org'],
          blockExplorerUrls: ['https://basescan.org'],
        }],
      });
      return true;
    } catch {
      return false;
    }
  }
}

/** What is in the wallet right now, in ETH. */
export async function walletBalanceEth(address: string): Promise<string | null> {
  try {
    const client = getPublicClient();
    const wei = await client.getBalance({ address: address as `0x${string}` });
    return formatEther(wei);
  } catch {
    return null;
  }
}

/**
 * Everything that has to be true before a person spends. Run this and show
 * what it says; do not spend when it says not to.
 */
export async function checkBeforeBuying(address: string, ethAmount: string): Promise<BuyCheck> {
  const balance = await walletBalanceEth(address);
  if (balance == null) {
    return { ok: true, warning: 'We could not read your balance just now. Your wallet will still show you the exact cost before you approve anything.' };
  }
  let need: bigint;
  try {
    need = parseEther(ethAmount) + parseEther(FEE_HEADROOM_ETH);
  } catch {
    return { ok: false, problem: 'That amount is not readable. Pick one of the amounts on screen.' };
  }
  const have = parseEther(balance);
  if (have < parseEther(ethAmount)) {
    return {
      ok: false,
      balanceEth: balance,
      problem: `Not enough in this wallet. It holds ${Number(balance).toFixed(5)} ETH and this costs ${ethAmount} ETH. Add funds, switch to another wallet on your account, or pick a smaller amount.`,
    };
  }
  if (have < need) {
    return {
      ok: false,
      balanceEth: balance,
      problem: `That would leave nothing for the network fee, so the purchase would fail and still cost you the fee. Keep about ${FEE_HEADROOM_ETH} ETH spare, or pick a smaller amount.`,
    };
  }
  return { ok: true, balanceEth: balance };
}

/** A chain error, said the way a person would say it. */
function explain(raw: string): { message: string; nothingSpent: boolean; advice: string } {
  const s = (raw || '').toLowerCase();
  if (/user rejected|user denied|rejected the request/.test(s)) {
    return { message: 'You cancelled it in your wallet. Nothing was spent.', nothingSpent: true, advice: 'They cancelled the purchase themselves. Nothing was spent. Offer to try again, no pressure.' };
  }
  if (/insufficient funds|exceeds balance/.test(s)) {
    return { message: 'Not enough in this wallet to cover the amount and the network fee. Nothing was spent.', nothingSpent: true, advice: 'Their wallet is short of the amount plus the fee. Suggest a smaller amount, adding funds, or switching to another wallet on their account.' };
  }
  if (/slippage|price impact|amount out|too little received/.test(s)) {
    return { message: 'The price moved while that was going through, so it stopped rather than paying more than you meant to. Nothing was spent.', nothingSpent: true, advice: 'The price moved mid-trade and the purchase stopped to protect them. Tell them that is the safety working, and to try again in a moment.' };
  }
  if (/nonce|replacement transaction underpriced|already known/.test(s)) {
    return { message: 'Your wallet has another transaction in flight. Let that one finish, then try again.', nothingSpent: true, advice: 'A previous transaction from their wallet is still pending. Tell them to wait for it to land, then try again.' };
  }
  if (/network|timeout|fetch|rpc|econn/.test(s)) {
    return { message: 'The line to Base dropped while that was going through. Check your wallet before trying again, in case it went out.', nothingSpent: false, advice: 'The network dropped mid-purchase, so it is not certain whether it went through. Tell them to check their wallet or Basescan for the transaction BEFORE buying again, so they do not pay twice.' };
  }
  if (/chain|wrong network|unsupported chain/.test(s)) {
    return { message: 'Your wallet is not on Base. Switch it to Base and try again.', nothingSpent: true, advice: 'Their wallet is on the wrong network. Everything here lives on Base; tell them to switch and try again.' };
  }
  return { message: raw || 'That did not go through.', nothingSpent: false, advice: 'The purchase failed and it is not certain whether anything moved. Tell them to check their wallet or Basescan before trying again, and to write to songchaindao@gmail.com if money left and nothing arrived.' };
}

/**
 * Buy a coin. Connects a wallet if there is not one, puts it on Base, checks
 * the balance, then spends. Whatever happens, the answer is a sentence.
 */
export async function buyAsset(params: {
  coinAddress: string;
  ethAmount: string;
  /** The wallet to pay from. Omitted means "connect one". */
  address?: string | null;
  /** Skip the balance check when the caller already ran it. */
  checked?: boolean;
}): Promise<BuyOutcome> {
  let address = params.address ?? null;
  if (!address) {
    address = await requestWalletConnection();
    if (!address) {
      return {
        success: false,
        message: 'No wallet connected, so nothing was spent.',
        nothingSpent: true,
        advice: 'They need a wallet on Base to buy. The wallet sheet opens the one already on their device and brings them back.',
      };
    }
  }

  const onBase = await ensureBase();
  if (!onBase) {
    return {
      success: false,
      message: 'Your wallet would not switch to Base, so nothing was spent. Switch it yourself and try again.',
      nothingSpent: true,
      advice: 'Their wallet refused to switch to Base. Tell them to change the network in the wallet itself, then try again.',
    };
  }

  if (!params.checked) {
    const check = await checkBeforeBuying(address, params.ethAmount);
    if (!check.ok) {
      return { success: false, message: check.problem ?? 'That would not go through.', nothingSpent: true, advice: check.problem };
    }
  }

  const res = await buyCoinWithEth({
    coinAddress: params.coinAddress as `0x${string}`,
    ethAmount: params.ethAmount,
    userAddress: address as `0x${string}`,
  });

  if (res.success) {
    // The wallet that paid is the one they used; remember it as such.
    try {
      await supabase.rpc('add_my_wallet' as never, { p_address: address, p_provider: 'other', p_label: null } as never);
    } catch {
      /* the purchase stands either way */
    }
    return { success: true, txHash: res.txHash, message: 'Done. It is yours.', nothingSpent: false };
  }

  const said = explain(res.error ?? '');
  return { success: false, message: said.message, nothingSpent: said.nothingSpent, advice: said.advice };
}
