export type TezosXNetworkName = "testnet" | "previewnet";

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

const TEZOSX_NETWORK_MODAL_META: Record<
  TezosXNetworkName,
  {
    created: string;
    deployedBy: string;
    evmNodeVersion: string;
    smartRollupNode: string;
    rollupAddress: string;
    smartRollupNodeConfig: string;
    michelsonChainId: string | null;
  }
> = {
  testnet: {
    created: "2026-04-22 10:19:00 UTC",
    deployedBy: "foucaultaurelien",
    evmNodeVersion: "649d7e6a",
    smartRollupNode: "https://demo.txpark.nomadic-labs.com/rollup",
    rollupAddress: "sr1HHiXgJf4WBRBLzQ61ybLDbz5C5p3FeNzA",
    smartRollupNodeConfig: "https://demo.txpark.nomadic-labs.com/rollup/config",
    michelsonChainId: null,
  },
  previewnet: {
    created: "—",
    deployedBy: "—",
    evmNodeVersion: "—",
    smartRollupNode: "—",
    rollupAddress: "—",
    smartRollupNodeConfig: "—",
    michelsonChainId: "NetXY2oPPzkxUW1",
  },
};

export type NetworkInfoModalRuntime = {
  networkDisplayName: string;
  evmRpc: string;
  tezlinkRpc: string;
  chainId: bigint;
  evmExplorerUrl: string;
  tezosExplorerBase: string;
  dashboardUrl: string;
};

export function buildNetworkInfoModalRows(
  stack: TezosXNetworkName,
  r: NetworkInfoModalRuntime,
): { rows: [string, string][]; dashboardUrl: string } {
  const meta = TEZOSX_NETWORK_MODAL_META[stack];
  const chainLine = `${r.chainId} (0x${r.chainId.toString(16)})`;

  if (stack === "previewnet") {
    return {
      dashboardUrl: r.dashboardUrl,
      rows: [
        ["Network", r.networkDisplayName],
        ["EVM RPC", r.evmRpc],
        ["Michelson RPC", r.tezlinkRpc],
        ["EVM chain ID", chainLine],
        ["Michelson chain ID", meta.michelsonChainId ?? "—"],
        ["EVM block explorer", r.evmExplorerUrl],
        ["Michelson explorer (TzKT)", r.tezosExplorerBase],
      ],
    };
  }

  return {
    dashboardUrl: r.dashboardUrl,
    rows: [
      ["Network", r.networkDisplayName],
      ["Created", meta.created],
      ["Deployed by", meta.deployedBy],
      ["EVM node version", meta.evmNodeVersion],
      ["EVM RPC", r.evmRpc],
      ["Michelson RPC", r.tezlinkRpc],
      ["EVM chain ID", chainLine],
      ["Smart Rollup Node", meta.smartRollupNode],
      ["Rollup address", meta.rollupAddress],
      ["Smart Rollup node config", meta.smartRollupNodeConfig],
    ],
  };
}
