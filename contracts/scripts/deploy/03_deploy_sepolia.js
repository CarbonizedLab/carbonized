const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  console.log("🚀 Starting Sepolia deployment...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📍 Deploying from:", deployer.address);
  console.log("💰 Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Chainlink Sepolia configuration
  const FUNCTIONS_ROUTER = process.env.CHAINLINK_ROUTER_SEPOLIA || "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0";
  const DON_ID = hre.ethers.encodeBytes32String(process.env.CHAINLINK_DON_ID || "fun-ethereum-sepolia-1");
  const SUBSCRIPTION_ID = process.env.CHAINLINK_SUBSCRIPTION_ID || 0;

  console.log("🔗 Chainlink Configuration:");
  console.log("   Functions Router:", FUNCTIONS_ROUTER);
  console.log("   DON ID:", process.env.CHAINLINK_DON_ID || "fun-ethereum-sepolia-1");
  console.log("   Subscription ID:", SUBSCRIPTION_ID, "\n");

  const deployments = {};

  // ============ DEPLOY CORE CONTRACTS ============
  console.log("📝 [1/6] Deploying CarbonCreditNFT...");
  const CarbonCreditNFT = await hre.ethers.getContractFactory("CarbonCreditNFT");
  const nft = await CarbonCreditNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log("✅ CarbonCreditNFT deployed to:", nftAddress);
  deployments.CarbonCreditNFT = nftAddress;

  console.log("\n📝 [2/6] Deploying CarbonCreditTokens...");
  const methodologies = [
    { name: "Carbonized Credit - ICM", symbol: "CCT-ICM", type: "ICM_COMPLIANCE" },
    { name: "Carbonized Credit - Verra", symbol: "CCT-VCS", type: "VERRA_VCS" },
    { name: "Carbonized Credit - Gold Standard", symbol: "CCT-GS", type: "GOLD_STANDARD" },
  ];

  const CarbonCreditToken = await hre.ethers.getContractFactory("CarbonCreditToken");
  deployments.CarbonCreditTokens = {};

  for (const method of methodologies) {
    const token = await CarbonCreditToken.deploy(method.name, method.symbol, nftAddress, method.type);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log(`✅ ${method.symbol} deployed to:`, tokenAddress);
    deployments.CarbonCreditTokens[method.type] = tokenAddress;
    
    // Wait for block confirmations
    await token.deploymentTransaction().wait(2);
  }

  // Deploy Mock USDC for Sepolia (official USDC not available on Sepolia)
  console.log("\n💵 Deploying Mock USDC for Sepolia...");
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
  await mockUSDC.waitForDeployment();
  const usdcAddress = await mockUSDC.getAddress();
  console.log("✅ Mock USDC deployed to:", usdcAddress);
  deployments.USDC = usdcAddress;
  
  // Mint initial USDC for testing
  const mintAmount = hre.ethers.parseUnits("100000", 6); // 100k USDC
  await mockUSDC.mint(deployer.address, mintAmount);
  console.log("✅ Minted 100,000 USDC to deployer for testing");
  await mockUSDC.deploymentTransaction().wait(2);

  console.log("\n📝 [3/6] Deploying CarbonMarketplace...");
  const CarbonMarketplace = await hre.ethers.getContractFactory("CarbonMarketplace");
  const marketplace = await CarbonMarketplace.deploy(
    usdcAddress,
    deployments.CarbonCreditTokens.VERRA_VCS,
    nftAddress
  );
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log("✅ CarbonMarketplace deployed to:", marketplaceAddress);
  deployments.CarbonMarketplace = marketplaceAddress;
  await marketplace.deploymentTransaction().wait(2);

  // ============ DEPLOY ORACLE CONTRACTS ============
  console.log("\n📝 [4/6] Deploying Oracle Infrastructure...");

  const EmissionVerifier = await hre.ethers.getContractFactory("EmissionVerifier");
  const verifier = await EmissionVerifier.deploy(FUNCTIONS_ROUTER, nftAddress);
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("✅ EmissionVerifier deployed to:", verifierAddress);
  deployments.EmissionVerifier = verifierAddress;
  await verifier.deploymentTransaction().wait(2);

  const RegistrySync = await hre.ethers.getContractFactory("RegistrySync");
  const registrySync = await RegistrySync.deploy(FUNCTIONS_ROUTER, nftAddress);
  await registrySync.waitForDeployment();
  const registrySyncAddress = await registrySync.getAddress();
  console.log("✅ RegistrySync deployed to:", registrySyncAddress);
  deployments.RegistrySync = registrySyncAddress;
  await registrySync.deploymentTransaction().wait(2);

  const CarbonPriceOracle = await hre.ethers.getContractFactory("CarbonPriceOracle");
  const priceOracle = await CarbonPriceOracle.deploy(FUNCTIONS_ROUTER);
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();
  console.log("✅ CarbonPriceOracle deployed to:", priceOracleAddress);
  deployments.CarbonPriceOracle = priceOracleAddress;
  await priceOracle.deploymentTransaction().wait(2);

  // ============ CONFIGURE CHAINLINK ============
  console.log("\n📝 [5/6] Configuring Chainlink Functions...");

  if (SUBSCRIPTION_ID > 0) {
    try {
      await verifier.setFunctionsConfig(DON_ID, SUBSCRIPTION_ID, 300000);
      console.log("✅ Configured EmissionVerifier");

      await registrySync.setFunctionsConfig(DON_ID, SUBSCRIPTION_ID, 200000);
      console.log("✅ Configured RegistrySync");

      await priceOracle.setFunctionsConfig(DON_ID, SUBSCRIPTION_ID, 250000);
      console.log("✅ Configured CarbonPriceOracle");
      
      console.log("\n⚠️  IMPORTANT: Add these consumer contracts to your Chainlink subscription:");
      console.log("   - EmissionVerifier:", verifierAddress);
      console.log("   - RegistrySync:", registrySyncAddress);
      console.log("   - CarbonPriceOracle:", priceOracleAddress);
      console.log("\n   Visit: https://functions.chain.link/sepolia");
    } catch (error) {
      console.log("⚠️  WARNING: Could not configure Chainlink Functions:", error.message);
      console.log("   You may need to configure them manually after adding contracts to subscription");
    }
  } else {
    console.log("⚠️  WARNING: CHAINLINK_SUBSCRIPTION_ID not set. Oracle functions will not work.");
    console.log("   Create a subscription at https://functions.chain.link/sepolia");
  }

  // ============ CONFIGURE ROLES ============
  console.log("\n📝 [6/6] Configuring roles...");

  const NATIVE_ISSUER_ROLE = await nft.NATIVE_ISSUER_ROLE();
  await nft.grantRole(NATIVE_ISSUER_ROLE, verifierAddress);
  console.log("✅ Granted NATIVE_ISSUER_ROLE to EmissionVerifier");

  // ============ SAVE DEPLOYMENT DATA ============
  const deploymentData = {
    network: "sepolia",
    chainId: 11155111,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    chainlink: {
      functionsRouter: FUNCTIONS_ROUTER,
      donId: process.env.CHAINLINK_DON_ID || "fun-ethereum-sepolia-1",
      subscriptionId: SUBSCRIPTION_ID,
    },
    contracts: deployments,
  };

  const deploymentPath = path.join(__dirname, "../../deployments");
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }

  fs.writeFileSync(
    path.join(deploymentPath, "sepolia.json"),
    JSON.stringify(deploymentData, null, 2)
  );

  console.log("\n✅ Sepolia deployment complete!");
  console.log("📄 Deployment data saved to deployments/sepolia.json");
  console.log("\n📋 Contract Addresses:");
  console.log(JSON.stringify(deployments, null, 2));
  
  console.log("\n📝 Next Steps:");
  console.log("1. Update frontend/.env.local with these contract addresses");
  console.log("2. Add consumer contracts to your Chainlink subscription at https://functions.chain.link/sepolia");
  console.log("3. Fund contracts with LINK for Chainlink Functions (0.1-1 LINK per contract)");
  console.log("4. Verify contracts with: npx hardhat verify --network sepolia <address>");
  console.log("\n🔍 Etherscan:");
  console.log("   https://sepolia.etherscan.io/address/" + marketplaceAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
