// Mint one drop from the command line with the project's Zora signer.
//
// The app does this from the artist's own wallet in the browser (src/lib/nft.ts).
// This script is the same path run headless, for the first real drop and for
// proving gas, contract and verification end to end with a wallet we hold.
//
//   node scripts/drops/mint-drop.mjs --song 3 --world iman-afrikah --artist 3 \
//     --owner <auth user id> --payout 0x... --price 0.0005 --copies 100
//
// It refuses to send if the signer cannot cover the estimated gas plus margin.
// The row is set live by the service role only after the same checks
// nft-verify makes (owner() is the sender, token URI is this drop's metadata).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { create1155, getContractAddressFromReceipt, getTokenIdFromCreateReceipt } from "@zoralabs/protocol-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function env(name) {
  if (process.env[name]) return process.env[name];
  for (const f of [".env.local", ".env"]) {
    try {
      const m = fs.readFileSync(path.join(ROOT, f), "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
      if (m) return m[1].trim().replace(/^"|"$/g, "");
    } catch { /* next */ }
  }
  return "";
}

const SUPABASE_URL = env("VITE_SUPABASE_URL") || "https://wsjhbfmzbonxmxaaassu.supabase.co";
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const ORIGIN = "https://songchainn.xyz";
const TREASURY = "0x70d211C7ed27CFA73d6FdDAF43736159F19EA118";
const SIGNER_KEY_PATH = process.env.SIGNER_KEY_PATH || path.join(ROOT, "scripts/zora-mint/zora-signer-wallet.json");
const DRY = process.argv.includes("--dry-run");

const songId = arg("song", "3");
const worldSlug = arg("world", "iman-afrikah");
const artistId = arg("artist", "3");
const ownerId = arg("owner", "");
const payout = arg("payout", "");
const price = arg("price", "0.0005");
const copies = Number(arg("copies", "100"));
const title = arg("title", "");
const description = arg("description", "");
const worldName = arg("world-name", "IMan Afrikah");

if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
if (!ownerId || !/^0x[0-9a-fA-F]{40}$/.test(payout)) throw new Error("--owner and --payout are required");

async function rest(pathname, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------- the song
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/zora-mint/catalog.json"), "utf8"));
const song = (Array.isArray(catalog) ? catalog : catalog.songs ?? []).find((s) => String(s.id) === songId);
if (!song) throw new Error(`song ${songId} not in scripts/zora-mint/catalog.json`);
const dropTitle = title || song.title;
const imageUrl = song.coverImage || song.cover || song.image;
const audioUrl = song.audioUrl || song.audio;
if (!imageUrl) throw new Error("song has no cover image");
console.log(`Drop: "${dropTitle}" by ${song.artist ?? artistId} in ${worldSlug}, ${price} ETH x ${copies}`);

// -------------------------------------------------------------- the signer
const { privateKey, address: signerAddress } = JSON.parse(fs.readFileSync(SIGNER_KEY_PATH, "utf8"));
const account = privateKeyToAccount(privateKey);
if (account.address.toLowerCase() !== String(signerAddress).toLowerCase()) throw new Error("signer file address mismatch");
const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC) });
const balance = await publicClient.getBalance({ address: account.address });
console.log(`Signer ${account.address} balance ${formatEther(balance)} ETH`);

// ----------------------------------------------------------------- the row
const row = (await rest("/rest/v1/world_nfts", {
  method: "POST",
  body: JSON.stringify({
    world_slug: worldSlug,
    world_id: null,
    owner_id: ownerId,
    artist_id: artistId,
    kind: "song",
    title: dropTitle,
    description: description || `${dropTitle} by ${song.artist ?? "IMan Afrikah"}. The record, as a token on Base, made in ${worldName} World on SONGCHAINN.`,
    song_id: songId,
    image_url: imageUrl,
    media_url: audioUrl ?? null,
    media_kind: audioUrl ? "audio" : null,
    price_eth: Number(price),
    copies,
    per_wallet: null,
    sale_end: null,
    in_marketplace: true,
    key_ring: null,
    status: "minting",
    payout_wallet: payout,
  }),
}))[0];
console.log(`Row ${row.id} created (minting)`);
const metadataUri = `${ORIGIN}/nft/${row.id}/metadata.json`;

const fail = async (message) => {
  await rest(`/rest/v1/world_nfts?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed", status_note: message }) });
  throw new Error(message);
};

try {
  // --------------------------------------------------------------- prepare
  const MAX_UINT64 = 2n ** 64n - 1n;
  const prepared = await create1155({
    contract: { name: `IMan Afrikah World Drops`, uri: `${ORIGIN}/nft/world/${worldSlug}/contract.json` },
    account: account.address,
    token: {
      tokenMetadataURI: metadataUri,
      maxSupply: BigInt(copies),
      payoutRecipient: payout,
      createReferral: TREASURY,
      salesConfig: {
        type: "fixedPrice",
        pricePerToken: parseEther(price),
        saleStart: 0n,
        saleEnd: MAX_UINT64,
        maxTokensPerAddress: 0n,
      },
    },
    publicClient,
  });
  console.log(`Expected contract ${prepared.contractAddress}, token ${prepared.tokenId}, minter ${prepared.minter}, version ${prepared.contractVersion}`);

  const { request } = await publicClient.simulateContract({ ...prepared.parameters, account });
  const gas = await publicClient.estimateContractGas({ ...prepared.parameters, account });
  const gasPrice = await publicClient.getGasPrice();
  // Base charges an L1 data fee on top of L2 gas; allow 3x the L2 cost as margin.
  const l2Cost = gas * gasPrice;
  const budget = l2Cost * 3n + (prepared.parameters.value ?? 0n);
  console.log(`Gas ${gas} x ${Number(gasPrice) / 1e9} gwei = ${formatEther(l2Cost)} ETH L2, budget with L1 margin ${formatEther(budget)} ETH`);
  if (balance < budget) await fail(`Signer cannot cover the deploy: has ${formatEther(balance)} ETH, needs about ${formatEther(budget)} ETH`);
  if (DRY) {
    console.log("Dry run: not sending.");
    await rest(`/rest/v1/world_nfts?id=eq.${row.id}`, { method: "DELETE" });
    process.exit(0);
  }

  // ------------------------------------------------------------------ send
  const txHash = await walletClient.writeContract(request);
  console.log(`Sent ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
  if (receipt.status !== "success") await fail(`Transaction reverted: ${txHash}`);
  let tokenId, contractAddress;
  try { tokenId = getTokenIdFromCreateReceipt(receipt); } catch { tokenId = prepared.tokenId; }
  try { contractAddress = getContractAddressFromReceipt(receipt); } catch { contractAddress = prepared.contractAddress; }
  console.log(`Confirmed in block ${receipt.blockNumber}: contract ${contractAddress}, token ${tokenId}, gas used ${receipt.gasUsed}`);

  // ---------------------------------------------------------------- verify
  const abi = parseAbi([
    "function owner() view returns (address)",
    "function getTokenInfo(uint256 tokenId) view returns ((string uri, uint256 maxSupply, uint256 totalMinted))",
  ]);
  const owner = await publicClient.readContract({ address: contractAddress, abi, functionName: "owner" });
  if (owner.toLowerCase() !== account.address.toLowerCase()) await fail(`owner() is ${owner}, not the signer`);
  const info = await publicClient.readContract({ address: contractAddress, abi, functionName: "getTokenInfo", args: [tokenId] });
  if (info.uri !== metadataUri) await fail(`token URI is ${info.uri}, expected ${metadataUri}`);
  console.log(`Verified: owner ok, uri ok, maxSupply ${info.maxSupply}, minted ${info.totalMinted}`);

  const now = new Date().toISOString();
  await rest(`/rest/v1/world_nfts?id=eq.${row.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "live",
      status_note: null,
      contract_address: contractAddress,
      token_id: Number(tokenId),
      tx_hash: txHash,
      minter_address: prepared.minter,
      contract_version: prepared.contractVersion,
      metadata_uri: metadataUri,
      minted_at: now,
      verified_at: now,
    }),
  });
  const after = await publicClient.getBalance({ address: account.address });
  console.log(`LIVE. Drop ${row.id}. Cost ${formatEther(balance - after)} ETH. Basescan https://basescan.org/tx/${txHash}`);
  console.log(`Collect on Zora: https://zora.co/collect/base:${contractAddress}/${tokenId}`);
} catch (err) {
  if (!/Signer cannot cover|reverted|owner\(\) is|token URI is/.test(String(err?.message))) {
    await rest(`/rest/v1/world_nfts?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed", status_note: String(err?.message ?? err).slice(0, 300) }) }).catch(() => undefined);
  }
  throw err;
}
