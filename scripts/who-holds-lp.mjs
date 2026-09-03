/**
 * Who actually holds the $IMAN Uniswap v3 LP position, read from Base itself.
 *
 * "Probably in the LP manager" is not an answer anybody should build a payout
 * on. The pool is public, so this asks the chain directly.
 */
const RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const POOL = '0x4cC581A56DD250AA3C4F4c58B55d33dDbbcBa089';
const TOKEN = '0x58f65dF9566C85E125855E97391F52Dc375bA37e';
// Uniswap v3 NonfungiblePositionManager on Base.
const NPM = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';

let id = 1;
async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(method + ': ' + j.error.message);
  return j.result;
}

const addrFromTopic = (t) => '0x' + t.slice(26);
const hex = (n) => '0x' + n.toString(16);

const latest = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('base head block :', latest);

// Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, ...)
const MINT = '0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde';

// Walk back in windows until we find the pool's mints.
let logs = [];
const WINDOW = 9500;   // the public RPC caps eth_getLogs at 10k blocks
for (let end = latest; end > 0 && logs.length === 0; end -= WINDOW) {
  const from = Math.max(0, end - WINDOW);
  try {
    const got = await rpc('eth_getLogs', [{ address: POOL, topics: [MINT], fromBlock: hex(from), toBlock: hex(end) }]);
    if (got.length) { logs = got; console.log(`found ${got.length} Mint log(s) in ${from}..${end}`); }
  } catch (e) {
    console.log('  window', from, end, 'failed:', e.message.slice(0, 60));
  }
  if (end - WINDOW <= latest - WINDOW * 40) break; // ~380k blocks, well past the 26 Aug launch
}

if (!logs.length) {
  console.log('No Mint logs found in the scanned range.');
  process.exit(0);
}

const owners = new Set(logs.map((l) => addrFromTopic(l.topics[1]).toLowerCase()));
console.log('position owner(s) on the pool :', [...owners].join(', '));
console.log('is Uniswap v3 NPM             :', owners.has(NPM.toLowerCase()) ? 'YES, so it is an NFT position' : 'no, direct pool position');

// For NFT positions, the tokenId comes from the NPM IncreaseLiquidity log in the same tx.
const INC = '0x3067048beee31b25b2f1681f88dac838c8bba36af25bfb2b7cf7473a5847e35f';
for (const l of logs) {
  const receipt = await rpc('eth_getTransactionReceipt', [l.transactionHash]);
  const inc = receipt.logs.find((x) => x.topics[0] === INC && x.address.toLowerCase() === NPM.toLowerCase());
  console.log('\ntx        :', l.transactionHash);
  console.log('  from    :', receipt.from);
  if (!inc) { console.log('  no IncreaseLiquidity, not an NFT position'); continue; }
  const tokenId = BigInt(inc.topics[1]).toString();
  // ownerOf(uint256)
  const data = '0x6352211e' + BigInt(tokenId).toString(16).padStart(64, '0');
  const owner = await rpc('eth_call', [{ to: NPM, data }, 'latest']);
  const holder = '0x' + owner.slice(26);
  console.log('  tokenId :', tokenId);
  console.log('  HOLDER  :', holder);
  const code = await rpc('eth_getCode', [holder, 'latest']);
  console.log('  holder is:', code && code !== '0x' ? 'a CONTRACT (' + ((code.length - 2) / 2) + ' bytes)' : 'an EOA (a wallet a person controls)');
}
