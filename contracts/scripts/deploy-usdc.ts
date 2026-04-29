import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

dotenv.config();

async function main() {
  const initialSupplyRaw = process.env.USDC_INITIAL_SUPPLY?.trim() || "1000000000000";
  const initialSupply = BigInt(initialSupplyRaw);

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "chainId", network.chainId);
  console.log("Deployer:", deployer.address);
  console.log("Initial supply (base units):", initialSupply.toString());

  const USDC = await ethers.getContractFactory("USDC");
  const usdc = await USDC.deploy(initialSupply);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();

  console.log("\nUSDC deployed:", usdcAddress);
  console.log("\nSet in contracts/.env:");
  console.log(`USDC_ADDRESS=${usdcAddress}`);
  console.log("\nSet in xbutton-frontend/.env:");
  console.log(`VITE_USDC_ADDRESS=${usdcAddress}`);

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "latest-usdc.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        network: "tezosxTestnet",
        usdc: usdcAddress,
        deployer: deployer.address,
        initialSupply: initialSupply.toString(),
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("\nWrote", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
