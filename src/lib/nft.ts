// Drops on Base: the chain side of an artist turning a song, artwork or any
// content into an NFT from inside their world.
//
// WHY ZORA 1155. Every drop is a token on a Zora Creator 1155 contract that
// the artist's own wallet deploys through Zora's factory. That is the cheapest
// honest way to do this: the contracts are audited and already on Base, the
// artist pays a few cents of gas to deploy, the collector pays the price the
// artist set plus Zora's protocol mint fee, and the price is paid to the
// artist's payout wallet by the contract itself. SONGCHAINN never holds funds,
// never signs, and runs no contract of its own. The app is named as the
// referral on every create and mint, so Zora's protocol rewards send the
// platform a slice of the mint fee: a reward for bringing the mint, not a
// charge on the artist or the collector.
//
// NOTHING HERE TRUSTS THE SUBGRAPH. The SDK's default readers ask Zora's
// indexer, which can lag or be rate limited. Everything below reads the chain
// directly through viem, and a collector's mint is rebuilt from the sale terms
// the app recorded when the drop was made, so a Collect button works the
// moment the transaction confirms.
//
// One contract per world, per wallet. The first drop deploys it; the ones after
// add a token to it, as long as the connected wallet still owns that contract.

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbi,
  parseEther,
  formatEther,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { base } from 'viem/chains';
import {
  create1155,
  createNew1155Token,
  getContractAddressFromReceipt,
  getTokenIdFromCreateReceipt,
  makeOnchainPrepareMintFromCreate,
  type IContractGetter,
} from '@zoralabs/protocol-sdk';
import { getWalletProvider, BASE_CHAIN_ID } from '@/lib/baseWallet';
import { TREASURY_ADDRESS } from '@/lib/onchain';

/** The platform's referral address for Zora protocol rewards. */
export const PLATFORM_REFERRAL: Address = TREASURY_ADDRESS;

export const NFT_CANONICAL_ORIGIN = 'https://songchainn.xyz';

/** Where a drop's token metadata lives. Served by api/nft-meta.ts. */
export function tokenMetadataUrl(dropId: string): string {
  return `${NFT_CANONICAL_ORIGIN}/nft/${dropId}/metadata.json`;
}

/** Contract-level metadata for a world's collection. Same API route. */
export function contractMetadataUrl(worldSlug: string): string {
  return `${NFT_CANONICAL_ORIGIN}/nft/world/${encodeURIComponent(worldSlug)}/contract.json`;
}

export function zoraCollectUrl(contract: string, tokenId: number | bigint): string {
  return `https://zora.co/collect/base:${contract}/${tokenId.toString()}`;
}

export function basescanTokenUrl(contract: string, tokenId?: number | bigint | null): string {
  return tokenId == null
    ? `https://basescan.org/address/${contract}`
    : `https://basescan.org/token/${contract}?a=${tokenId.toString()}`;
}

const RPC_URL = (import.meta.env.VITE_BASE_RPC_URL as string | undefined) || 'https://mainnet.base.org';

let publicClient: PublicClient | null = null;

export function getPublicClient(): PublicClient {
  if (!publicClient) {
    // The same strict:false quirk as `read` below: the created client's
    // account slot is typed as a json-rpc placeholder, not undefined.
    publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) }) as unknown as PublicClient;
  }
  return publicClient;
}

/**
 * A wallet client over whatever injected provider the person picked in
 * ConnectWalletModal. Switches to Base first; a drop on the wrong chain would
 * be a real contract in the wrong place.
 */
export async function getWalletClient(account: Address) {
  const provider = getWalletProvider();
  if (!provider) throw new Error('No wallet found. Install a wallet, or open this in a wallet browser.');
  const client = createWalletClient({
    account,
    chain: base,
    // The provider type in baseWallet is our own minimal EIP-1193 shape.
    transport: custom(provider as unknown as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }),
  });
  try {
    const current = await client.getChainId();
    if (current !== BASE_CHAIN_ID) await client.switchChain({ id: base.id });
  } catch {
    // Some wallets refuse switchChain but are already on Base; the
    // transaction itself will fail loudly if not.
  }
  return client;
}

/* --------------------------------------------------------------- reads --- */

const creator1155Abi = parseAbi([
  'function nextTokenId() view returns (uint256)',
  'function contractVersion() view returns (string)',
  'function mintFee() view returns (uint256)',
  'function name() view returns (string)',
  'function owner() view returns (address)',
  'function getTokenInfo(uint256 tokenId) view returns ((string uri, uint256 maxSupply, uint256 totalMinted))',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
]);

/**
 * viem's readContract parameter type does not resolve under this project's
 * strict:false tsconfig (it demands an authorizationList that reads never
 * take). The call is right; the helper carries the one cast.
 */
async function read<T>(params: {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
}): Promise<T> {
  const client = getPublicClient();
  return (await client.readContract({ abi: creator1155Abi, ...params } as never)) as T;
}

export interface OnchainTokenInfo {
  uri: string;
  maxSupply: bigint;
  totalMinted: bigint;
}

export async function readTokenInfo(contract: Address, tokenId: bigint): Promise<OnchainTokenInfo> {
  const info = await read<OnchainTokenInfo>({ address: contract, functionName: 'getTokenInfo', args: [tokenId] });
  return { uri: info.uri, maxSupply: info.maxSupply, totalMinted: info.totalMinted };
}

export async function readContractOwner(contract: Address): Promise<Address> {
  return read<Address>({ address: contract, functionName: 'owner' });
}

export async function readBalance(contract: Address, tokenId: bigint, wallet: Address): Promise<bigint> {
  return read<bigint>({ address: contract, functionName: 'balanceOf', args: [wallet, tokenId] });
}

/** Chain-only stand-in for the SDK's subgraph contract reader. */
function onchainContractGetter(): IContractGetter {
  return {
    async getContractInfo({ contractAddress }: { contractAddress: Address; retries?: number }) {
      const [nextTokenId, contractVersion, mintFee, name] = await Promise.all([
        read<bigint>({ address: contractAddress, functionName: 'nextTokenId' }),
        read<string>({ address: contractAddress, functionName: 'contractVersion' }),
        read<bigint>({ address: contractAddress, functionName: 'mintFee' }),
        read<string>({ address: contractAddress, functionName: 'name' }),
      ]);
      return { nextTokenId, contractVersion, mintFee, name };
    },
  } as IContractGetter;
}

/* -------------------------------------------------------------- create --- */

export interface DropTerms {
  /** Price per copy in ETH, as the artist typed it ("0.002"). "0" is free. */
  priceEth: string;
  /** null = open edition. */
  copies: number | null;
  /** null = no per-wallet limit. */
  perWallet: number | null;
  /** null = never closes. */
  saleEnd: Date | null;
}

export interface CreateDropInput {
  account: Address;
  payout: Address;
  worldSlug: string;
  collectionName: string;
  dropId: string;
  terms: DropTerms;
  /** Reuse this collection if the connected wallet still owns it. */
  existingContract?: Address | null;
  onStage?: (stage: string) => void;
}

export interface CreateDropResult {
  contractAddress: Address;
  tokenId: bigint;
  txHash: Hex;
  minter: Address;
  contractVersion: string;
}

const MAX_UINT64 = 2n ** 64n - 1n;

function salesConfigFor(terms: DropTerms) {
  return {
    type: 'fixedPrice' as const,
    pricePerToken: parseEther(terms.priceEth || '0'),
    saleStart: 0n,
    saleEnd: terms.saleEnd ? BigInt(Math.floor(terms.saleEnd.getTime() / 1000)) : MAX_UINT64,
    maxTokensPerAddress: terms.perWallet ? BigInt(terms.perWallet) : 0n,
  };
}

/**
 * Deploy (or extend) the world's collection and create the token, signed by
 * the artist's wallet. Resolves once the transaction is confirmed on Base.
 */
export async function createDropOnChain(input: CreateDropInput): Promise<CreateDropResult> {
  const { account, payout, terms, onStage } = input;
  const client = getPublicClient();
  const wallet = await getWalletClient(account);

  const token = {
    tokenMetadataURI: tokenMetadataUrl(input.dropId),
    maxSupply: terms.copies ? BigInt(terms.copies) : undefined,
    payoutRecipient: payout,
    createReferral: PLATFORM_REFERRAL,
    salesConfig: salesConfigFor(terms),
  };

  let reuse: Address | null = null;
  if (input.existingContract) {
    try {
      const owner = await readContractOwner(input.existingContract);
      if (owner.toLowerCase() === account.toLowerCase()) reuse = input.existingContract;
    } catch {
      reuse = null;
    }
  }

  onStage?.(reuse ? 'Adding the token to your collection' : 'Deploying your collection on Base');

  let parameters;
  let minter: Address;
  let contractVersion: string;
  let expectedContract: Address | null = null;

  if (reuse) {
    const prepared = await createNew1155Token({
      contractAddress: reuse,
      account,
      token,
      chainId: base.id,
      contractGetter: onchainContractGetter(),
    });
    parameters = prepared.parameters;
    minter = prepared.minter;
    contractVersion = prepared.contractVersion;
    expectedContract = reuse;
  } else {
    const prepared = await create1155({
      contract: { name: input.collectionName, uri: contractMetadataUrl(input.worldSlug) },
      account,
      token,
      publicClient: client,
    });
    parameters = prepared.parameters;
    minter = prepared.minter;
    contractVersion = prepared.contractVersion;
    expectedContract = prepared.contractAddress;
  }

  onStage?.('Confirm in your wallet');
  const { request } = await client.simulateContract({ ...parameters, account });
  const txHash = await wallet.writeContract(request);

  onStage?.('Waiting for Base to confirm');
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
  if (receipt.status !== 'success') throw new Error('The transaction did not go through');

  let tokenId: bigint;
  let contractAddress: Address;
  try {
    tokenId = getTokenIdFromCreateReceipt(receipt);
  } catch {
    // Older factory versions log differently; fall back to the token that
    // must have been created: nextTokenId - 1 on the contract we expected.
    const next = await read<bigint>({ address: expectedContract as Address, functionName: 'nextTokenId' });
    tokenId = next - 1n;
  }
  try {
    contractAddress = reuse ?? getContractAddressFromReceipt(receipt);
  } catch {
    contractAddress = expectedContract as Address;
  }

  return { contractAddress, tokenId, txHash, minter, contractVersion };
}

/* ------------------------------------------------------------- collect --- */

export interface CollectInput {
  account: Address;
  contract: Address;
  tokenId: bigint;
  minter: Address;
  contractVersion: string;
  terms: DropTerms;
  quantity: number;
  comment?: string;
  onStage?: (stage: string) => void;
}

export interface CollectQuote {
  /** Price the artist gets, for the quantity. */
  purchaseWei: bigint;
  /** Zora's protocol fee, for the quantity. */
  feeWei: bigint;
  totalWei: bigint;
}

async function prepareCollect(input: CollectInput) {
  const prepareMint = makeOnchainPrepareMintFromCreate({
    contractAddress: input.contract,
    tokenId: input.tokenId,
    result: salesConfigFor(input.terms),
    minter: input.minter,
    contractVersion: input.contractVersion,
    chainId: base.id,
    getContractMintFee: () => read<bigint>({ address: input.contract, functionName: 'mintFee' }),
  });
  return prepareMint({
    minterAccount: input.account,
    quantityToMint: input.quantity,
    mintReferral: PLATFORM_REFERRAL,
    mintComment: input.comment,
  });
}

/** What a collect will cost, before the wallet is opened. */
export async function quoteCollect(input: CollectInput): Promise<CollectQuote> {
  const { costs } = await prepareCollect(input);
  return { purchaseWei: costs.totalPurchaseCost, feeWei: costs.mintFee, totalWei: costs.totalCostEth };
}

/** Mint copies to the connected wallet. Resolves once confirmed. */
export async function collectOnChain(input: CollectInput): Promise<{ txHash: Hex }> {
  const client = getPublicClient();
  const wallet = await getWalletClient(input.account);
  const { parameters } = await prepareCollect(input);
  input.onStage?.('Confirm in your wallet');
  const { request } = await client.simulateContract({ ...parameters, account: input.account });
  const txHash = await wallet.writeContract(request);
  input.onStage?.('Waiting for Base to confirm');
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
  if (receipt.status !== 'success') throw new Error('The transaction did not go through');
  return { txHash };
}

export function formatEth(wei: bigint, maxDecimals = 5): string {
  const s = formatEther(wei);
  const [whole, frac = ''] = s.split('.');
  const trimmed = frac.slice(0, maxDecimals).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/** Turns a user-typed ETH price into something the chain and the DB accept. */
export function normalisePrice(input: string): string | null {
  const v = input.trim();
  if (v === '') return '0';
  if (!/^\d*(\.\d{0,8})?$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return v.startsWith('.') ? `0${v}` : v;
}
