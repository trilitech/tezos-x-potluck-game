# XButton Tezlink Contract

This folder contains the **XButton game contract** for the Tezos runtime (Tezlink). It is used by the relayer (CRAC `record_deposit`, `mark_paid`) and the frontend (game state).

## EVM ↔ Tezlink address RPCs (off-chain)

The **TezosX EVM JSON-RPC** (same URL as `eth_*`, e.g. `https://demo.txpark.nomadic-labs.com/rpc`) exposes:

| Method | Direction | Role in this demo |
|--------|-----------|-------------------|
| **`tez_getEthereumTezosAddress`** | `0x…` → Tezlink `address` | Relayer calls this for each escrow `Deposited` player and passes the result as `record_deposit`’s Tezos `address` so it matches **`Tezos.get_sender ()`** when that wallet claims via CRAC. |
| **`tez_getTezosEthereumAddress`** | Tezos implicit `tz1…` → `0x…` | Optional tooling only. It does **not** reverse every `KT1` alias produced by `tez_getEthereumTezosAddress`, so the demo does not rely on it for payout or UI. |

Michelson never calls these methods; they are for the relayer and tooling only. The contract also stores the **raw 20-byte EVM address** in `last_player_evm`, so the frontend and relayer do not need to reverse `KT1` → `0x`.

## Layout

| Folder    | Contents |
|----------|----------|
| **`ligo/`** | Contract source in CameLIGO (`xbutton.mligo`) and compiled Michelson (`xbutton.tz`). Compile contract and storage with Ligo, then originate with octez-client. Also **`counter-nac-tutorial.mligo`**: NAC tutorial counter — `ligo compile contract counter-nac-tutorial.mligo -m CounterNacTutorial > counter-nac-tutorial.tz`, then `octez-client originate` as in this README. |

## How it works

1. **Storage** — The contract holds:
   - `last_player` (**`address option`**): `None` after `start_session`, or `Some` Tezlink address for the last depositor (same identity CRAC uses for `SENDER` on **claim**).
   - `last_player_evm` (**`bytes option`**): `None` after `start_session`, or `Some` raw 20-byte EVM address of the last depositor (written by the relayer). Used for UI and for **`escrow.payout`** without scanning logs.
   - `pot` (nat), `session_end` (timestamp), `claim_requested` (bool), `payout_completed` (bool).

2. **Entrypoints**
   - **`start_session(duration)`** — Callable by **anyone**. Resets pot, clears `last_player` and `last_player_evm`, session end, and claim flags (including abandoning an in-flight claim that has not been paid out yet — demo reset). Use from the frontend (“Start new session” via CRAC) or octez-client.
   - **`record_deposit(player, player_evm, amount)`** — Parameter is **`address * bytes * nat`**: `player` is the Tezlink address from **`tez_getEthereumTezosAddress`** for the depositor; `player_evm` is the same 20 bytes as the EVM `Deposited` event’s `player`. Updates `last_player`, `last_player_evm`, and `pot`.
   - **`claim()`** — After the session ends, only **`Tezos.get_sender ()`** equal to the stored `last_player` may claim; otherwise **`NOT_LAST_PLAYER`**. Sets `claim_requested = true` so the relayer can run `escrow.payout` to `last_player_evm` and then `mark_paid`.
   - **`mark_paid()`** — Callable by anyone (guarded by `NO_CLAIM_REQUESTED` / `ALREADY_PAID`). Sets `payout_completed = true`.

3. **Init** — When originating you pass the initial storage (see step 2 below).

Tezlink RPC: `https://demo.txpark.nomadic-labs.com/rpc/tezlink`

---

## Ligo folder (`ligo/`)

- **Source:** `xbutton.mligo`
- **Compiled:** `xbutton.tz`

### 1. Compile the contract

```bash
cd ligo
ligo compile contract xbutton.mligo -m XButton > xbutton.tz
```

### 2. Compile the initial storage

```bash
ligo compile storage xbutton.mligo \
  '{ last_player = (None : address option);
     last_player_evm = (None : bytes option);
     pot = 0n;
     session_end = ("1970-01-01T00:00:00Z" : timestamp);
     claim_requested = false;
     payout_completed = false }' \
  -m XButton
```

Copy the output; you will paste it as `--init` in the next step.

### 3. Originate with octez-client

From the **`ligo/`** directory (so `running xbutton.tz` resolves):

```bash
octez-client --endpoint https://demo.txpark.nomadic-labs.com/rpc/tezlink \
  originate contract xbutton \
  transferring 0 from bootstrap1 \
  running xbutton.tz \
  --init '<PASTE_OUTPUT_OF_LIGO_COMPILE_STORAGE_HERE>' \
  --burn-cap 1 \
  --fee 0.05
```

Replace `<PASTE_OUTPUT_OF_LIGO_COMPILE_STORAGE_HERE>` with the exact output from step 2. Add `--force` if the alias `xbutton` already exists locally.

### Start a session (after origination)

**Option A — From the frontend:** After the previous session **ends**, the “Start new session” button appears (even if no one claimed yet, or claim is pending payout). Click it to call `start_session` via CRAC from your wallet.

**Option B — From octez-client (any key):**

```bash
octez-client --endpoint https://demo.txpark.nomadic-labs.com/rpc/tezlink \
  transfer 0 from tz1_ANY_KEY to <CONTRACT_ADDRESS> \
  --entrypoint start_session \
  --arg '3600' \
  --burn-cap 1
```

Replace `<CONTRACT_ADDRESS>` with your originated KT1. `3600` = 1 hour in seconds.

Set `GAME_KT1` / `VITE_GAME_CONTRACT` in the relayer and frontend to the new contract address.

---

## Related

- **`../../xbutton-relayer`** — Maps EVM depositors with `tez_getEthereumTezosAddress`, encodes `record_deposit` (address + EVM bytes + amount), pays escrow using `last_player_evm` from storage, calls `mark_paid`; needs `GAME_KT1`.
- **`../../xbutton-frontend`** — Polls Tezlink storage, shows game state (including EVM last player from storage), CRAC `claim` / `start_session`; needs `VITE_GAME_CONTRACT`.
- **`../../README.md`** — Workspace overview.
