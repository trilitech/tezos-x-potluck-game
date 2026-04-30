import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeTezosXNetwork } from "../networkPresets";

dotenv.config();

/**
 * Deploy `XButtonEscrow` against an existing USDC.
 *
 * Env (contracts/.env):
 *   USDC_ADDRESS          — required for this run
 *   DEPLOYER_PRIVATE_KEY — deployer; also becomes authorizedCaller on the escrow
 */
async function main() {
  const usdcAddress = process.env.USDC_ADDRESS?.trim();
  if (!usdcAddress) {
    throw new Error("Set USDC_ADDRESS in contracts/.env (e.g. 0x257De96BE880EF01894304701C4aF4ef08FCbF9a)");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Network:", (await ethers.provider.getNetwork()).name, "chainId", (await ethers.provider.getNetwork()).chainId);
  console.log("Deployer:", deployer.address);
  console.log("USDC:", usdcAddress);

  const code = await ethers.provider.getCode(usdcAddress);
  if (code === "0x") {
    throw new Error(`No contract bytecode at USDC_ADDRESS ${usdcAddress}`);
  }

  const Escrow = await ethers.getContractFactory("XButtonEscrow");
  const escrow = await Escrow.deploy(usdcAddress, deployer.address);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();

  console.log("\nXButtonEscrow deployed:", escrowAddr);
  console.log("\nSet in xbutton-frontend/.env:");
  console.log(`VITE_POT_ADDRESS=${escrowAddr}`);
  console.log(`VITE_USDC_ADDRESS=${usdcAddress}`);

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const stack = normalizeTezosXNetwork(process.env.TEZOSX_NETWORK);
  const slug = stack === "previewnet" ? "previewnet" : "testnet";
  const networkLabel = stack === "previewnet" ? "tezosxPreviewnet" : "tezosxTestnet";
  const payload = {
    network: networkLabel,
    usdc: usdcAddress,
    escrow: escrowAddr,
    authorizedCaller: deployer.address,
    deployedAt: new Date().toISOString(),
  };
  const slugPath = path.join(outDir, `${slug}-escrow.json`);
  fs.writeFileSync(slugPath, JSON.stringify(payload, null, 2));
  console.log("\nWrote", slugPath, `(TEZOSX_NETWORK=${stack})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
