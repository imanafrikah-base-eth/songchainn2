/**
 * What already exists, and what a new coin would actually cost.
 * Read-only. Signs nothing.
 */
import { createPublicClient, http, parseAbi, getAddress, formatUnits, formatEther } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

const IMAN = getAddress('0x58f65dF9566C85E125855E97391F52Dc375bA37e');
const IMAN_POOL = getAddress('0x4cC581A56DD250AA3C4F4c58B55d33dDbbcBa089');

const ERC20 = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
]);

console.log('DOES $IMAN ALREADY EXIST AND WORK?');
console.log('='.repeat(70));
try {
  const [n, s, d, ts] = await Promise.all([
    client.readContract({ address: IMAN, abi: ERC20, functionName: 'name' }),
    client.readContract({ address: IMAN, abi: ERC20, functionName: 'symbol' }),
    client.readContract({ address: IMAN, abi: ERC20, functionName: 'decimals' }),
    client.readContract({ address: IMAN, abi: ERC20, functionName: 'totalSupply' }),
  ]);
  console.log('  ' + n + ' (' + s + '), ' + d + ' decimals');
  console.log('  totalSupply: ' + Number(formatUnits(ts, d)).toLocaleString());

  // Is it transferable? Simulate from the pool, which definitely holds some.
  const poolBal = await client.readContract({
    address: IMAN, abi: ERC20, functionName: 'balanceOf', args: [IMAN_POOL],
  });
  console.log('  pool holds : ' + Number(formatUnits(poolBal, d)).toLocaleString() + ' ' + s);
  if (poolBal > 0n) {
    try {
      await client.simulateContract({
        address: IMAN, abi: ERC20, functionName: 'transfer',
        args: ['0x000000000000000000000000000000000000dEaD', 1n], account: IMAN_POOL,
      });
      console.log('  TRANSFERABLE: yes. This is a working, tradable token.');
    } catch (e) {
      console.log('  TRANSFERABLE: NO. ' + String(e?.shortMessage || e).split('\n')[0]);
    }
  }
} catch (e) {
  console.log('  could not read: ' + String(e?.shortMessage || e).split('\n')[0]);
}

console.log('\n\nWHAT DOES A DEPLOY COST RIGHT NOW?');
console.log('='.repeat(70));
const gasPrice = await client.getGasPrice();
console.log('  Base gas price: ' + formatUnits(gasPrice, 9) + ' gwei');

// Rough gas for the shapes involved. Deploying an ERC20 plus opening a
// single-sided pool is the expensive end; a factory clone is the cheap end.
const SHAPES = [
  ['a factory/clone deploy (Zora, Clanker)', 1_500_000n],
  ['a full custom ERC20 deploy', 2_500_000n],
  ['one ERC20 transfer', 65_000n],
];
for (const [label, gas] of SHAPES) {
  const wei = gas * gasPrice;
  console.log('  ' + label.padEnd(40) + formatEther(wei) + ' ETH');
}
console.log('\n  (multiply by the ETH price for dollars. At $3,000 ETH,');
console.log('   1 ETH of gas here is well under a cent per 1000 gas.)');

console.log('\n\nIS THE ZORA SDK ALREADY ABLE TO CREATE COINS?');
console.log('='.repeat(70));
try {
  const sdk = await import('@zoralabs/coins-sdk');
  const creators = Object.keys(sdk).filter((k) => /create|deploy|factory/i.test(k));
  console.log('  installed, and it exports:');
  for (const c of creators) console.log('    - ' + c);
  if (!creators.length) console.log('    (no create/deploy exports found in this version)');
} catch (e) {
  console.log('  could not load the SDK: ' + String(e?.message).split('\n')[0]);
}
