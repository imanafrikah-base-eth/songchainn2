/**
 * Second pass on the SONGCHAINN estate: what these contracts actually ARE,
 * what functions they expose, and who can call them.
 *
 * Read-only. Signs nothing, sends nothing, needs no key.
 */
import { createPublicClient, http, parseAbi, getAddress, formatUnits, keccak256, toHex } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

const PROTOCOL = getAddress('0x50d9AeA41a57B84726624A695ba843e669be6a49');
const REGISTRY = getAddress('0x39e8317fEEBE3129f3d876c1F6D35271849797F9');
const HOLDER = getAddress('0xF73485A61856Ab07Ad57152151db3ab99dF9a8Ea');
const TREASURY = getAddress('0x70d211C7ed27CFA73d6FdDAF43736159F19EA118');

/**
 * Every function we might plausibly find, with its 4-byte selector. Scanning the
 * deployed bytecode for these tells us what the contract can actually do, which
 * is the only reliable answer when there is no verified source to read.
 */
const CANDIDATES = [
  'totalSupply()', 'balanceOf(address)', 'transfer(address,uint256)',
  'approve(address,uint256)', 'allowance(address,address)',
  'transferFrom(address,address,uint256)', 'mint(address,uint256)',
  'burn(uint256)', 'owner()', 'transferOwnership(address)',
  'renounceOwnership()', 'paused()', 'pause()', 'unpause()',
  'name()', 'symbol()', 'decimals()',
  'creditOf(address)', 'credits(address)', 'balanceOfCredit(address)',
  'register(string)', 'registerSong(string)', 'songOf(uint256)',
  'tokenURI(uint256)', 'ownerOf(uint256)', 'supportsInterface(bytes4)',
  'implementation()', 'admin()', 'upgradeTo(address)',
  'withdraw()', 'withdrawAll()', 'sweep(address)',
  'setTreasury(address)', 'treasury()',
];

function selector(sig) {
  return keccak256(toHex(sig)).slice(0, 10);
}

async function functionsIn(address, label) {
  const code = await client.getBytecode({ address });
  console.log('\n' + '='.repeat(72));
  console.log(label + '  ' + address);
  console.log('='.repeat(72));
  if (!code || code === '0x') {
    console.log('  no code');
    return;
  }
  console.log('  size: ' + ((code.length - 2) / 2) + ' bytes');

  // A very small contract is almost always a proxy or a stub. Print it whole so
  // the shape is visible rather than guessed at.
  if ((code.length - 2) / 2 <= 64) {
    console.log('  RAW BYTECODE: ' + code);
  }

  const found = [];
  for (const sig of CANDIDATES) {
    const sel = selector(sig).slice(2);
    if (code.toLowerCase().includes(sel)) found.push(sig);
  }
  console.log('  selectors present in bytecode:');
  if (found.length === 0) console.log('    (none of the ones we looked for)');
  for (const f of found) console.log('    - ' + f);

  // EIP-1967 proxy slots. If either is set, the real logic lives elsewhere.
  const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
  const [impl, admin] = await Promise.all([
    client.getStorageAt({ address, slot: IMPL_SLOT }),
    client.getStorageAt({ address, slot: ADMIN_SLOT }),
  ]);
  const asAddr = (slot) =>
    slot && slot !== '0x' + '0'.repeat(64) ? '0x' + slot.slice(26) : null;
  if (asAddr(impl)) console.log('  EIP-1967 implementation: ' + asAddr(impl));
  if (asAddr(admin)) console.log('  EIP-1967 admin: ' + asAddr(admin));
}

async function main() {
  await functionsIn(PROTOCOL, 'PROTOCOL TOKEN, SongChainn Protocol Credit');
  await functionsIn(REGISTRY, 'SONG REGISTRY');
  await functionsIn(HOLDER, 'THE "HOLDER" ADDRESS');

  console.log('\n' + '='.repeat(72));
  console.log('WHO CONTROLS WHAT');
  console.log('='.repeat(72));

  const OWNABLE = parseAbi(['function owner() view returns (address)']);
  for (const [label, addr] of [['protocol token', PROTOCOL], ['registry', REGISTRY]]) {
    try {
      const o = await client.readContract({ address: addr, abi: OWNABLE, functionName: 'owner' });
      const oCode = await client.getBytecode({ address: o });
      const kind = !oCode || oCode === '0x' ? 'a WALLET you can sign from' : 'a CONTRACT';
      console.log('  ' + label + ' owner: ' + o + '  (' + kind + ')');
    } catch {
      console.log('  ' + label + ' owner: no owner() function');
    }
  }

  const tBal = await client.getBalance({ address: TREASURY });
  console.log('\n  treasury ' + TREASURY);
  console.log('    ETH: ' + formatUnits(tBal, 18));
  const tNonce = await client.getTransactionCount({ address: TREASURY });
  console.log('    transactions ever sent from it: ' + tNonce);
  console.log(
    tNonce === 0
      ? '    NEVER USED. Nothing has ever been sent from this address.'
      : '    It has been used, so somebody holds its key.',
  );
}

main().catch((e) => {
  console.error('failed: ' + (e?.shortMessage || e?.message || e));
  process.exit(1);
});
