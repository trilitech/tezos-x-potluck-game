# xCounter — Tezos X (NAC example)

**xCounter** is a minimal **Michelson counter** + **Solidity wrapper** + **React UI** for Tezos X [Native Atomic Composability](https://x.tezos.com/docs/) on Previewnet.

## What’s inside

| Path | Role |
| --- | --- |
| `contracts/smartpy/counter-nac-tutorial.py` | Michelson counter (`increment` / `decrement` / `reset`) — deploy from [SmartPy IDE](https://smartpy.io/ide) |
| `contracts/evm/EvmToMichelsonCounter.sol` | EVM forwarder → NAC gateway → KT1 — deploy from [Remix](https://remix.ethereum.org) (or your toolchain) |
| `frontend/` | Reads storage via Michelson RPC; sends txs to the wrapper |

## Quick start

1. **Michelson** — Originate `counter-nac-tutorial.py` via SmartPy IDE; note the `KT1`.
2. **EVM** — Deploy `EvmToMichelsonCounter.sol` on Tezos X Previewnet (Remix: Injected Provider). Constructor: your `KT1` string only. Copy the deployed **`0x…`** wrapper address.
3. **Env** — `cp frontend/.env.example frontend/.env` → set `VITE_COUNTER_KT1` and `VITE_COUNTER_WRAPPER_ADDRESS` to that `KT1` and wrapper. On Previewnet you can rely on the built-in default `KT1` in the app if you use the tutorial contract and only set the wrapper.
4. **UI** — In `frontend/`: `npm install && npm run dev`.

The NAC gateway is fixed in Solidity as the Previewnet precompile (`0xfF00000000000000000000000000000000000007`). Edit `NAC_GATEWAY` in the `.sol` file if your network uses another address.

### Wrapper KT1 must match `.env`

The wrapper stores your `KT1` at deploy time. If `VITE_COUNTER_KT1` and the wrapper disagree, calls revert (often empty revert data) and wallets may fail before showing a confirm sheet. Redeploy the wrapper with the right KT1 or fix env.

### Michelson storage 404

Wrong network, wrong `KT1`, or contract not originated. Check `VITE_TEZOSX_NETWORK` and RPC URLs in `frontend/.env.example`.

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://michelson.previewnet.tezosx.nomadic-labs.com/chains/main/blocks/head/context/contracts/<KT1>/storage"
```

`200` = contract found; `404` = fix address or network.
