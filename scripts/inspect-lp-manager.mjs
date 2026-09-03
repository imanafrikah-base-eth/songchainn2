const RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const HOLDER = '0xc38858b220c032e7957fa514e0dd428867220a75';
const DEPLOYER = '0xe2a4a8b9d77080c57799a94ba8edeb2dd6e0ac10';
const NPM = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const TOKEN_ID = 5882761n;

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
const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']).catch((e) => 'REVERT:' + e.message.slice(0, 50));
const addr = (word) => '0x' + word.slice(-40);

const code = await rpc('eth_getCode', [HOLDER, 'latest']);
console.log('holder code   :', code);
// EIP-1167: 363d3d373d3d3d363d73<20-byte impl>5af43d82803e903d91602b57fd5bf3
const m = code.match(/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i);
console.log('minimal proxy :', m ? 'YES' : 'no');
if (m) console.log('implementation:', '0x' + m[1]);

console.log('\n-- ownership --');
for (const [label, sig] of [['owner()', '0x8da5cb5b'], ['admin()', '0xf851a440'], ['manager()', '0x481c6a75'], ['treasury()', '0x61d027b3']]) {
  const out = await call(HOLDER, sig);
  console.log(`  ${label.padEnd(11)}:`, typeof out === 'string' && out.startsWith('0x') && out.length === 66 ? addr(out) : out);
}

console.log('\n-- does it still hold the position --');
const ownerOf = await call(NPM, '0x6352211e' + TOKEN_ID.toString(16).padStart(64, '0'));
console.log('  ownerOf(' + TOKEN_ID + ') :', addr(ownerOf));

console.log('\n-- the wallet that opened the position --');
const dcode = await rpc('eth_getCode', [DEPLOYER, 'latest']);
console.log('  ' + DEPLOYER, dcode === '0x' ? 'is an EOA (a person holds this key)' : 'is a contract');
const bal = await rpc('eth_getBalance', [DEPLOYER, 'latest']);
console.log('  balance :', (Number(BigInt(bal)) / 1e18).toFixed(5), 'ETH');
