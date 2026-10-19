const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔍 Starting Mumbai contract verification...\n");

  // Load deployment data
  const deploymentPath = path.join(__dirname, "../../deployments/mumbai.json");
  
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ Deployment file not found. Deploy contracts first with: npm run deploy:mumbai");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const contracts = deployment.contracts;

  console.log("📋 Loaded deployment from:", deploymentPath);
  console.log("🌐 Network:", deployment.network);
  console.log("⛓️  Chain ID:", deployment.chainId, "\n");

  // ============ VERIFY CARBONCREDITNFT ============
  console.log("🔍 [1/6] Verifying CarbonCreditNFT...");
  try {
    await hre.run("verify:verify", {
      address: contracts.CarbonCreditNFT,
      constructorArguments: [],
      contract: "contracts/core/CarbonCreditNFT.sol:CarbonCreditNFT",
    });
    console.log("✅ CarbonCreditNFT verified\n");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ CarbonCreditNFT already verified\n");
    } else {
      console.error("❌ Error:", error.message, "\n");
    }
  }

  // ============ VERIFY CARBONCREDITTOKENS ============
  console.log("🔍 [2/6] Verifying CarbonCreditTokens...");
  
  const methodologies = [
    { name: "Carbonized Credit - ICM", symbol: "CCT-ICM", type: "ICM_COMPLIANCE" },
    { name: "Carbonized Credit - Verra", symbol: "CCT-VCS", type: "VERRA_VCS" },
    { name: "Carbonized Credit - Gold Standard", symbol: "CCT-GS", type: "GOLD_STANDARD" },
  ];

  for (const method of methodologies) {
    try {
      await hre.run("verify:verify", {
        address: contracts.CarbonCreditTokens[method.type],
        constructorArguments: [
          method.name,
          method.symbol,
          contracts.CarbonCreditNFT,
          method.type,
        ],
        contract: "contracts/core/CarbonCreditToken.sol:CarbonCreditToken",
      });
      console.log(`✅ ${method.symbol} verified`);
    } catch (error) {
      if (error.message.includes("Already Verified")) {
        console.log(`✅ ${method.symbol} already verified`);
      } else {
        console.error(`❌ Error for ${method.symbol}:`, error.message);
      }
    }
  }
  console.log();

  // ============ VERIFY MARKETPLACE ============
  console.log("🔍 [3/6] Verifying CarbonMarketplace...");
  try {
    await hre.run("verify:verify", {
      address: contracts.CarbonMarketplace,
      constructorArguments: [
        contracts.USDC,
        contracts.CarbonCreditTokens.VERRA_VCS,
        contracts.CarbonCreditNFT,
      ],
      contract: "contracts/core/CarbonMarketplace.sol:CarbonMarketplace",
    });
    console.log("✅ CarbonMarketplace verified\n");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ CarbonMarketplace already verified\n");
    } else {
      console.error("❌ Error:", error.message, "\n");
    }
  }

  // ============ VERIFY EMISSIONVERIFIER ============
  console.log("🔍 [4/6] Verifying EmissionVerifier...");
  try {
    await hre.run("verify:verify", {
      address: contracts.EmissionVerifier,
      constructorArguments: [
        deployment.chainlink.functionsRouter,
        contracts.CarbonCreditNFT,
      ],
      contract: "contracts/oracle/EmissionVerifier.sol:EmissionVerifier",
    });
    console.log("✅ EmissionVerifier verified\n");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ EmissionVerifier already verified\n");
    } else {
      console.error("❌ Error:", error.message, "\n");
    }
  }

  // ============ VERIFY REGISTRYSYNC ============
  console.log("🔍 [5/6] Verifying RegistrySync...");
  try {
    await hre.run("verify:verify", {
      address: contracts.RegistrySync,
      constructorArguments: [
        deployment.chainlink.functionsRouter,
        contracts.CarbonCreditNFT,
      ],
      contract: "contracts/oracle/RegistrySync.sol:RegistrySync",
    });
    console.log("✅ RegistrySync verified\n");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ RegistrySync already verified\n");
    } else {
      console.error("❌ Error:", error.message, "\n");
    }
  }

  // ============ VERIFY CARBONPRICEORACLE ============
  console.log("🔍 [6/6] Verifying CarbonPriceOracle...");
  try {
    await hre.run("verify:verify", {
      address: contracts.CarbonPriceOracle,
      constructorArguments: [deployment.chainlink.functionsRouter],
      contract: "contracts/oracle/CarbonPriceOracle.sol:CarbonPriceOracle",
    });
    console.log("✅ CarbonPriceOracle verified\n");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ CarbonPriceOracle already verified\n");
    } else {
      console.error("❌ Error:", error.message, "\n");
    }
  }

  console.log("✅ Verification complete!");
  console.log("🔗 View contracts on PolygonScan Mumbai:");
  console.log(`   https://mumbai.polygonscan.com/address/${contracts.CarbonCreditNFT}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
