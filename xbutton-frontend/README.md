# Potluck Game Frontend

Minimal React + Vite frontend for the Tezos X cross-runtime Potluck game demo on Previewnet.

## What It Does

- Connects a browser wallet through `window.ethereum` / EIP-1193 and checks the Tezos X Previewnet network.
- Polls Michelson-interface game storage and shows pot, session end, claim flags, and the current last player from `last_player_evm`.
- Sends `1 USDC` (configurable) to the EVM escrow and waits for Michelson-side storage to reflect the updated pot.
- Claims winnings after the session ends through the Tezos X NAC precompile gateway.
- Starts a new session through the same cross-interface gateway flow when the UI allows it.

## What It Does Not Do

- It does not update Michelson contract storage by itself.
- It does not replace the relayer.
- It does not run any backend.

The frontend only sends ERC-20 transfers and cross-interface gateway calls. The relayer observes deposits and calls `record_deposit`.

## Configuration

Copy `.env.example` to `.env` and adjust as needed. All values use the `VITE_` prefix.

- `VITE_TEZOSX_NETWORK` – `testnet` or `previewnet`. Previewnet uses built-in Previewnet RPC and contract defaults.
- `VITE_PREVIEWNET_*` – optional overrides only if you redeploy Previewnet contracts
- `VITE_TESTNET_*` – optional second choice for testnet (after the classic trio)
- `VITE_CRAC_PRECOMPILE` – optional; defaults to the usual Tezos X NAC precompile
- `VITE_EVM_RPC` – EVM RPC URL. Previewnet default: `https://evm.previewnet.tezosx.nomadic-labs.com`
- `VITE_TEZLINK_RPC` – Michelson RPC used to read game storage. Previewnet default: `https://michelson.previewnet.tezosx.nomadic-labs.com`
- `VITE_CHAIN_ID` – Chain ID. Previewnet default in this app is `128064`
- `VITE_TZKT_API_URL` – Optional TzKT REST base. Previewnet default: `https://api.previewnet.tezosx.tzkt.io`
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

## Previewnet References

- Previewnet dashboard: [https://previewnet.tezosx.nomadic-labs.com/](https://previewnet.tezosx.nomadic-labs.com/)
- EVM RPC: `https://evm.previewnet.tezosx.nomadic-labs.com`
- Michelson RPC: `https://michelson.previewnet.tezosx.nomadic-labs.com`
- EVM explorer: [https://blockscout.previewnet.tezosx.nomadic-labs.com](https://blockscout.previewnet.tezosx.nomadic-labs.com)
- Michelson explorer / TzKT: [https://tzkt.previewnet.tezosx.nomadic-labs.com](https://tzkt.previewnet.tezosx.nomadic-labs.com)
- Faucet: [https://faucet.previewnet.tezosx.nomadic-labs.com](https://faucet.previewnet.tezosx.nomadic-labs.com)
- Bridge: [https://bridge.previewnet.tezosx.nomadic-labs.com](https://bridge.previewnet.tezosx.nomadic-labs.com)

## Demo Requirements

- A browser wallet extension installed
- Wallet connected to the Tezos X Previewnet EVM network
- A wallet with enough USDC for the configured press amount
- The relayer running in `xbutton-relayer`
- An active session on the Michelson contract

If your wallet needs XTZ first, use the Previewnet faucet: [https://faucet.previewnet.tezosx.nomadic-labs.com](https://faucet.previewnet.tezosx.nomadic-labs.com).

## Related Folders

- `../xbutton-relayer` handles EVM-to-Michelson forwarding and payout after claim
- `../contracts/tezlink` contains the Michelson game contract (LIGO) source
- `../README.md` explains the full workspace flow
