# XButton Relayer

Node.js relayer for the Tezos X / CRAC XButton demo.

## What It Does

- Watches the **escrow** (`POT_ADDRESS`) for `Deposited` events.
- For each deposit, calls **`tez_getEthereumTezosAddress`** on the EVM `player` (same `EVM_RPC` as `eth_*`), then Micheline-encodes **`Pair(address, Pair(bytes, nat))`** — Tezos identity, raw 20-byte EVM address, and amount — and calls CRAC `callMichelson` → `record_deposit` on the game KT1. The stored Tezos `address` matches **`Tezos.get_sender ()`** when the winner claims via CRAC; **`last_player_evm`** is the same wallet as the escrow event for payout and UI.
- When Tezlink storage shows `claim_requested` and not yet `payout_completed`, reads the winner’s **`0x`** from **`last_player_evm`** in storage (no log scan, no reverse RPC). Then calls `escrow.payout(winner, pot)` and `mark_paid` (unit param `0x030b`) via CRAC.
- Uses **`PaidOut` logs** (last ~999 blocks, RPC limit) to skip duplicate payouts after restarts.

Without the relayer, deposits do not update Tezos storage and winners are not paid.

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
