// Launch an artist token (Clanker v4) + Empire treasury on Base via Empire Builder.
//
// Pipeline (Empire Builder skill, Workflow 1):
//   1. POST /api/get-token-config   -> server-built Clanker tokenConfig
//   2. Clanker SDK deploy on Base   -> token address + tx hash (wallet signs, pays gas)
//   3. POST /api/deploy-empire      -> SmartVault treasuries + empire row
//   4. GET  /api/empires/<token>    -> empire_address for records
//
// Usage:
//   node launch-empire.mjs <config.json>            # dry run: fetches tokenConfig, deploys nothing
//   node launch-empire.mjs <config.json> --yes      # LIVE: deploys on Base mainnet (real funds)
//
// Env (never hardcode):
//   EMPIRE_API_KEY          Empire Builder API key
//   DEPLOYER_PRIVATE_KEY    0x-prefixed key of the artist's deployer wallet (owns token + vault)
//   BASE_RPC_URL            optional; defaults to https://mainnet.base.org

import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { Clanker } from "clanker-sdk/v4";

const API_BASE = "https://www.empirebuilder.world";
const CHAIN_ID = 8453;

function fail(msg) {
  console.error(`\n[launch-empire] ERROR: ${msg}`);
  process.exit(1);
}

const configPath = process.argv[2];
const isLive = process.argv.includes("--yes");
if (!configPath) fail("usage: node launch-empire.mjs <config.json> [--yes]");

const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const apiKey = process.env.EMPIRE_API_KEY?.trim();
if (!apiKey) fail("EMPIRE_API_KEY env var is required");

for (const [label, value] of [
  ["token.name", cfg.token?.name],
  ["token.symbol", cfg.token?.symbol],
  ["token.imageUrl", cfg.token?.imageUrl],
]) {
  if (!value || String(value).includes("PLACEHOLDER")) fail(`config ${label} is missing or still a placeholder`);
}

const pk = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) fail("DEPLOYER_PRIVATE_KEY env var (0x + 64 hex) is required");
const account = privateKeyToAccount(pk);
console.log(`[launch-empire] deployer wallet: ${account.address}`);

async function api(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    throw new Error(`${path} -> HTTP ${res.status}: ${body?.error || JSON.stringify(body)}`);
  }
  return body;
}

// ---- 1. Server-built Clanker token config -------------------------------
const tokenConfigRequest = {
  name: cfg.token.name,
  symbol: cfg.token.symbol,
  imageUrl: cfg.token.imageUrl,
  creatorAddress: account.address,
  tokenDescription: cfg.token.tokenDescription || "",
  socialTwitter: cfg.token.socialTwitter || "",
  socialFarcaster: cfg.token.socialFarcaster || "",
  socialWebsite: cfg.token.socialWebsite || "",
  socialTelegram: cfg.token.socialTelegram || "",
  ...cfg.economics,
  enableAirdrop: Boolean(cfg.airdrop?.enabled),
  ...(cfg.airdrop?.enabled
    ? {
        airdropEntries: cfg.airdrop.entries,
        airdropLockupDays: cfg.airdrop.lockupDays,
        airdropVestingDays: cfg.airdrop.vestingDays,
      }
    : {}),
};

console.log("[launch-empire] requesting tokenConfig from Empire Builder...");
const { tokenConfig, airdropTree } = await api("/api/get-token-config", {
  method: "POST",
  body: JSON.stringify(tokenConfigRequest),
});
if (!tokenConfig) fail("get-token-config returned no tokenConfig");
console.log(`[launch-empire] tokenConfig ready: ${tokenConfig.name} (${tokenConfig.symbol})`);

if (!isLive) {
  console.log("\n--- DRY RUN (no --yes flag) ---");
  console.log(JSON.stringify(tokenConfig, null, 2));
  console.log("\nReview the config above with the artist, then re-run with --yes to deploy on Base mainnet.");
  process.exit(0);
}

// ---- 2. Deploy on Base via Clanker SDK ----------------------------------
const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
const clanker = new Clanker({ wallet, publicClient });

console.log("[launch-empire] deploying token on Base mainnet (this spends real ETH)...");
const deployResult = await clanker.deploy(tokenConfig);
if (deployResult?.error) fail(`Clanker deploy failed: ${deployResult.error?.message || deployResult.error}`);

const txHash = deployResult?.txHash || deployResult?.hash;
if (!txHash) fail(`Clanker deploy returned no tx hash: ${JSON.stringify(deployResult)}`);
console.log(`[launch-empire] deploy tx: ${txHash}`);

let tokenAddress = deployResult?.address || null;
if (deployResult?.waitForTransaction) {
  const waited = await deployResult.waitForTransaction();
  tokenAddress = waited?.address || tokenAddress;
} else {
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}
if (!tokenAddress) fail("could not resolve deployed token address from the Clanker SDK result");
console.log(`[launch-empire] token deployed: ${tokenAddress}`);

// ---- 3. Register the Empire (SmartVault treasuries) ---------------------
console.log("[launch-empire] registering Empire...");
const empireRes = await api("/api/deploy-empire", {
  method: "POST",
  body: JSON.stringify({
    baseToken: tokenAddress,
    name: cfg.empire?.displayName || `${cfg.token.name} Empire`,
    owner: account.address,
    txHash,
    chainId: CHAIN_ID,
    clankerVersion: "clanker_v4",
    tokenInfo: {
      symbol: cfg.token.symbol,
      name: cfg.token.name,
      logoURI: cfg.token.imageUrl,
    },
    empireMetadata: cfg.empire?.metadata || {},
  }),
});
console.log(`[launch-empire] empire registered: ${empireRes?.empireAddress || empireRes?.treasuryAddress || "(see response)"}`);

// Airdrop metadata must be stored so recipients can claim (skill: store-airdrop).
if (cfg.airdrop?.enabled && Array.isArray(cfg.airdrop.entries) && cfg.airdrop.entries.length > 0) {
  console.log("[launch-empire] storing airdrop metadata...");
  await api("/api/store-airdrop", {
    method: "POST",
    body: JSON.stringify({
      tokenAddress,
      tokenName: cfg.token.name,
      tokenSymbol: cfg.token.symbol,
      creatorAddress: account.address,
      airdropEntries: cfg.airdrop.entries,
      lockupDays: cfg.airdrop.lockupDays,
      vestingDays: cfg.airdrop.vestingDays,
      deploymentTxHash: txHash,
      airdropTree,
    }),
  });
  console.log("[launch-empire] airdrop stored");
}

// ---- 4. Read back the empire row ----------------------------------------
const empire = await api(`/api/empires/${tokenAddress}`);
const vault = empire?.empire_address || empire?.empireAddress || empireRes?.empireAddress || "(unknown)";

console.log("\n================ LAUNCH COMPLETE ================");
console.log(`Token (Empire ID):   ${tokenAddress}`);
console.log(`SmartVault treasury: ${vault}`);
console.log(`Deploy tx:           ${txHash}`);
console.log("\nNext steps to open the World:");
console.log(`  supabase secrets set ${cfg.worldGate?.supabaseSecretName || "IMAN_TOKEN_ADDRESS"}=${tokenAddress}`);
console.log(`  supabase secrets set ${cfg.worldGate?.decimalsSecretName || "IMAN_TOKEN_DECIMALS"}=18`);
console.log("  supabase functions deploy world-gate   (secrets are read at runtime; redeploy only if code changed)");
console.log("=================================================\n");
