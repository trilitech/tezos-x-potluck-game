/**
 * Tezos X public stack presets (testnet vs previewnet).
 * Used by Hardhat and documented for relayer / frontend env.
 */
export type TezosXNetworkName = "testnet" | "previewnet";

export function normalizeTezosXNetwork(
  raw: string | undefined,
  fallback: TezosXNetworkName = "testnet",
): TezosXNetworkName {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "previewnet" || v === "preview") return "previewnet";
  if (v === "testnet" || v === "test") return "testnet";
  return fallback;
}

export const TEZOSX_NETWORK_PRESETS: Record<
  TezosXNetworkName,
  { evmRpc: string; chainId: number; tezlinkRpc: string }
> = {
  testnet: {
    evmRpc: "https://demo.txpark.nomadic-labs.com/rpc",
    chainId: 127124,
    tezlinkRpc: "https://demo.txpark.nomadic-labs.com/rpc/tezlink",
  },
  previewnet: {
    evmRpc: "https://evm.previewnet.tezosx.nomadic-labs.com",
    chainId: 128064,
    tezlinkRpc: "https://michelson.previewnet.tezosx.nomadic-labs.com",
  },
};

export function presetForNetwork(name: TezosXNetworkName) {
  return TEZOSX_NETWORK_PRESETS[name];
}
