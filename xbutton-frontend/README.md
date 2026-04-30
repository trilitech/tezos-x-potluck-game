# XButton Frontend

Minimal React + Vite frontend for the Tezos X cross-runtime XButton demo (EVM interface + Michelson game contract).

## What It Does

- Connects a browser wallet (EIP-1193 / `window.ethereum`) and checks network / chain ID.
- Polls **Michelson interface** (game contract) storage every few seconds and shows pot, session end, claim flags, and **current last player** (EVM address from contract **`last_player_evm`**).
- Sends **1 USDC** (configurable) to the EVM escrow and waits for **Michelson-side** storage to reflect the new pot.
- **Claim winnings**: after the session ends, uses **cross-runtime execution** (`claim` on the game contract via the EVM precompile gateway). A pre-check compares your connected wallet to the stored EVM last player (no extra wallet RPC before the transaction).
- **Start new session**: uses **cross-runtime execution** (`start_session`) when the UI allows it.

## What It Does Not Do

- It does not update Michelson contract storage by itself (the relayer does, via **cross-runtime execution** after each deposit).
- It does not replace the relayer.
- It does not run any backend.

The frontend only sends ERC-20 transfers and **cross-runtime gateway** calls. The relayer observes deposits and calls `record_deposit`.

## Configuration

Copy `.env.example` to `.env` and adjust as needed. All values use the `VITE_` prefix.

- `VITE_TEZOSX_NETWORK` – `testnet` or `previewnet`. **Previewnet** uses built-in Previewnet USDC / pot / KT1 in code (flip this one var only). **Testnet** uses `VITE_USDC_ADDRESS` / `VITE_POT_ADDRESS` / `VITE_GAME_CONTRACT`, then built-in testnet defaults.
- `VITE_PREVIEWNET_*` – optional overrides only if you redeploy Previewnet contracts
- `VITE_TESTNET_*` – optional second choice for testnet (after the classic trio)
- `VITE_CRAC_PRECOMPILE` – optional; defaults to the usual Tezos X CRAC precompile
- `VITE_EVM_RPC` – EVM RPC URL (EVM interface)
- `VITE_TEZLINK_RPC` – RPC URL used to read game contract storage (Michelson interface; demo testnet uses `…/rpc/tezlink`; Previewnet uses the Michelson host root, e.g. `https://michelson.previewnet.tezosx.nomadic-labs.com`)
- `VITE_CHAIN_ID` – Chain ID (e.g. `127124` testnet, `128064` Previewnet)
- `VITE_TZKT_API_URL` – Optional tzkt REST base (Previewnet: `https://api.previewnet.tezosx.tzkt.io`)
- `VITE_USDC_ADDRESS`, `VITE_POT_ADDRESS`, `VITE_GAME_CONTRACT` – used on **testnet** (optional; built-in testnet defaults if unset)

## Run Locally

```bash
cd xbutton-frontend
cp .env.example .env   # if .env doesn't exist
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm run preview
```

## Demo Requirements

- A browser wallet extension installed (any EIP-1193 provider)
- Wallet connected to the TezosX EVM network
- Chain ID set to `127124` (or your deployment)
- A wallet with enough USDC for the configured press amount
- The relayer running in `xbutton-relayer`
- An active session on the Tezos contract

If your wallet needs testnet USDC first, use the hosted TezosX EVM faucet: [https://tezosx-evm-usdc-airdrop.vercel.app/](https://tezosx-evm-usdc-airdrop.vercel.app/) (override via `VITE_FAUCET_URL` if needed).

## Related Folders

- `../xbutton-relayer` handles EVM-to-Michelson forwarding and payout after claim
- `../contracts/tezlink` contains the Michelson game contract (LIGO) source
- `../README.md` explains the full workspace flow
