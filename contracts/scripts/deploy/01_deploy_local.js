const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting local deployment...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📍 Deploying from:", deployer.address);
  console.log("💰 Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

  const deployments = {};

  // ============ STEP 1: Deploy Core NFT Contract ============
  console.log("📝 [1/6] Deploying CarbonCreditNFT...");
  const CarbonCreditNFT = await hre.ethers.getContractFactory("CarbonCreditNFT");
  const nft = await CarbonCreditNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log("✅ CarbonCreditNFT deployed to:", nftAddress);
  deployments.CarbonCreditNFT = nftAddress;

  // ============ STEP 2: Deploy ERC-20 Token (Multiple Methodologies) ============
  console.log("\n📝 [2/6] Deploying CarbonCreditTokens...");
  
  const methodologies = [
    { name: "Carbonized Credit - ICM", symbol: "CCT-ICM", type: "ICM_COMPLIANCE" },
    { name: "Carbonized Credit - Verra", symbol: "CCT-VCS", type: "VERRA_VCS" },
    { name: "Carbonized Credit - Gold Standard", symbol: "CCT-GS", type: "GOLD_STANDARD" },
  ];

  const CarbonCreditToken = await hre.ethers.getContractFactory("CarbonCreditToken");
  deployments.CarbonCreditTokens = {};

  for (const method of methodologies) {
    const token = await CarbonCreditToken.deploy(
      method.name,
      method.symbol,
      nftAddress,
      method.type
    );
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log(`✅ ${method.symbol} deployed to:`, tokenAddress);
    deployments.CarbonCreditTokens[method.type] = tokenAddress;
  }

  // ============ STEP 3: Deploy Mock USDC (for testing) ============
  console.log("\n📝 [3/6] Deploying Mock USDC...");
  const MockUSDC = await hre.ethers.getContractFactory("MockERC20");
  const usdc = await MockUSDC.deploy("USD Coin", "USDC", 18); // 18 decimals for testing (marketplace expects 18)
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("✅ Mock USDC deployed to:", usdcAddress);
  deployments.MockUSDC = usdcAddress;

  // Mint test USDC to first 10 accounts (so any test wallet can buy credits)
  const signers = await hre.ethers.getSigners();
  const mintPerAccount = hre.ethers.parseUnits("100000", 18); // 100k USDC each
  for (let i = 0; i < Math.min(10, signers.length); i++) {
    await usdc.mint(signers[i].address, mintPerAccount);
    console.log(`💵 Minted 100,000 USDC to account ${i}: ${signers[i].address.slice(0, 10)}...`);
  }

  // ============ STEP 4: Deploy Marketplace ============
  console.log("\n📝 [4/6] Deploying CarbonMarketplace...");
  const CarbonMarketplace = await hre.ethers.getContractFactory("CarbonMarketplace");
  const marketplace = await CarbonMarketplace.deploy(
    usdcAddress,
    deployments.CarbonCreditTokens.VERRA_VCS, // Default to Verra pool
    nftAddress
  );
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log("✅ CarbonMarketplace deployed to:", marketplaceAddress);
  deployments.CarbonMarketplace = marketplaceAddress;

  // ============ STEP 5: Deploy Oracle Contracts (Mocked for local) ============
  console.log("\n📝 [5/6] Deploying Oracle Infrastructure...");

  // For local testing, we use mock Chainlink contracts
  const MockFunctionsRouter = await hre.ethers.getContractFactory("MockFunctionsRouter");
  const functionsRouter = await MockFunctionsRouter.deploy();
  await functionsRouter.waitForDeployment();
  const functionsRouterAddress = await functionsRouter.getAddress();
  console.log("✅ Mock Functions Router deployed to:", functionsRouterAddress);

  // Deploy EmissionVerifier
  const EmissionVerifier = await hre.ethers.getContractFactory("EmissionVerifier");
  const verifier = await EmissionVerifier.deploy(functionsRouterAddress, nftAddress);
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("✅ EmissionVerifier deployed to:", verifierAddress);
  deployments.EmissionVerifier = verifierAddress;

  // Deploy RegistrySync
  const RegistrySync = await hre.ethers.getContractFactory("RegistrySync");
  const registrySync = await RegistrySync.deploy(functionsRouterAddress, nftAddress);
  await registrySync.waitForDeployment();
  const registrySyncAddress = await registrySync.getAddress();
  console.log("✅ RegistrySync deployed to:", registrySyncAddress);
  deployments.RegistrySync = registrySyncAddress;

  // Deploy CarbonPriceOracle
  const CarbonPriceOracle = await hre.ethers.getContractFactory("CarbonPriceOracle");
  const priceOracle = await CarbonPriceOracle.deploy(functionsRouterAddress);
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();
  console.log("✅ CarbonPriceOracle deployed to:", priceOracleAddress);
  deployments.CarbonPriceOracle = priceOracleAddress;

  // ============ STEP 6: Configure Roles and Permissions ============
  console.log("\n📝 [6/6] Configuring roles and permissions...");

  // Grant NATIVE_ISSUER_ROLE to EmissionVerifier (so it can mint credits)
  const NATIVE_ISSUER_ROLE = await nft.NATIVE_ISSUER_ROLE();
  await nft.grantRole(NATIVE_ISSUER_ROLE, verifierAddress);
  console.log("✅ Granted NATIVE_ISSUER_ROLE to EmissionVerifier");
  
  // Grant NATIVE_ISSUER_ROLE to deployer (for simple company registration minting)
  await nft.grantRole(NATIVE_ISSUER_ROLE, deployer.address);
  console.log("✅ Granted NATIVE_ISSUER_ROLE to deployer");

  // Grant WRAPPER_ROLE to deployer (for testing)
  for (const [type, address] of Object.entries(deployments.CarbonCreditTokens)) {
    const token = await hre.ethers.getContractAt("CarbonCreditToken", address);
    const WRAPPER_ROLE = await token.WRAPPER_ROLE();
    await token.grantRole(WRAPPER_ROLE, deployer.address);
    console.log(`✅ Granted WRAPPER_ROLE for ${type}`);
  }

  // Grant KYC_ROLE to deployer (for testing)
  const KYC_ROLE = await marketplace.KYC_ROLE();
  await marketplace.grantRole(KYC_ROLE, deployer.address);
  console.log("✅ Granted KYC_ROLE to deployer");

  // Mint verified test credits to accounts 1-5 (deployer holds NATIVE_ISSUER_ROLE above) so they can wrap & sell
  for (let i = 1; i <= Math.min(5, signers.length - 1); i++) {
    for (let k = 0; k < 5; k++) {
      await nft.mintCredit(
        signers[i].address,
        "LOCAL_DEV",
        "Local Dev Credit",
        `LOCAL-DEV-${i}-${k}`,
        "VERRA_VCS",
        hre.ethers.parseEther("1"),
        2024,
        "GLOBAL",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`local-dev-${i}-${k}`)),
        "",
        ""
      );
    }
    console.log(`✅ Minted 5 carbon credits to account ${i}: ${signers[i].address.slice(0, 10)}...`);
  }

  // ============ SAVE DEPLOYMENT DATA ============
  const deploymentData = {
    network: "localhost",
    chainId: 31337,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: deployments,
  };

  const deploymentPath = path.join(__dirname, "../../deployments");
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }

  fs.writeFileSync(
    path.join(deploymentPath, "localhost.json"),
    JSON.stringify(deploymentData, null, 2)
  );

  console.log("\n✅ Deployment complete!");
  console.log("📄 Deployment data saved to deployments/localhost.json");
  console.log("\n📋 Contract Addresses:");
  console.log(JSON.stringify(deployments, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
