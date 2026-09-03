/**
 * The SONGCHAINN coin launcher.
 *
 * One path for every coin this platform issues: the platform token, a battle
 * token, and every artist coin after that. Built on the Zora Coins SDK, which
 * is already a dependency of this app and already powers the 231 song coins.
 *
 * WHY THIS AND NOT CLANKER OR A CUSTOM CONTRACT
 * ---------------------------------------------
 * The payout address is an argument here. That is the whole reason. $IMAN was
 * launched down a path where the LP beneficiary was written once at initialize
 * and can never be changed, so its pool fees go to a third party forever. That
 * must never happen to a second artist. Here the artist's own address is passed
 * in, and `verify` reads it straight back off chain afterwards so nobody has to
 * take our word for it.
 *
 * SAFETY
 * ------
 * - Dry run by default. It will not send anything unless you pass --live.
 * - The key is read from LAUNCHER_PRIVATE_KEY in the environment and is never
 *   printed, never written to disk, and never committed.
 * - It prints the full plan and the cost estimate before it does anything.
 *
 * USAGE
 *   node scripts/launch-coin.mjs --config scripts/coins/ongchainn.json
 *   node scripts/launch-coin.mjs --config scripts/coins/ongchainn.json --live
 *   node scripts/launch-coin.mjs --verify 0xCoinAddress
 */
import fs from 'fs';
import { createPublicClient, createWalletClient, http, parseAbi, getAddress, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const publicClient = createPublicClient({ chain: base, transport: http(RPC) });

/**
 * Where SONGCHAINN's 20% platform referral is paid, on every coin launched
 * through here. The verified treasury.
 *
 * This is the path every future artist joins on. It is set once per coin at
 * creation and is permanent, so a coin launched without it can never be fixed
 * later. That is why the launcher hardcodes it rather than reading it from a
 * config file somebody could forget to fill in.
 */
const PLATFORM_REFERRER = '0x70d211C7ed27CFA73d6FdDAF43736159F19EA118';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const LIVE = args.includes('--live');
const CONFIG_PATH = flag('--config');
const VERIFY = flag('--verify');

/** Read the payout address back off chain. The only proof that matters. */
async function verifyCoin(address) {
  const addr = getAddress(address);
  console.log('\nVERIFYING ' + addr);
  console.log('='.repeat(66));

  const ABI = parseAbi([
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function payoutRecipient() view returns (address)',
    'function owner() view returns (address)',
  ]);
  for (const fn of ['name', 'symbol', 'totalSupply', 'payoutRecipient', 'owner']) {
    try {
      const v = await publicClient.readContract({ address: addr, abi: ABI, functionName: fn });
      console.log('  ' + fn.padEnd(18) + ': ' + v);
    } catch {
      console.log('  ' + fn.padEnd(18) + ': (not exposed)');
    }
  }
  console.log('\n  Check payoutRecipient above IS the artist. If it is not, stop and');
  console.log('  do not tell them they are live.');
}

async function main() {
  if (VERIFY) return verifyCoin(VERIFY);

  if (!CONFIG_PATH) {
    console.error('Pass --config <file.json>, or --verify <address>.');
    process.exit(1);
  }

  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  for (const required of ['name', 'symbol', 'payoutRecipient', 'uri']) {
    if (!cfg[required]) {
      console.error('Config is missing "' + required + '".');
      process.exit(1);
    }
  }
  const payout = getAddress(cfg.payoutRecipient);

  console.log('THE PLAN');
  console.log('='.repeat(66));
  console.log('  name            : ' + cfg.name);
  console.log('  symbol          : ' + cfg.symbol);
  console.log('  payoutRecipient : ' + payout);
  console.log('  metadata uri    : ' + cfg.uri);
  console.log('  chain           : Base mainnet (8453)');
  console.log('  platformReferrer: ' + PLATFORM_REFERRER + '  (SONGCHAINN treasury)');
  console.log('\n  PERMANENT, both of them. payoutRecipient and platformReferrer are');
  console.log('  written once at creation and can never be changed afterwards.');
  console.log('  Of Zora\'s 1% trading fee: the creator takes 50% and SONGCHAINN');
  console.log('  takes 20% as platform referrer. Those are separate slices, so the');
  console.log('  artist loses nothing by launching here.');
  console.log('  For an artist coin, payoutRecipient MUST be the artist. Check it now.');

  const gasPrice = await publicClient.getGasPrice();
  const estimate = 1_500_000n * gasPrice;
  console.log('\n  gas price       : ' + Number(gasPrice) / 1e9 + ' gwei');
  console.log('  rough cost      : ' + formatEther(estimate) + ' ETH');

  if (!LIVE) {
    console.log('\nDRY RUN. Nothing was sent.');
    console.log('Re-run with --live to actually deploy.');
    return;
  }

  const key = process.env.LAUNCHER_PRIVATE_KEY;
  if (!key) {
    console.error('\nLAUNCHER_PRIVATE_KEY is not set. Refusing to continue.');
    process.exit(1);
  }

  const account = privateKeyToAccount(key.startsWith('0x') ? key : '0x' + key);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('\n  launching from  : ' + account.address);
  console.log('  its balance     : ' + formatEther(balance) + ' ETH');
  if (balance < estimate) {
    console.error('  Not enough ETH to cover gas. Stopping.');
    process.exit(1);
  }

  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC) });
  const { createCoin } = await import('@zoralabs/coins-sdk');

  console.log('\n  Deploying...');
  const result = await createCoin({
    call: {
      creator: account.address,
      name: cfg.name,
      symbol: cfg.symbol,
      metadata: { type: 'RAW_URI', uri: cfg.uri },
      currency: cfg.currency ?? 'ETH',
      chainId: base.id,
      payoutRecipient: payout,
      /* THE 20%. Zora's 1% trading fee splits creator 50, PLATFORM REFERRER 20,
         LP 20, protocol 5, trade referrer 4, doppler 1. The platform referrer is
         set once, at creation, and can never be changed afterwards.
         Every coin the artists made before SONGCHAINN existed was created
         elsewhere, so that 20% went to a zero address on two of them, to IMan
         personally on three, and to a stranger on two. None of it came here.
         Passing it now is the entire difference between earning on this
         catalogue and not, and it costs the artist nothing: their 50% is a
         separate slice and is untouched by this. */
      platformReferrer: PLATFORM_REFERRER,
    },
    walletClient,
    publicClient,
  });

  console.log('\n  DEPLOYED');
  console.log('  address : ' + result.address);
  console.log('  tx      : ' + result.hash);

  await verifyCoin(result.address);
}

main().catch((e) => {
  console.error('\nFAILED: ' + (e?.shortMessage || e?.message || e));
  process.exit(1);
});
