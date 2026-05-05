import type { TezosXNetworkName } from "./tezosxNetworkPresets";

export const TEZOSX_EVM_TESTNET_NAME = "TezosX EVM Testnet";
export const TEZOSX_EVM_PREVIEWNET_NAME = "Tezos X Previewnet";

export function evmNetworkDisplayName(stack: TezosXNetworkName): string {
  return stack === "previewnet" ? TEZOSX_EVM_PREVIEWNET_NAME : TEZOSX_EVM_TESTNET_NAME;
}

export function stackShortLabel(stack: TezosXNetworkName): string {
  return stack === "previewnet" ? "Previewnet" : "Testnet";
}

export function walletAddNetworkHelpRabby(stack: TezosXNetworkName): string {
  return stack === "previewnet"
    ? "ensure “Custom network” is enabled, add the RPC from Network information"
    : "ensure “Custom network” / testnets are enabled, add the RPC from Network information";
}
