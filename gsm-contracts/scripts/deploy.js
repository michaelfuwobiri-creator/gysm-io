// Deploys GSMCredit behind a UUPS proxy on Base Sepolia.
// YOU run this with YOUR key in .env (PRIVATE_KEY). Testnet only.
//   ADMIN_ADDRESS    multisig (or your wallet for the testnet only)
//   TREASURY_ADDRESS receives the initial supply
//   INITIAL_SUPPLY   whole tokens, e.g. 1000000000
const { ethers, upgrades, network } = require("hardhat");

async function main() {
  if (network.name !== "baseSepolia") {
    throw new Error("Refusing to run on " + network.name + ". Phase 0 is Base Sepolia only.");
  }
  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  const supply = ethers.parseUnits(process.env.INITIAL_SUPPLY || "1000000000", 18);

  console.log("Deployer :", deployer.address);
  console.log("Admin    :", admin);
  console.log("Treasury :", treasury);
  console.log("Supply   :", supply.toString());

  const F = await ethers.getContractFactory("GSMCredit");
  const proxy = await upgrades.deployProxy(F, [admin, treasury, supply], { kind: "uups" });
  await proxy.waitForDeployment();

  const proxyAddr = await proxy.getAddress();
  const implAddr = await upgrades.erc1967.getImplementationAddress(proxyAddr);
  console.log("\nGSM proxy (the token address users see):", proxyAddr);
  console.log("Implementation:", implAddr);
  console.log("\nVerify:  npx hardhat verify --network baseSepolia " + implAddr);
}

main().catch((e) => { console.error(e); process.exit(1); });
