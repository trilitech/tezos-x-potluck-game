import 'dotenv/config';
import { createHash } from 'crypto';
import http from 'http';
import { ethers } from 'ethers';

const {
  EVM_RPC,
  RELAYER_PRIVATE_KEY,
  POT_ADDRESS,
  GAME_KT1,
  CRAC_PRECOMPILE,
  TEZLINK_RPC,
} = process.env;

if (!EVM_RPC || !RELAYER_PRIVATE_KEY || !POT_ADDRESS || !GAME_KT1 || !CRAC_PRECOMPILE || !TEZLINK_RPC) {
  throw new Error('Missing required env vars (EVM_RPC, RELAYER_PRIVATE_KEY, POT_ADDRESS, GAME_KT1, CRAC_PRECOMPILE, TEZLINK_RPC)');
}

const tezlinkStorageUrl = `${TEZLINK_RPC}/chains/main/blocks/head/context/contracts/${GAME_KT1}/storage`;

const provider = new ethers.JsonRpcProvider(EVM_RPC);
const wallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);

const START_BLOCK_LOOKBACK = 20;
const POLL_INTERVAL_MS = 5000;
/** Set to 1/true to log every poll (proves the process is alive; use when debugging “no Deposited logs”). */
const VERBOSE_POLL = /^1|true|yes$/i.test(String(process.env.RELAYER_VERBOSE_POLL ?? ''));

const escrowAbi = [
  'event Deposited(address indexed player, uint256 amount)',
  'event PaidOut(address indexed winner, uint256 amount)',
  'function payout(address winner, uint256 amount)',
];
const gatewayAbi = [
  'function callMichelson(string destination, string entrypoint, bytes data) external payable',
];

const escrow = new ethers.Contract(POT_ADDRESS, escrowAbi, provider);
const escrowWithWallet = new ethers.Contract(POT_ADDRESS, escrowAbi, wallet);
const gateway = new ethers.Contract(CRAC_PRECOMPILE, gatewayAbi, wallet);

const processed = new Set();
let payoutSent = false;

// Gas limit for CRAC callMichelson — set above observed worst-case (record_deposit: ~2.05M).
const CRAC_GAS_LIMIT = 3_000_000n;

// Unit parameter for mark_paid entrypoint (takes unit in Ligo).
// Raw Micheline (no PACK prefix) — matches how the frontend sends unit for claim: 03=prim, 0b=D_Unit.
const UNIT_BYTES = '0x030b';

// ---------------------------------------------------------------------------
// Tezlink storage fetch and parse
// ---------------------------------------------------------------------------

async function fetchStorage() {
  const response = await fetch(tezlinkStorageUrl);
  if (!response.ok) {
    throw new Error(`Tezlink storage fetch failed: ${response.status}`);
  }
  return response.json();
}

function parseStorage(storage) {
  // New storage layout:
  // pair (option %last_player address)
  //      (pair (option %last_player_evm bytes)
  //            (pair (nat %pot)
  //                  (pair (timestamp %session_end)
  //                        (pair (bool %claim_requested) (bool %payout_completed)))))
  const lastPlayerNode = storage?.args?.[0];
  let lastPlayerTezos = null;
  const prim = lastPlayerNode?.prim?.toLowerCase?.();
  if (prim === 'some') {
    const arg = lastPlayerNode.args?.[0];
    if (arg?.string) lastPlayerTezos = arg.string;
    else if (arg?.bytes) lastPlayerTezos = tezosAddressFromBinary(arg.bytes);
  }

  // last_player_evm: option bytes — raw 20-byte EVM address stored by the relayer
  const lastPlayerEvmNode = storage?.args?.[1]?.args?.[0];
  let lastPlayerEvm = null;
  if (lastPlayerEvmNode?.prim?.toLowerCase() === 'some') {
    const evmBytes = lastPlayerEvmNode?.args?.[0]?.bytes;
    if (evmBytes) lastPlayerEvm = '0x' + evmBytes;
  }

  const pot = storage?.args?.[1]?.args?.[1]?.args?.[0]?.int;
  const claimedPrim = storage?.args?.[1]?.args?.[1]?.args?.[1]?.args?.[1]?.args?.[0]?.prim;
  const payoutCompletedPrim = storage?.args?.[1]?.args?.[1]?.args?.[1]?.args?.[1]?.args?.[1]?.prim;
  return {
    lastPlayerTezos,
    lastPlayerEvm,
    pot: pot ?? null,
    claimed: claimedPrim === 'True',
    payoutCompleted: payoutCompletedPrim === 'True',
  };
}

async function checkClaimAndPayout() {
  let storage;
  try {
    storage = await fetchStorage();
  } catch (err) {
    console.error('Storage fetch error:', err.message);
    return;
  }

  const { lastPlayerEvm, pot, claimed, payoutCompleted } = parseStorage(storage);

  if (!claimed) return;
  if (payoutCompleted) return;
  if (!lastPlayerEvm || !pot) {
    console.error('Storage parse: missing last_player_evm or pot');
    return;
  }

  const amount = BigInt(pot);

  const winner = resolveWinnerEvm(lastPlayerEvm);
  if (!winner) {
    console.error('[relayer] Could not parse EVM winner from storage last_player_evm:', lastPlayerEvm);
    return;
  }

  // Check if the escrow already emitted PaidOut for this winner (e.g. previous run, within last 999 blocks).
  const existingPayoutTx = await checkAlreadyPaidOut(winner);
  if (existingPayoutTx || payoutSent) {
    await callMarkPaid();
    return;
  }

  try {
    const tx = await escrowWithWallet.payout(winner, amount);
    await tx.wait();
    payoutSent = true;
    await callMarkPaid();
  } catch (err) {
    const revertReason = decodeRevertReason(err);
    if (revertReason && revertReason.toLowerCase().includes('balance too low')) {
      // Escrow balance is zero — payout was already sent in a previous run.
      // Set payoutSent so we don't retry payout, then sync Tezos via mark_paid.
      payoutSent = true;
      await callMarkPaid();
    } else if (revertReason) {
      console.error('[relayer] Payout revert reason:', revertReason);
    } else {
      console.error('[relayer] Payout failed:', err.shortMessage ?? err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Manual Micheline binary encoding
// Micheline binary format (no PACK 0x05 prefix — gateway wants raw expression)
//
// Pair tag    = 0x07 0x07
// Bytes tag   = 0x0a  followed by 4-byte big-endian length then raw bytes
// Int/Nat tag = 0x00  followed by zarith-encoded unsigned integer
//
// record_deposit: Pair(address, nat)
//   address encoded as optimised 22-byte binary (not a string literal):
//     tz1 → 0x00 0x00 + 20-byte hash
//     tz2 → 0x00 0x01 + 20-byte hash
//     tz3 → 0x00 0x02 + 20-byte hash
//     KT1 → 0x01      + 20-byte hash + 0x00  (no-entrypoint padding)
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Tezos Base58Check 3-byte prefixes per address type
const TEZOS_PREFIXES = {
  tz1: Buffer.from([6, 161, 159]),
  tz2: Buffer.from([6, 161, 161]),
  tz3: Buffer.from([6, 161, 164]),
  KT1: Buffer.from([2, 90, 121]),
};

function base58Decode(str) {
  let n = 0n;
  for (const ch of str) {
    const digit = BASE58_ALPHABET.indexOf(ch);
    if (digit < 0) throw new Error(`Invalid Base58 character: ${ch}`);
    n = n * 58n + BigInt(digit);
  }
  let leadingZeros = 0;
  for (const ch of str) {
    if (ch !== '1') break;
    leadingZeros++;
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return Buffer.from([...new Array(leadingZeros).fill(0), ...bytes]);
}

function base58Encode(buf) {
  let n = 0n;
  for (const b of buf) n = n * 256n + BigInt(b);
  let result = '';
  while (n > 0n) {
    result = BASE58_ALPHABET[Number(n % 58n)] + result;
    n /= 58n;
  }
  for (const b of buf) {
    if (b !== 0) break;
    result = '1' + result;
  }
  return result;
}

/**
 * Convert a 22-byte optimised Tezos address (as stored in Tezlink JSON) back to
 * a human-readable tz1/tz2/tz3/KT1 string via Base58Check encoding.
 */
function tezosAddressFromBinary(hexStr) {
  const bin = Buffer.from(hexStr, 'hex');
  if (bin.length !== 22) throw new Error(`Expected 22-byte address, got ${bin.length}`);

  let prefix;
  let hash;
  if (bin[0] === 0x00) {
    hash = bin.slice(2); // implicit: skip type byte + curve byte
    const curve = bin[1];
    if (curve === 0x00) prefix = TEZOS_PREFIXES.tz1;
    else if (curve === 0x01) prefix = TEZOS_PREFIXES.tz2;
    else if (curve === 0x02) prefix = TEZOS_PREFIXES.tz3;
    else throw new Error(`Unknown implicit curve byte: 0x${curve.toString(16)}`);
  } else if (bin[0] === 0x01) {
    prefix = TEZOS_PREFIXES.KT1;
    hash = bin.slice(1, 21); // skip type byte and trailing 0x00
  } else {
    throw new Error(`Unknown address type byte: 0x${bin[0].toString(16)}`);
  }

  const payload = Buffer.concat([prefix, hash]);
  const checksum = createHash('sha256')
    .update(createHash('sha256').update(payload).digest())
    .digest()
    .slice(0, 4);
  return base58Encode(Buffer.concat([payload, checksum]));
}

/**
 * Encode a Tezos address (tz1/tz2/tz3/KT1) as a Micheline binary bytes node
 * representing the optimised 22-byte address form expected by the CRAC gateway.
 */
function encodeMichelineAddress(address) {
  // Base58Check decode → [3-byte prefix] + [20-byte hash] + [4-byte checksum]
  const decoded = base58Decode(address);
  if (decoded.length !== 27) {
    throw new Error(`Unexpected decoded length for address ${address}: ${decoded.length}`);
  }
  // Verify checksum (SHA256(SHA256(prefix+hash))[0:4])
  const payload = decoded.slice(0, 23);     // 3 prefix + 20 hash
  const checksum = decoded.slice(23);       // 4 bytes
  const digest = createHash('sha256').update(createHash('sha256').update(payload).digest()).digest();
  if (!digest.slice(0, 4).equals(checksum)) {
    throw new Error(`Base58Check checksum mismatch for address ${address}`);
  }

  const hash = decoded.slice(3, 23); // 20-byte public key hash

  let binaryAddr;
  if (address.startsWith('tz1')) {
    binaryAddr = Buffer.concat([Buffer.from([0x00, 0x00]), hash]);
  } else if (address.startsWith('tz2')) {
    binaryAddr = Buffer.concat([Buffer.from([0x00, 0x01]), hash]);
  } else if (address.startsWith('tz3')) {
    binaryAddr = Buffer.concat([Buffer.from([0x00, 0x02]), hash]);
  } else if (address.startsWith('KT1')) {
    binaryAddr = Buffer.concat([Buffer.from([0x01]), hash, Buffer.from([0x00])]);
  } else {
    throw new Error(`Unsupported Tezos address type: ${address}`);
  }

  // Wrap as Micheline bytes node: 0x0a + 4-byte big-endian length + bytes
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(binaryAddr.length); // always 22
  return Buffer.concat([Buffer.from([0x0a]), lenBuf, binaryAddr]);
}

function michelineIntEncode(value) {
  let n = BigInt(value);
  if (n < 0n) throw new Error('Only non-negative values supported for nat');

  const bytes = [];
  // First byte carries 6 payload bits; continuation bytes carry 7.
  let first = Number(n & 0x3fn);
  n >>= 6n;
  if (n > 0n) first |= 0x80;
  bytes.push(first);
  while (n > 0n) {
    let b = Number(n & 0x7fn);
    n >>= 7n;
    if (n > 0n) b |= 0x80;
    bytes.push(b);
  }
  return Buffer.from(bytes);
}

/** Tezlink address from EVM wallet (same form as Tezos.get_sender for CRAC calls). */
async function rpcEthereumToTezos(evmAddress) {
  const addr = ethers.getAddress(evmAddress);
  let tez;
  try {
    tez = await provider.send('tez_getEthereumTezosAddress', [addr]);
  } catch (err) {
    console.error('[relayer] tez_getEthereumTezosAddress RPC error', {
      evm: addr,
      message: err?.shortMessage ?? err?.message,
      code: err?.code,
      data: err?.data ?? err?.error?.data ?? err?.info?.error?.data,
    });
    throw err;
  }
  if (typeof tez !== 'string') {
    console.error('[relayer] tez_getEthereumTezosAddress unexpected result type', {
      evm: addr,
      typeofResult: typeof tez,
      tez: tez,
      jsonPreview: (() => {
        try {
          return JSON.stringify(tez)?.slice(0, 500);
        } catch {
          return null;
        }
      })(),
    });
    throw new Error('tez_getEthereumTezosAddress: unexpected result');
  }
  return tez;
}

/**
 * Encode record_deposit parameter: Pair(address, Pair(bytes, nat))
 * The address is the Tezos-side identity; evmAddress is the raw 20-byte EVM wallet.
 */
function encodeRecordDeposit(tezosAddress, evmAddress, amount) {
  const addrNode = encodeMichelineAddress(tezosAddress);

  // Raw 20-byte EVM address as a Micheline bytes node: 0x0a + 4-byte length + bytes
  const evmRaw = Buffer.from(evmAddress.toLowerCase().replace(/^0x/, ''), 'hex');
  const evmLenBuf = Buffer.alloc(4);
  evmLenBuf.writeUInt32BE(evmRaw.length); // 20
  const evmNode = Buffer.concat([Buffer.from([0x0a]), evmLenBuf, evmRaw]);

  const amountBytes = michelineIntEncode(amount);

  const encoded = Buffer.concat([
    Buffer.from([0x07, 0x07]), // Outer Pair (address, inner)
    addrNode,
    Buffer.from([0x07, 0x07]), // Inner Pair (bytes, nat)
    evmNode,
    Buffer.from([0x00]),       // nat tag
    amountBytes,
  ]);

  return `0x${encoded.toString('hex')}`;
}

function decodeRevertReason(err) {
  // Try multiple paths CRAC / ethers may use for the revert payload.
  const candidates = [
    err?.info?.error?.data,
    err?.data,
    err?.error?.data,
  ];
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string' || !raw.startsWith('0x')) continue;
    try {
      const text = Buffer.from(raw.slice(2), 'hex').toString('utf8').replace(/\0/g, '').trim();
      if (text) return text;
    } catch { /* ignore */ }
    return raw; // return raw hex if UTF-8 fails
  }
  return null;
}

// Check the escrow for a PaidOut(winner, amount) event — used to avoid double-paying.
// Looks back at most MAX_LOG_WINDOW blocks to stay within the RPC limit.
const MAX_LOG_WINDOW = 999;

/**
 * Return the checksummed EVM winner address directly from storage.
 * The relayer now writes last_player_evm into every record_deposit call,
 * so no log scan or RPC round-trip is needed.
 */
function resolveWinnerEvm(lastPlayerEvm) {
  if (!lastPlayerEvm) return null;
  try {
    return ethers.getAddress(lastPlayerEvm);
  } catch (err) {
    console.error('[relayer] Could not parse last_player_evm from storage:', err.message);
    return null;
  }
}

async function checkAlreadyPaidOut(winner) {
  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - MAX_LOG_WINDOW);
    const byWinner = await escrow.queryFilter(escrow.filters.PaidOut(winner), fromBlock, 'latest');
    if (byWinner.length > 0) {
      return byWinner[byWinner.length - 1].transactionHash ?? null;
    }
    const all = await escrow.queryFilter(escrow.filters.PaidOut(), fromBlock, 'latest');
    if (all.length > 0) {
      return all[all.length - 1].transactionHash ?? null;
    }
  } catch (err) {
    console.error('[relayer] PaidOut query failed:', err.message);
  }
  return null;
}

async function callMarkPaid() {
  try {
    const tx = await gateway.callMichelson(
      GAME_KT1,
      'mark_paid',
      UNIT_BYTES,
      { gasLimit: CRAC_GAS_LIMIT }
    );

    await tx.wait();
  } catch (markPaidErr) {
    const reason = decodeRevertReason(markPaidErr);
    if (reason) {
      console.error('[relayer] mark_paid revert reason:', reason);
    } else {
      // Log raw error data so we can diagnose encoding or permission issues.
      const raw = markPaidErr?.info?.error?.data ?? markPaidErr?.data ?? null;
      if (raw) console.error('[relayer] mark_paid raw revert data:', raw);
    }
    console.error('[relayer] mark_paid failed:', markPaidErr.shortMessage ?? markPaidErr.message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processDeposited(log) {
  const key = `${log.transactionHash}:${log.index}`;
  if (processed.has(key)) return;
  processed.add(key);

  const parsed = escrow.interface.parseLog(log);
  const { player, amount } = parsed.args;

  try {
    const tezosAddr = await rpcEthereumToTezos(player);
    const encodedBytes = encodeRecordDeposit(tezosAddr, player, amount);
    const tx = await gateway.callMichelson(
      GAME_KT1,
      'record_deposit',
      encodedBytes,
      { gasLimit: CRAC_GAS_LIMIT }
    );
    await tx.wait();
  } catch (err) {
    const msg = err?.shortMessage ?? err?.message ?? String(err);
    if (msg.includes('tez_getEthereumTezosAddress') || msg.includes('tez_get')) {
      console.error('[relayer] tez_getEthereumTezosAddress or Tezos mapping failed', {
        player,
        depositTxHash: log.transactionHash,
        err: msg,
      });
    }
    const revertReason = decodeRevertReason(err);
    if (revertReason) {
      console.error('[relayer] record_deposit revert:', revertReason);
    } else {
      console.error('[relayer] record_deposit failed:', err.shortMessage ?? err.message);
      const raw = err?.info?.error?.data ?? err?.data ?? err?.error?.data ?? null;
      if (raw) console.error('[relayer] record_deposit raw error data:', raw);
    }
  }
}

async function pollDeposits() {
  const latestBlock = await provider.getBlockNumber();
  let fromBlock = Math.max(0, latestBlock - START_BLOCK_LOOKBACK);

  const filter = escrow.filters.Deposited();

  while (true) {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock >= fromBlock) {
        const logs = await escrow.queryFilter(filter, fromBlock, currentBlock);
        if (VERBOSE_POLL) {
          console.log('[relayer] poll tick', {
            fromBlock,
            toBlock: currentBlock,
            depositedLogsInBatch: logs.length,
            watchingPot: POT_ADDRESS,
          });
        }
        for (const log of logs) {
          await processDeposited(log);
        }
        fromBlock = currentBlock + 1;
      }

      await checkClaimAndPayout();
    } catch (err) {
      console.error('Polling error:', err.message);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

async function main() {
  console.log(
    '[relayer] started',
    { wallet: wallet.address, pot: POT_ADDRESS, game: GAME_KT1, tezlinkStorage: tezlinkStorageUrl, verbosePoll: VERBOSE_POLL },
  );

  await pollDeposits();
}

// Render (and similar) free Web Services require binding to process.env.PORT.
// Local dev: omit PORT to run only the relayer loop with no HTTP server.
const renderPort = process.env.PORT;
if (renderPort) {
  const portNum = Number(renderPort);
  if (!Number.isFinite(portNum) || portNum <= 0) {
    console.error('[relayer] Invalid PORT:', renderPort);
    process.exit(1);
  }
  http
    .createServer((req, res) => {
      if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('ok');
        return;
      }
      res.writeHead(404);
      res.end();
    })
    .listen(portNum, '0.0.0.0', () => {
      console.log(`[relayer] health 0.0.0.0:${portNum}`);
    });
}

main().catch(console.error);

