/**
 * Third pass: settle two questions.
 *   1. What is 0xF734...a8Ea really, and how does Ernest get into it?
 *   2. Does the protocol token actually work, or do its functions revert?
 *
 * Read-only.
 */
import { createPublicClient, http, parseAbi, getAddress, formatUnits } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

const PROTOCOL = getAddress('0x50d9AeA41a57B84726624A695ba843e669be6a49');
const REGISTRY = getAddress('0x39e8317fEEBE3129f3d876c1F6D35271849797F9');
const HOLDER = getAddress('0xF73485A61856Ab07Ad57152151db3ab99dF9a8Ea');

console.log('QUESTION 1: what is the owner address?');
console.log('='.repeat(72));

const code = await client.getBytecode({ address: HOLDER });
console.log('  bytecode: ' + code);

if (code?.toLowerCase().startsWith('0xef0100')) {
  const delegate = getAddress('0x' + code.slice(8));
  console.log('\n  This is an EIP-7702 DELEGATION DESIGNATOR.');
  console.log('  0xef0100 is the marker the protocol reserves for exactly this.');
  console.log('\n  MEANING: ' + HOLDER);
  console.log('  is an ORDINARY WALLET with a private key, which has been upgraded');
  console.log('  into a smart account. It is not a contract somebody deployed and');
  console.log('  lost the keys to. Whoever holds the seed phrase controls it.');
  console.log('\n  delegated to: ' + delegate);

  const dCode = await client.getBytecode({ address: delegate });
  console.log('  delegate size: ' + (dCode ? (dCode.length - 2) / 2 : 0) + ' bytes');

  const nonce = await client.getTransactionCount({ address: HOLDER });
  const bal = await client.getBalance({ address: HOLDER });
  console.log('  transactions sent: ' + nonce);
  console.log('  ETH balance: ' + formatUnits(bal, 18));
}

console.log('\n\nQUESTION 2: does the protocol token work?');
console.log('='.repeat(72));

const ABI = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

for (const [label, fn, args] of [
  ['name()', 'name', []],
  ['symbol()', 'symbol', []],
  ['decimals()', 'decimals', []],
  ['totalSupply()', 'totalSupply', []],
  ['balanceOf(owner)', 'balanceOf', [HOLDER]],
]) {
  try {
    const r = await client.readContract({ address: PROTOCOL, abi: ABI, functionName: fn, args });
    console.log('  ' + label.padEnd(18) + ' -> ' + r);
  } catch (err) {
    const m = String(err?.shortMessage || err?.message || err).split('\n')[0];
    console.log('  ' + label.padEnd(18) + ' -> REVERTED: ' + m);
  }
}

console.log('\n  registry, same questions:');
for (const [label, fn, args] of [
  ['name()', 'name', []],
  ['totalSupply()', 'totalSupply', []],
  ['balanceOf(owner)', 'balanceOf', [HOLDER]],
]) {
  try {
    const r = await client.readContract({ address: REGISTRY, abi: ABI, functionName: fn, args });
    console.log('  ' + label.padEnd(18) + ' -> ' + r);
  } catch (err) {
    const m = String(err?.shortMessage || err?.message || err).split('\n')[0];
    console.log('  ' + label.padEnd(18) + ' -> REVERTED: ' + m);
  }
}

console.log('\n\nQUESTION 3: has either contract ever actually been used?');
console.log('='.repeat(72));
const latest = await client.getBlockNumber();
console.log('  current block: ' + latest);
for (const [label, addr] of [['protocol', PROTOCOL], ['registry', REGISTRY]]) {
  try {
    // Any event at all, across the last ~30 days of Base blocks.
    const logs = await client.getLogs({ address: addr, fromBlock: latest - 1_000_000n, toBlock: latest });
    console.log('  ' + label + ': ' + logs.length + ' events in the last 1,000,000 blocks');
  } catch (e) {
    console.log('  ' + label + ': could not scan logs (' + (e?.shortMessage || 'rpc limit') + ')');
  }
}
