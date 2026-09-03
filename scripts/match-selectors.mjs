import { toFunctionSelector } from 'viem';

const UNKNOWN = ['4962a79f','49c294d1','84a75a62','9de9b28b','9f2e3474','c2eb9284','ca1116bb','e19039ff','f0ee82b1','ff91e489','611c1f56','133f7571','783920a8','12363cc8','31a9108f','565b3d91','6eb1769f','53137c35'];

const CANDIDATES = [
  'setBeneficiary(address)','changeBeneficiary(address)','updateBeneficiary(address)',
  'setBeneficiary(address,address)','transferBeneficiary(address)',
  'harvest()','harvest(uint256)','harvestAll(uint256)','compound()','compound(uint256)',
  'buildWall(uint256,uint256)','addWall(uint256)','wallCount()','wallsLength()',
  'pool()','token0()','token1()','positionId()','tokenId()','fee()',
  'sweep(address)','rescue(address)','rescueERC20(address)','skim(address)',
  'setFeeSplit(uint256)','setSplit(uint256)','split()','feeBps()',
  'pendingFees()','claimable()','totalHarvested()','lastHarvest()',
  'depositToAave(uint256)','supplyToLending(uint256)','lend(uint256)',
  'keeperHarvest()','harvestTo(address)','collectFees()','collectFees(uint256)',
  'stake(uint256)','unstake(uint256)','lockedAmount()','locked()',
];

const map = new Map();
for (const sig of CANDIDATES) {
  try { map.set(toFunctionSelector(sig).slice(2).toLowerCase(), sig); } catch {}
}

console.log('Matching the unnamed selectors in the LP manager:\n');
let hits = 0;
for (const sel of UNKNOWN) {
  const sig = map.get(sel);
  if (sig) { console.log('  0x' + sel, '=', sig); hits++; }
}
console.log(hits ? '' : '  no matches from the candidate list');

console.log('\nSanity check, is setBeneficiary present at all?');
for (const sig of ['setBeneficiary(address)','changeBeneficiary(address)','updateBeneficiary(address)','transferBeneficiary(address)']) {
  const sel = toFunctionSelector(sig).slice(2).toLowerCase();
  console.log('  ' + sig.padEnd(28), '0x' + sel, UNKNOWN.includes(sel) ? 'PRESENT' : 'not in the contract');
}
