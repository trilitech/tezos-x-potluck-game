import type { TezosXNetworkName } from "./tezosxNetworkPresets";

const HARDCODED_PREVIEWNET = {
  usdc: "0xd77420F73B4612a7A99DBA8c2AFd30a1886b0344",
  pot: "0x92E791DF3Dd5A8704f0e7d9B3003A0627d95d017",
  game: "KT1Dj2B1Wmz3vqaBzHhEZpjAhXu7CrQBEiy1",
} as const;

const HARDCODED_TESTNET = {
  usdc: "0x257De96BE880EF01894304701C4aF4ef08FCbF9a",
  pot: "0x1B3d06699aBE347D3b835D0DA32591B4644730C0",
  game: "KT1JKKK8tgWSsfz9yVxmffSEVahvSzncvvKZ",
} as const;

const DEFAULT_CRAC = "0xff00000000000000000000000000000000000007";

function firstNonEmpty(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return undefined;
}

/**
 * Previewnet: built-in Previewnet contract addresses (flip `VITE_TEZOSX_NETWORK` only). Optional
 * `VITE_PREVIEWNET_*` overrides if you redeploy. Does **not** read `VITE_USDC_*` so testnet values can stay in `.env`.
 *
 * Testnet: `VITE_USDC_ADDRESS` / `VITE_POT_ADDRESS` / `VITE_GAME_CONTRACT`, then optional `VITE_TESTNET_*`, then built-in testnet defaults.
 */
export function resolveFrontendContracts(
  stack: TezosXNetworkName,
  env: ImportMetaEnv,
): { usdc: string; pot: string; game: string; crac: string } {
  const crac =
    stack === "previewnet"
      ? firstNonEmpty(env.VITE_PREVIEWNET_CRAC_PRECOMPILE, env.VITE_CRAC_PRECOMPILE) ?? DEFAULT_CRAC
      : firstNonEmpty(env.VITE_TESTNET_CRAC_PRECOMPILE, env.VITE_CRAC_PRECOMPILE) ?? DEFAULT_CRAC;

  if (stack === "previewnet") {
    return {
      usdc: firstNonEmpty(env.VITE_PREVIEWNET_USDC_ADDRESS) ?? HARDCODED_PREVIEWNET.usdc,
      pot: firstNonEmpty(env.VITE_PREVIEWNET_POT_ADDRESS) ?? HARDCODED_PREVIEWNET.pot,
      game: firstNonEmpty(env.VITE_PREVIEWNET_GAME_CONTRACT) ?? HARDCODED_PREVIEWNET.game,
      crac,
    };
  }

  return {
    usdc: firstNonEmpty(env.VITE_TESTNET_USDC_ADDRESS, env.VITE_USDC_ADDRESS) ?? HARDCODED_TESTNET.usdc,
    pot: firstNonEmpty(env.VITE_TESTNET_POT_ADDRESS, env.VITE_POT_ADDRESS) ?? HARDCODED_TESTNET.pot,
    game: firstNonEmpty(env.VITE_TESTNET_GAME_CONTRACT, env.VITE_GAME_CONTRACT) ?? HARDCODED_TESTNET.game,
    crac,
  };
}
