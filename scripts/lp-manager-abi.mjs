/**
 * What can the contract holding IMan's LP actually do?
 *
 * Reads verification status, then pulls every public selector straight out of
 * the runtime dispatcher and names them via the 4byte directory. Bytecode does
 * not lie about which functions exist.
 */
const IMPL = '0x48abc63e3c6c63b8109b9254899be26b68f3e14d';
const ADMIN = '0x009041277ee760387a6a6cf67d2bae1a1315dbae';
const RPC = process.env.BASE_RPC || 'https://mainnet.base.org';

async function blockscout(addr) {
  const r = await fetch(`https://base.blockscout.com/api/v2/smart-contracts/${addr}`);
  const j = await r.json();
  return {
    verified: Boolean(j.is_verified),
    name: j.name || null,
    language: j.language || null,
    hasSource: Boolean(j.source_code),
    sourceLen: j.source_code ? j.source_code.length : 0,
    abiCount: Array.isArray(j.abi) ? j.abi.length : 0,
    abi: Array.isArray(j.abi) ? j.abi : null,
    source: j.source_code || null,
  };
}

async function code(addr) {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [addr, 'latest'] }),
  });
  return (await r.json()).result;
}

/* Solidity dispatchers compare calldata against PUSH4 <selector>. */
function selectorsFrom(bytecode) {
  const out = new Set();
  const hex = bytecode.slice(2);
  for (let i = 0; i + 10 <= hex.length; i += 2) {
    if (hex.slice(i, i + 2) === '63') out.add(hex.slice(i + 2, i + 10));
  }
  return [...out];
}

async function name4byte(sel) {
  try {
    const r = await fetch(`https://www.4byte.directory/api/v1/signatures/?hex_signature=0x${sel}`);
    const j = await r.json();
    if (!j.results?.length) return null;
    return j.results.sort((a, b) => a.id - b.id)[0].text_signature;
  } catch {
    return null;
  }
}

for (const [label, addr] of [['LP MANAGER implementation', IMPL], ['ADMIN contract', ADMIN]]) {
  const meta = await blockscout(addr);
  console.log(`\n=== ${label} ${addr}`);
  console.log('  verified on Blockscout :', meta.verified ? `YES (${meta.name}, ${meta.language})` : 'NO');
  if (meta.hasSource) console.log('  source length          :', meta.sourceLen, 'chars');
  if (meta.abiCount) {
    const fns = meta.abi.filter((x) => x.type === 'function');
    console.log('  abi functions          :', fns.length);
    for (const f of fns) {
      console.log(`     ${f.stateMutability === 'view' || f.stateMutability === 'pure' ? 'view ' : 'WRITE'} ${f.name}(${(f.inputs || []).map((i) => i.type).join(',')})`);
    }
  }
}

console.log('\n=== selectors in the LP manager runtime, named via 4byte');
const sels = selectorsFrom(await code(IMPL));
const named = [];
for (const s of sels) named.push([s, await name4byte(s)]);
for (const [s, n] of named) console.log('  0x' + s, n || '(unknown)');
