import type { TezosXNetworkName } from "./tezosxNetworkPresets";

/** Shown in wallets (`wallet_addEthereumChain`) and wrong-network UI. */
export const TEZOSX_EVM_TESTNET_NAME = "TezosX EVM Testnet";
export const TEZOSX_EVM_PREVIEWNET_NAME = "Tezos X Previewnet";

export function evmNetworkDisplayName(stack: TezosXNetworkName): string {
  return stack === "previewnet" ? TEZOSX_EVM_PREVIEWNET_NAME : TEZOSX_EVM_TESTNET_NAME;
}
