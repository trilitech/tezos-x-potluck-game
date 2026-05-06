# xCounter — Tezos X (NAC example)

**xCounter** is a minimal **Michelson counter** + **Solidity wrapper** + **React UI** for Tezos X [Native Atomic Composability](https://x.tezos.com/docs/) on Previewnet.

You can follow the **Cross-interface counter (NAC walkthrough)** in the Tezos X docs and map each step to this tree: [tezosx-native-atomic-counter-example in `tezos-x-potluck-game`](https://github.com/trilitech/tezos-x-potluck-game/tree/main/tezosx-native-atomic-counter-example).

## What’s inside

| Path | Role |
| --- | --- |
| `contracts/smartpy/counter-nac-tutorial.py` | Michelson counter (`increment` / `decrement` / `reset`) — deploy from [SmartPy IDE](https://smartpy.io/ide) |
| `contracts/evm/EvmToMichelsonCounter.sol` | EVM forwarder → NAC gateway → KT1 — deploy from [Remix](https://remix.ethereum.org) (or your toolchain) |
| `frontend/` | Reads counter storage (Previewnet: TzKT API; testnet: Michelson RPC); sends txs to the wrapper |

## Quick start

1. **Michelson** — Originate `counter-nac-tutorial.py` via SmartPy IDE; note the `KT1`.
2. **EVM** — Deploy `EvmToMichelsonCounter.sol` on Tezos X Previewnet (Remix: Injected Provider). Constructor: your `KT1` string only. Copy the deployed **`0x…`** wrapper address.
3. **Env** — `cp frontend/.env.example frontend/.env` → set `VITE_COUNTER_KT1` and `VITE_COUNTER_WRAPPER_ADDRESS` to that `KT1` and wrapper. On Previewnet you can rely on the built-in default `KT1` in the app if you use the tutorial contract and only set the wrapper.
4. **UI** — In `frontend/`: `npm install && npm run dev`.

The NAC gateway is fixed in Solidity as the Previewnet precompile (`0xfF00000000000000000000000000000000000007`). Edit `NAC_GATEWAY` in the `.sol` file if your network uses another address.

### Wrapper KT1 must match `.env`

The wrapper stores your `KT1` at deploy time. If `VITE_COUNTER_KT1` and the wrapper disagree, calls revert (often empty revert data) and wallets may fail before showing a confirm sheet. Redeploy the wrapper with the right KT1 or fix env.

### Reading counter storage on Previewnet

The public Previewnet Michelson node often returns **404** for the standard Octez path  
`/chains/main/blocks/head/context/contracts/<KT1>/storage`, even when the contract exists.  
The frontend therefore uses the **TzKT REST API** on Previewnet:

`https://api.previewnet.tezosx.tzkt.io/v1/contracts/<KT1>/storage`

On testnet it still uses the Michelson RPC `.../storage` URL (via `VITE_TEZLINK_RPC`).

If the UI cannot load the counter value, check `VITE_TEZOSX_NETWORK`, `KT1`, and that the contract is indexed (TzKT).

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://api.previewnet.tezosx.tzkt.io/v1/contracts/<KT1>/storage"
```

`200` = storage available; `404` = wrong `KT1` / network or not indexed yet.
