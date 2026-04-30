import type { TezosXNetworkName } from "./tezosxNetworkPresets";

function firstNonEmpty(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return undefined;
}

function missingContractEnvMessage(
  stack: TezosXNetworkName,
  kind: "usdc" | "pot" | "game",
): string {
  if (stack === "previewnet") {
    const map = {
      usdc: "VITE_PREVIEWNET_USDC_ADDRESS (or legacy VITE_USDC_ADDRESS)",
      pot: "VITE_PREVIEWNET_POT_ADDRESS (or legacy VITE_POT_ADDRESS)",
      game: "VITE_PREVIEWNET_GAME_CONTRACT (or legacy VITE_GAME_CONTRACT)",
    } as const;
    return map[kind];
  }
  const map = {
    usdc: "VITE_TESTNET_USDC_ADDRESS (or legacy VITE_USDC_ADDRESS)",
    pot: "VITE_TESTNET_POT_ADDRESS (or legacy VITE_POT_ADDRESS)",
    game: "VITE_TESTNET_GAME_CONTRACT (or legacy VITE_GAME_CONTRACT)",
  } as const;
  return map[kind];
}

/**
 * Resolves USDC / escrow / game / CRAC from env only (no baked-in contract addresses).
 * Stack-specific vars win over legacy `VITE_USDC_ADDRESS` / `VITE_POT_ADDRESS` / `VITE_GAME_CONTRACT`.
 */
export function resolveFrontendContracts(
  stack: TezosXNetworkName,
  env: ImportMetaEnv,
): { usdc: string; pot: string; game: string; crac: string } {
  if (stack === "previewnet") {
    const usdc = firstNonEmpty(env.VITE_PREVIEWNET_USDC_ADDRESS, env.VITE_USDC_ADDRESS);
    const pot = firstNonEmpty(env.VITE_PREVIEWNET_POT_ADDRESS, env.VITE_POT_ADDRESS);
    const game = firstNonEmpty(env.VITE_PREVIEWNET_GAME_CONTRACT, env.VITE_GAME_CONTRACT);
    const crac = firstNonEmpty(env.VITE_PREVIEWNET_CRAC_PRECOMPILE, env.VITE_CRAC_PRECOMPILE);
    if (!usdc) {
      throw new Error(
        `Missing USDC address for previewnet. Set ${missingContractEnvMessage(stack, "usdc")} in .env (see .env.example).`,
      );
    }
    if (!pot) {
      throw new Error(
        `Missing escrow (pot) address for previewnet. Set ${missingContractEnvMessage(stack, "pot")} in .env.`,
      );
    }
    if (!game) {
      throw new Error(
        `Missing game contract for previewnet. Set ${missingContractEnvMessage(stack, "game")} in .env.`,
      );
    }
    if (!crac) {
      throw new Error(
        "Missing CRAC precompile address. Set VITE_PREVIEWNET_CRAC_PRECOMPILE or VITE_CRAC_PRECOMPILE in .env.",
      );
    }
    return { usdc, pot, game, crac };
  }

  const usdc = firstNonEmpty(env.VITE_TESTNET_USDC_ADDRESS, env.VITE_USDC_ADDRESS);
  const pot = firstNonEmpty(env.VITE_TESTNET_POT_ADDRESS, env.VITE_POT_ADDRESS);
  const game = firstNonEmpty(env.VITE_TESTNET_GAME_CONTRACT, env.VITE_GAME_CONTRACT);
  const crac = firstNonEmpty(env.VITE_TESTNET_CRAC_PRECOMPILE, env.VITE_CRAC_PRECOMPILE);
  if (!usdc) {
    throw new Error(
      `Missing USDC address for testnet. Set ${missingContractEnvMessage(stack, "usdc")} in .env (see .env.example).`,
    );
  }
  if (!pot) {
    throw new Error(`Missing escrow (pot) address for testnet. Set ${missingContractEnvMessage(stack, "pot")} in .env.`);
  }
  if (!game) {
    throw new Error(`Missing game contract for testnet. Set ${missingContractEnvMessage(stack, "game")} in .env.`);
  }
  if (!crac) {
    throw new Error(
      "Missing CRAC precompile address. Set VITE_TESTNET_CRAC_PRECOMPILE or VITE_CRAC_PRECOMPILE in .env.",
    );
  }
  return { usdc, pot, game, crac };
}
