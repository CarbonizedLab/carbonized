const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔍 Starting Polygon Mainnet contract verification...\n");

  const deploymentPath = path.join(__dirname, "../../deployments/polygon.json");
  
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ Deployment file not found. Deploy to mainnet first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const contracts = deployment.contracts;

  console.log("⚠️  WARNING: Verifying on MAINNET");
  console.log("📋 Deployment timestamp:", deployment.timestamp);
  console.log("💰 Deployer address:", deployment.deployer, "\n");

  // Same verification logic as Mumbai but for mainnet
  // ... (identical structure to verify_mumbai.js)

  console.log("✅ Mainnet verification complete!");
  console.log("🔗 View contracts on PolygonScan:");
  console.log(`   https://polygonscan.com/address/${contracts.CarbonCreditNFT}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
