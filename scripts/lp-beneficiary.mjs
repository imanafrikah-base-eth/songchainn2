const RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const PROXY = '0xc38858b220c032e7957fa514e0dd428867220a75';   // holds IMan's LP NFT
const IMAN_TOKEN = '0x58f65dF9566C85E125855E97391F52Dc375bA37e';
const AGENT = '0xe2a4a8b9d77080c57799a94ba8edeb2dd6e0ac10';   // opened the position

let id = 1;
async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}
const call = (data, to = PROXY) => rpc('eth_call', [{ to, data }, 'latest']).catch((e) => 'revert');
const asAddr = (w) => (typeof w === 'string' && w.length >= 66 ? '0x' + w.slice(-40) : w);

const views = [
  ['beneficiary()', '0x38af3eed', 'address'],
  ['launchedToken()', '0xfd435125', 'address'],
  ['npm()', '0x7f1e9ef6', 'address'],
  ['admin()', '0xf851a440', 'address'],
  ['initialized()', '0x158ef93e', 'bool'],
];

console.log('LP manager clone holding IMan\'s position:', PROXY, '\n');
for (const [name, sel, kind] of views) {
  const out = await call(sel);
  const val = out === 'revert' ? 'reverts' : kind === 'address' ? asAddr(out) : BigInt(out).toString();
  console.log('  ' + name.padEnd(17), val);
}

// Is the agent wallet a keeper on this clone?
const keeperCall = async (addr) => {
  const out = await call('0x6ba42aaa' + addr.slice(2).toLowerCase().padStart(64, '0'));
  return out === 'revert' ? 'reverts' : BigInt(out) === 1n;
};
console.log('\n  isKeeper(agent wallet) :', await keeperCall(AGENT));

// Where does the beneficiary sit, and is it a wallet or a contract?
const ben = asAddr(await call('0x38af3eed'));
if (ben && ben.startsWith('0x') && ben !== '0x' + '0'.repeat(40)) {
  const code = await rpc('eth_getCode', [ben, 'latest']);
  console.log('  beneficiary is        :', code === '0x' ? 'an EOA, a wallet a person controls' : `a contract (${(code.length - 2) / 2} bytes)`);
  const bal = await rpc('eth_getBalance', [ben, 'latest']);
  console.log('  beneficiary ETH       :', (Number(BigInt(bal)) / 1e18).toFixed(6));
  // How much $IMAN does the beneficiary hold?
  const t = await rpc('eth_call', [{ to: IMAN_TOKEN, data: '0x70a08231' + ben.slice(2).padStart(64, '0') }, 'latest']).catch(() => null);
  if (t) console.log('  beneficiary $IMAN     :', (Number(BigInt(t)) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 0 }));
  const nonce = await rpc('eth_getTransactionCount', [ben, 'latest']);
  console.log('  beneficiary tx count  :', parseInt(nonce, 16));
}
