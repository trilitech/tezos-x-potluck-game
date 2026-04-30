export type TezosXNetworkName = "testnet" | "previewnet";

/** Canonical public endpoints and chain id per stack. */
export const TEZOSX_FRONTEND_PRESETS: Record<
  TezosXNetworkName,
  {
    evmRpc: string;
    tezlinkRpc: string;
    chainId: string;
    evmExplorerUrl: string;
    tezosExplorerBase: string;
    tzktApiUrl: string;
    faucetUrl: string;
    dashboardUrl: string;
  }
> = {
  testnet: {
    evmRpc: "https://demo.txpark.nomadic-labs.com/rpc",
    tezlinkRpc: "https://demo.txpark.nomadic-labs.com/rpc/tezlink",
    chainId: "127124",
    evmExplorerUrl: "https://demo-blockscout.txpark.nomadic-labs.com",
    tezosExplorerBase: "https://sandbox.tezlink.tzkt.io",
    tzktApiUrl: "https://demo.txpark.nomadic-labs.com/tzkt",
    faucetUrl: "https://demo-faucet.txpark.nomadic-labs.com/",
    dashboardUrl: "https://demo.txpark.nomadic-labs.com/",
  },
  previewnet: {
    evmRpc: "https://evm.previewnet.tezosx.nomadic-labs.com",
    tezlinkRpc: "https://michelson.previewnet.tezosx.nomadic-labs.com",
    chainId: "128064",
    evmExplorerUrl: "https://blockscout.previewnet.tezosx.nomadic-labs.com",
    tezosExplorerBase: "https://previewnet.tezosx.tzkt.io",
    tzktApiUrl: "https://api.previewnet.tezosx.tzkt.io",
    faucetUrl: "https://demo-faucet.txpark.nomadic-labs.com/",
    dashboardUrl: "https://previewnet.tezosx.tzkt.io",
  },
};

export function normalizeTezosXNetwork(
  raw: string | undefined,
  fallback: TezosXNetworkName = "testnet",
): TezosXNetworkName {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "previewnet" || v === "preview") return "previewnet";
  if (v === "testnet" || v === "test") return "testnet";
  return fallback;
}
