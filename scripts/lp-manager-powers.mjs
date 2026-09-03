const RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const IMPL = '0x48abc63e3c6c63b8109b9254899be26b68f3e14d';
const ADMIN = '0x009041277ee760387a6a6cf67d2bae1a1315dbae';
const PROXY = '0xc38858b220c032e7957fa514e0dd428867220a75';

let id = 1;
async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(method + ': ' + j.error.message);
  return j.result;
}

const code = await rpc('eth_getCode', [IMPL, 'latest']);
console.log('implementation size :', (code.length - 2) / 2, 'bytes');

/* Selectors the manager would need in order to move money or the position.
   Finding one in the bytecode does not prove an admin can reach it, but its
   absence does prove the contract cannot do that thing at all. */
const SELECTORS = {
  'NPM.decreaseLiquidity(...)': '0c49ccbe',
  'NPM.collect(...)':           'fc6f7865',
  'NPM.burn(uint256)':          '42966c68',
  'ERC721.safeTransferFrom':    '42842e0e',
  'ERC721.transferFrom':        '23b872dd',
  'ERC20.transfer':             'a9059cbb',
  'withdraw()':                 '3ccfd60b',
  'withdraw(uint256)':          '2e1a7d4d',
  'emergencyWithdraw()':        'db2e21bc',
  'setAdmin(address)':          '704b6c02',
  'transferOwnership(address)': 'f2fde38b',
  'renounceOwnership()':        '715018a6',
  'aave.supply(...)':           '617ba037',
  'aave.withdraw(...)':         '69328dec',
};
console.log('\nselectors present in the implementation bytecode:');
for (const [name, sel] of Object.entries(SELECTORS)) {
  console.log('  ' + (code.includes(sel) ? 'PRESENT ' : 'absent  ') + name);
}

const acode = await rpc('eth_getCode', [ADMIN, 'latest']);
console.log('\nadmin', ADMIN);
console.log('  is', acode === '0x' ? 'an EOA, a key a person controls' : 'a contract (' + ((acode.length - 2) / 2) + ' bytes)');
const nonce = await rpc('eth_getTransactionCount', [ADMIN, 'latest']);
console.log('  transactions sent :', parseInt(nonce, 16));

// Is the admin the same across other clones? Read admin() straight off the impl.
const implAdmin = await rpc('eth_call', [{ to: IMPL, data: '0xf851a440' }, 'latest']).catch(() => null);
console.log('  admin() on the implementation itself :', implAdmin ? '0x' + implAdmin.slice(-40) : 'reverts');
console.log('\nproxy', PROXY, '-> implementation', IMPL);
