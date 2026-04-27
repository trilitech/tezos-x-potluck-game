import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const pk = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const tezosxRpc = process.env.TEZOSX_EVM_RPC ?? "https://demo.txpark.nomadic-labs.com/rpc";
const chainId = Number(process.env.TEZOSX_CHAIN_ID ?? "127124");

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
    tezosxTestnet: {
      url: tezosxRpc,
      chainId,
      accounts: pk ? [pk] : [],
    },
  },
};

export default config;
