/**
 * Read the SONGCHAINN on-chain estate straight off Base and report what each
 * contract actually is, rather than what anybody remembers it being.
 *
 * Read-only. It signs nothing, sends nothing and needs no key.
 *
 *   node scripts/inspect-songchainn-tokens.mjs
 */
import { createPublicClient, http, parseAbi, formatUnits, getAddress } from 'viem';
import { base } from 'viem/chains';

const RPC_URL = 'https://mainnet.base.org';
const client = createPublicClient({ chain: base, transport: http(RPC_URL) });

const TARGETS = {
  treasury: '0x70d211C7ed27CFA73d6FdDAF43736159F19EA118',
  protocolToken: '0x50d9AeA41a57B84726624A695ba843e669be6a49',
  registryToken: '0x39e8317fEEBE3129f3d876c1F6D35271849797F9',
  registryHolder: '0xF73485A61856Ab07Ad57152151db3ab99dF9a8Ea',
};

const ERC20 = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
]);

async function tryRead(address, functionName, args = []) {
  try {
    return await client.readContract({ address, abi: ERC20, functionName, args });
  } catch {
    return null;
  }
}

/**
 * Look for the fingerprints of a non-transferable (soulbound) token in the
 * deployed bytecode. This is a strong hint, not proof: the only proof is a
 * simulated transfer, which is done separately below.
 */
function scanBytecode(code) {
  const hints = [];
  const lower = code.toLowerCase();
  // Common revert strings, hex-encoded, that soulbound tokens ship with.
  const needles = {
    'non-transferable': Buffer.from('non-transferable').toString('hex'),
    'nontransferable': Buffer.from('nontransferable').toString('hex'),
    'soulbound': Buffer.from('soulbound').toString('hex'),
    'transfer disabled': Buffer.from('transfer disabled').toString('hex'),
    'not transferable': Buffer.from('not transferable').toString('hex'),
  };
  for (const [label, hex] of Object.entries(needles)) {
    if (hex && lower.includes(hex)) hints.push(label);
  }
  return hints;
}

async function describe(label, address) {
  const addr = getAddress(address);
  console.log('\n' + '='.repeat(70));
  console.log(label + '  ' + addr);
  console.log('='.repeat(70));

  const code = await client.getBytecode({ address: addr });
  if (!code || code === '0x') {
    const bal = await client.getBalance({ address: addr });
    console.log('  TYPE       : wallet (EOA), no contract code');
    console.log('  ETH balance: ' + formatUnits(bal, 18) + ' ETH');
    return { isContract: false };
  }

  console.log('  TYPE       : contract, ' + ((code.length - 2) / 2) + ' bytes');

  const [name, symbol, decimals, supply, owner, paused] = await Promise.all([
    tryRead(addr, 'name'),
    tryRead(addr, 'symbol'),
    tryRead(addr, 'decimals'),
    tryRead(addr, 'totalSupply'),
    tryRead(addr, 'owner'),
    tryRead(addr, 'paused'),
  ]);

  console.log('  name       : ' + (name ?? '(not an ERC20 name)'));
  console.log('  symbol     : ' + (symbol ?? '(none)'));
  console.log('  decimals   : ' + (decimals ?? '(none)'));
  if (supply != null && decimals != null) {
    console.log('  totalSupply: ' + formatUnits(supply, decimals) + ' ' + (symbol ?? ''));
  }
  console.log('  owner()    : ' + (owner ?? '(no owner function)'));
  if (paused != null) console.log('  paused()   : ' + paused);

  const hints = scanBytecode(code);
  if (hints.length) {
    console.log('  BYTECODE   : contains ' + hints.map((h) => JSON.stringify(h)).join(', '));
  }

  return { isContract: true, decimals, symbol, owner };
}

/**
 * The decisive test. Simulate a transfer from an address that actually holds a
 * balance. If the contract refuses, the token cannot be used to pay anybody,
 * whatever its name says.
 */
async function testTransferability(tokenAddr, holderAddr, decimals, symbol) {
  console.log('\n' + '-'.repeat(70));
  console.log('TRANSFERABILITY TEST  ' + (symbol ?? tokenAddr));
  console.log('-'.repeat(70));

  const token = getAddress(tokenAddr);
  const holder = getAddress(holderAddr);

  const bal = await tryRead(token, 'balanceOf', [holder]);
  if (bal == null) {
    console.log('  balanceOf reverted, this is not a standard ERC20.');
    return;
  }
  console.log('  holder balance: ' + formatUnits(bal, decimals ?? 18) + ' ' + (symbol ?? ''));

  if (bal === 0n) {
    console.log('  Holder has none, so a transfer cannot be simulated from here.');
    return;
  }

  // Simulate sending 1 unit to a burn-ish address. Nothing is sent: simulation
  // runs against a forked state and never leaves this machine.
  const TRANSFER = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
  try {
    await client.simulateContract({
      address: token,
      abi: TRANSFER,
      functionName: 'transfer',
      args: ['0x000000000000000000000000000000000000dEaD', 1n],
      account: holder,
    });
    console.log('  RESULT: TRANSFERABLE. A transfer from the holder simulates fine.');
  } catch (err) {
    const msg = String(err?.shortMessage || err?.message || err).split('\n')[0];
    console.log('  RESULT: NOT TRANSFERABLE. The transfer reverts.');
    console.log('  reason: ' + msg);
  }
}

(async () => {
  console.log('Reading the SONGCHAINN estate from Base mainnet, read only.');

  await describe('TREASURY WALLET', TARGETS.treasury);
  const protocol = await describe('PROTOCOL TOKEN ($ONGCHAINN)', TARGETS.protocolToken);
  const registry = await describe('SONG REGISTRY TOKEN', TARGETS.registryToken);
  await describe('REGISTRY HOLDER', TARGETS.registryHolder);

  if (protocol.isContract) {
    await testTransferability(
      TARGETS.protocolToken,
      TARGETS.registryHolder,
      protocol.decimals,
      protocol.symbol,
    );
  }
  if (registry.isContract) {
    await testTransferability(
      TARGETS.registryToken,
      TARGETS.registryHolder,
      registry.decimals,
      registry.symbol,
    );
  }

  console.log('\nDone. Nothing was signed or sent.');
})();
