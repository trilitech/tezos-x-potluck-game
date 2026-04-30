# XButton Relayer

Node.js relayer for the Tezos X / CRAC XButton demo.

## What It Does

- Watches the **escrow** (`POT_ADDRESS`) for `Deposited` events.
- For each deposit, calls **`tez_getEthereumTezosAddress`** on the EVM `player` (same `EVM_RPC` as `eth_*`), then Micheline-encodes **`Pair(address, Pair(bytes, nat))`** — Tezos identity, raw 20-byte EVM address, and amount — and calls CRAC `callMichelson` → `record_deposit` on the game KT1. The stored Tezos `address` matches **`Tezos.get_sender ()`** when the winner claims via CRAC; **`last_player_evm`** is the same wallet as the escrow event for payout and UI.
- When Tezlink storage shows `claim_requested` and not yet `payout_completed`, reads the winner’s **`0x`** from **`last_player_evm`** in storage (no log scan, no reverse RPC). Then calls `escrow.payout(winner, pot)` and `mark_paid` (unit param `0x030b`) via CRAC.
- Uses **`PaidOut` logs** (last ~999 blocks, RPC limit) to skip duplicate payouts after restarts.

Without the relayer, deposits do not update Tezos storage and winners are not paid.

### “No logs in the relayer terminal”

- By default the relayer only prints when it finds **`Deposited`** logs on **`POT_ADDRESS`**. If **`POT_ADDRESS`** (and the frontend **`VITE_POT_ADDRESS`**) point at an old escrow while users deposit to another contract, **`depositedLogsInBatch` stays 0** and you will see almost nothing after startup.
- Set **`RELAYER_VERBOSE_POLL=1`** to print **`[relayer] poll tick`** every interval so you can confirm the process is running and scanning.
- Set **`RELAYER_VERBOSE_CLAIM=1`** to print each **`[relayer] claim scan`** (current vs pending `claim_requested`, map sizes) plus payout / `mark_paid` steps.
- Set **`RELAYER_VERBOSE_DEPOSIT=1`** to print each **`Deposited` → `record_deposit`** handoff: **`dedupKey`** (`depositTxHash:logIndex`), **`cracTxHash`**, **`player`**, **`amount`** (helps prove one escrow log → one Michelson submission from this process).
- **Pending payouts:** the relayer must parse **`pending_sessions`** (map as JSON **array**) and **`pending_session_ids`** (Michelson **list** as Cons *or* JSON **array** of `{ int: … }`). If **`pendingIdsCount` is 0** but **`pendingMapSize` &gt; 0**, the relayer still drains claims by scanning the map (newest id first). **`RELAYER_VERBOSE_CLAIM=1`** logs **`pendingWithClaimRequestedFromMap`** vs list order.
- Production (e.g. Render) logs are on the host dashboard, not in your local terminal unless you run **`npm run dev`** locally with the same **`.env`**.

### Double `pot` increments on Michelson (one escrow deposit)

- **Cause (typical):** more than **one process** consumes the same **`Deposited`** log (two deployments, Render + laptop, staging + prod pointing at the same **`POT_ADDRESS`**). Both call **`record_deposit`** independently; the contracts only add **`amount`** once per call — duplicated **calls**, not buggy `pot +=` in game or escrow.
- **Restart replay:** Previously, **in-memory** dedup plus **`START_BLOCK_LOOKBACK`** meant a **restart** could scan the same logs again without knowing they were already mirrored on Tezos (a second **`record_deposit`**). **Fix:** the relayer persists processed log keys under **`.relayer-processed-deposits`** (custom path: **`RELAYER_PROCESSED_DEPOSITS_PATH`**) **only after** a successful **`record_deposit`** receipt. It also treats **`tx.wait()`** RPC failures as success when **`getTransactionReceipt`** shows **`status === 1`**, reducing “panic after mine” replays.
- Run **exactly one** relayer deployment per **`POT_ADDRESS` / `GAME_KT1`** pair; multiple concurrent instances bypass this file-backed dedup.

## Escrow & token

Deploy from **`../contracts/evm`**: `xUSDC.sol`, then `xEscrow.sol` with `_authorizedCaller` = relayer EVM address. See **`../contracts/tezlink`** for the game contract.

## Environment

```bash
EVM_RPC=...
TEZLINK_RPC=.../tezlink
RELAYER_PRIVATE_KEY=0x...
USDC_ADDRESS=0x...
POT_ADDRESS=0x...
GAME_KT1=KT1...
CRAC_PRECOMPILE=0xff00000000000000000000000000000000000007

# Optional: debug / dedup ledger
# RELAYER_VERBOSE_POLL=1
# RELAYER_VERBOSE_CLAIM=1
# RELAYER_VERBOSE_DEPOSIT=1
# RELAYER_PROCESSED_DEPOSITS_PATH=/var/lib/xbutton/processed-deposits.txt
```

Copy `.env.example` to `.env` if your repo provides one; never commit real keys.

## Run

```bash
cd xbutton-relayer && npm install && npm run dev
```

## Related

- `../contracts/tezlink` — LIGO / Michelson game contract
- `../xbutton-frontend` — Browser wallet UI
- `../README.md` — workspace overview
