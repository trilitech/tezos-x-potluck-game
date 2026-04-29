# After redeploying contracts

When you deploy new **USDC**, **escrow (pot)**, or **xButton (Tezlink)** contracts, local `.env` files are not enough—**Vercel**, **Render** (relayer), and the faucet app must be updated too.

## 1. Game frontend (Vercel)

In the Vercel project for the **game / xbutton frontend**, set or refresh these environment variables to match the new deployments:

| Variable | Role |
|----------|------|
| `VITE_POT_ADDRESS` | Escrow contract (pot) |
| `VITE_USDC_ADDRESS` | USDC token |
| `VITE_GAME_CONTRACT` | xButton game contract (KT1) |

Redeploy the Vercel project after changing env vars so the build picks them up.

> Full local wiring (relayer, `contracts/.env`, etc.) is documented in [deploy.md](./deploy.md) §6.

## 2. Relayer (Render)

In the **Render** service for **xbutton-relayer**, update environment variables to match the new on-chain addresses (same values as a local `xbutton-relayer/.env` would use):

| Variable | Role |
|----------|------|
| `USDC_ADDRESS` | USDC token |
| `POT_ADDRESS` | Escrow (pot) |
| `GAME_KT1` | xButton game contract (KT1) |

`EVM_RPC` and `TEZLINK_RPC` only change if you also switched networks or RPC endpoints. `CRAC_PRECOMPILE` and `RELAYER_PRIVATE_KEY` are usually unchanged; see [deploy.md](./deploy.md) §6 for the full set.

**Redeploy** or **restart** the Render service after updating envs so the process loads the new values.

## 3. Faucet / airdrop app (Vercel)

In the **separate** Vercel project for the **faucet / USDC airdrop** (e.g. [tezosx-evm-usdc-airdrop](https://tezosx-evm-usdc-airdrop.vercel.app/)), update the **USDC / airdrop token address** to the new `USDC` contract address. Use whatever variable name that app’s API uses for the token contract (often something like a token or USDC address).

Redeploy that app after the change so users still receive the correct test token.

---

**Checklist (copy when finishing a deploy):**

- [ ] Vercel game app: `VITE_POT_ADDRESS`, `VITE_USDC_ADDRESS`, `VITE_GAME_CONTRACT` — redeploy
- [ ] Render relayer: `USDC_ADDRESS`, `POT_ADDRESS`, `GAME_KT1` (and RPCs if the network changed) — redeploy or restart
- [ ] Vercel faucet/airdrop app: airdrop token = new USDC address — redeploy
