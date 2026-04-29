# Deploying XButton contracts on a new network

This repo’s demo uses **three** on-chain pieces:

| Piece | Location | What it is |
|-------|----------|------------|
| **xUSDC** | `evm/xUSDC.sol` (contract name `USDC`) | Test ERC-20 (6 decimals) for deposits |
| **xEscrow** | `evm/xEscrow.sol` (`XButtonEscrow`) | Holds the pot; `payout` is only for `authorizedCaller` |
| **xButton** | `tezlink/ligo/xbutton.tz` | Michelson game on Tezlink (CRAC + storage) |

Deploy **USDC → Escrow → Tezlink xButton**, then point `xbutton-frontend` and `xbutton-relayer` at the new addresses.

---

## 1. Prerequisites

- **Node** — from `contracts/`: `npm install`
- **EVM** — a funded deployer key on the target EVM (Tezos X) chain
- **Tezlink** — `ligo` (if you recompile), `octez-client`, and a **funded Tezos account** on the Tezlink endpoint (e.g. public demo uses `bootstrap1`-style keys; your network may differ)
- **Key alignment** — `scripts/deploy-escrow.ts` sets `authorizedCaller` on the escrow to the **EVM deployer** address. The relayer calls `payout`, so **`RELAYER_PRIVATE_KEY` in `xbutton-relayer/.env` must be the same key** as `DEPLOYER_PRIVATE_KEY` in `contracts/.env` (same `0x…` address), unless you later call `setAuthorizedCaller` on the escrow to a different relayer key.

---

## 2. Configure EVM (Hardhat)

Create or edit **`contracts/.env`** (not committed; keep keys private):

| Variable | Role |
|----------|------|
| `TEZOSX_EVM_RPC` | EVM JSON-RPC URL (same host as `eth_*`) |
| `TEZOSX_CHAIN_ID` | Chain id (decimal string) |
| `DEPLOYER_PRIVATE_KEY` | `0x…` private key; must match relayer if relayer pays out |
| `USDC_INITIAL_SUPPLY` | Optional; base units (default in script: `1000000000000`) |

Compile:

```bash
cd contracts
npm run compile
```

---

## 3. Deploy xUSDC

```bash
cd contracts
npx hardhat run scripts/deploy-usdc.ts --network tezosxTestnet
```

(For a local node, use `--network localhost` and set `RPC_URL` if needed.)

- Script writes **`deployments/latest-usdc.json`**
- Set in **`contracts/.env`**: `USDC_ADDRESS=<printed address>`
- You will reuse this for escrow and for app env (below)

---

## 4. Deploy xEscrow

`USDC_ADDRESS` must be set to the address from the previous step.

```bash
cd contracts
npx hardhat run scripts/deploy-escrow.ts --network tezosxTestnet
```

- Script writes **`deployments/latest-escrow.json`**
- Escrow address = **pot** = `POT_ADDRESS` in relayer / `VITE_POT_ADDRESS` in frontend

---

## 5. Originate xButton (Tezlink)

Source and compile steps (if you change LIGO) live in **`tezlink/README.md`**. Minimal path using the **checked-in** `xbutton.tz`:

1. `cd tezlink/ligo`
2. Originate with `octez-client`, pointing `--endpoint` at your **Tezlink** RPC (often `…/rpc/tezlink` on hosted stacks)
3. Initial storage (matches empty game — same idea as in `tezlink/README.md`):

   Use the `ligo compile storage …` output from the README, **or** the Michelson literal:

   `Pair (None) (Pair (None) (Pair 0 (Pair "1970-01-01T00:00:00Z" (Pair False False))))`

4. Use a contract script path `octez-client` can read, e.g. from `ligo/`:

   `running xbutton.tz`  

   If the client cannot open the file by relative path, use an absolute path:

   `running file:/absolute/path/to/contracts/tezlink/ligo/xbutton.tz`

5. Note the new **KT1** — that is `GAME_KT1` / `VITE_GAME_CONTRACT`

Update **`tezlink/deployments/latest-xbutton.json`** in git with the new KT1, op hash, and block when you want the repo to record a canonical deployment.

---

## 6. Wire the app and relayer

**`xbutton-frontend/.env`**

| Variable | Value |
|----------|--------|
| `VITE_EVM_RPC` | EVM RPC (must match how users’ wallets connect) |
| `VITE_TEZLINK_RPC` | Tezlink RPC base used for storage reads |
| `VITE_CHAIN_ID` | Same chain as `TEZOSX_CHAIN_ID` |
| `VITE_USDC_ADDRESS` | `USDC` deployment |
| `VITE_POT_ADDRESS` | `XButtonEscrow` deployment |
| `VITE_GAME_CONTRACT` | xButton KT1 |

**`xbutton-relayer/.env`**

| Variable | Value |
|----------|--------|
| `EVM_RPC` | Same EVM endpoint as the frontend’s `VITE_EVM_RPC` |
| `TEZLINK_RPC` | Same Tezlink endpoint used for the KT1 and storage |
| `USDC_ADDRESS` | Same as `VITE_USDC_ADDRESS` |
| `POT_ADDRESS` | Same as `VITE_POT_ADDRESS` |
| `GAME_KT1` | Same as `VITE_GAME_CONTRACT` |
| `CRAC_PRECOMPILE` | Network’s CRAC precompile (demo default in `.env.example`) |
| `RELAYER_PRIVATE_KEY` | Same key as EVM `DEPLOYER_PRIVATE_KEY` if escrow `authorizedCaller` is the deployer |

**Optional: keep `contracts/.env` in sync** (`USDC_ADDRESS`, `POT_ADDRESS`, `GAME_KT1`) so one-off `hardhat` runs stay consistent.

---

## 7. Smoke checks

- EVM: `eth_getCode` on USDC and escrow addresses returns non-empty bytecode
- Tezlink: `GET .../context/contracts/<KT1>/storage` on your Tezlink RPC returns storage JSON
- Start relayer and frontend; run a test deposit and confirm Tezlink `pot` / `last_player` update as in the main workspace README

---

## Not in the XButton app path

- `tezlink/ligo/counter-nac-tutorial.*` — NAC **tutorial** counter only; not used by this escrow/relayer/frontend stack
