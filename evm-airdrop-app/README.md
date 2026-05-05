## Tezos X EVM Faucet

Single-page Next.js **faucet** app: sends a fixed USDC or XTZ amount to any valid EVM address entered in the UI.

The browser only submits the recipient address. The actual transaction is created and broadcast on the server using private keys stored in environment variables.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` or `.env`.
3. Fill in your funded private keys in `AIRDROP_PRIVATE_KEYS`.
4. Set `AIRDROP_TOKEN_ADDRESS` to your USDC token contract.
5. Adjust `AIRDROP_AMOUNT` and `NATIVE_AIRDROP_AMOUNT` if you want different fixed payout amounts.
6. Start the app:

```bash
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Running The App

From the project directory:

```bash
cd evm-airdrop-app
npm install
npm run dev
```

For a production run:

```bash
npm run build
npm run start
```

The app serves the faucet UI on `http://localhost:3000` by default.

## Environment Variables

```bash
EVM_RPC=https://demo.txpark.nomadic-labs.com/rpc
AIRDROP_PRIVATE_KEYS=0xabc...,0xdef...
AIRDROP_TOKEN_ADDRESS=0x...
AIRDROP_TOKEN_SYMBOL=USDC
AIRDROP_TOKEN_DECIMALS=6
AIRDROP_AMOUNT=10
NATIVE_AIRDROP_SYMBOL=XTZ
NATIVE_AIRDROP_AMOUNT=5
AIRDROP_GAS_RESERVE=0.001
EXPLORER_TX_URL_BASE=

NEXT_PUBLIC_NETWORK_NAME="Tezos X EVM Faucet"
NEXT_PUBLIC_NETWORK_SUBTITLE="Tezos X Testnet Faucet"
NEXT_PUBLIC_EVM_RPC=https://demo.txpark.nomadic-labs.com/rpc
NEXT_PUBLIC_AIRDROP_AMOUNT=10
NEXT_PUBLIC_AIRDROP_TOKEN_SYMBOL=USDC
NEXT_PUBLIC_NATIVE_AIRDROP_AMOUNT=5
NEXT_PUBLIC_NATIVE_AIRDROP_SYMBOL=XTZ
```

## Notes

- `AIRDROP_PRIVATE_KEYS` can contain multiple comma-separated or newline-separated private keys.
- The UI exposes a clear asset selector so users can choose between `USDC` and `XTZ` while using one shared wallet input.
- The API route chooses the first configured wallet with enough balance to cover the selected payout and native gas.
- The default setup assumes USDC uses `6` decimals. Change `AIRDROP_TOKEN_DECIMALS` if your token differs.
- Add `EXPLORER_TX_URL_BASE` if you want the success state to include a transaction link.

## API

`POST /api/airdrop`

Legacy single-asset request:

```json
{
  "walletAddress": "0x...",
  "asset": "usdc"
}
```

Multi-asset request:

```json
{
  "walletAddress": "0x...",
  "xtz": true,
  "usdc": true
}
```

Notes:

- Pass `xtz: true` to send the default native XTZ amount from `NATIVE_AIRDROP_AMOUNT`.
- Pass `usdc: true` to send the default USDC amount from `AIRDROP_AMOUNT`.
- Pass both flags as `true` to airdrop both assets in one API call.
- If neither flag is provided, the route falls back to the existing fixed-amount `asset` behavior.
- Successful responses now include a `transfers` array with one entry per broadcast transaction, plus the legacy top-level `txHash`, `amount`, and `explorerUrl` fields for compatibility.

## Security

Do not expose your private keys through `NEXT_PUBLIC_*` variables. Only keep them in server-only env vars such as `AIRDROP_PRIVATE_KEYS`.
