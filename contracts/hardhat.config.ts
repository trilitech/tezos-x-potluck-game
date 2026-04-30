import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import { normalizeTezosXNetwork, presetForNetwork } from "./networkPresets";

dotenv.config();

const pk = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const stack = normalizeTezosXNetwork(process.env.TEZOSX_NETWORK);
const preset = presetForNetwork(stack);
const tezosxRpc = process.env.TEZOSX_EVM_RPC?.trim() || preset.evmRpc;
const chainId = process.env.TEZOSX_CHAIN_ID?.trim()
  ? Number(process.env.TEZOSX_CHAIN_ID)
  : preset.chainId;

const tezosxNetwork = {
  url: tezosxRpc,
  chainId,
  accounts: pk ? [pk] : [],
};

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: "./evm",
  },
  networks: {
    hardhat: {},
    localhost: { url: process.env.RPC_URL ?? "http://127.0.0.1:8545" },
    /** Tezos X EVM — URL and chain id follow `TEZOSX_NETWORK` unless overridden. */
    tezosx: tezosxNetwork,
    /** @deprecated Use `tezosx`; kept for existing scripts. */
    tezosxTestnet: tezosxNetwork,
  },
};

export default config;
