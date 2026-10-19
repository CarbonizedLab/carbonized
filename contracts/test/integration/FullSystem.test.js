const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

// Marketplace parts run with an 18-decimal (testnet mock) and a 6-decimal (production USDC) payment token.
for (const DEC of [18, 6]) {
describe(`Carbonized Platform - Integration Tests (${DEC}-decimal payment token)`, function () {
  const U = (n) => ethers.parseUnits(n.toString(), DEC);

  async function deployFullSystemFixture() {
    const [owner, issuer, verifier, trader1, trader2, enterprise] = await ethers.getSigners();

    // Deploy NFT
    const CarbonCreditNFT = await ethers.getContractFactory("CarbonCreditNFT");
    const nft = await CarbonCreditNFT.deploy();
    await nft.waitForDeployment();

    const NATIVE_ISSUER_ROLE = await nft.NATIVE_ISSUER_ROLE();
    const VERIFIER_ROLE = await nft.VERIFIER_ROLE();
    await nft.grantRole(NATIVE_ISSUER_ROLE, issuer.address);
    await nft.grantRole(VERIFIER_ROLE, verifier.address);

    // Deploy Tokens
    const CarbonCreditToken = await ethers.getContractFactory("CarbonCreditToken");
    const tokenVCS = await CarbonCreditToken.deploy(
      "Carbonized Credit - Verra",
      "CCT-VCS",
      await nft.getAddress(),
      "VERRA_VCS"
    );
    await tokenVCS.waitForDeployment();

    // Deploy Mock USDC
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", DEC);
    await usdc.waitForDeployment();

    // Mint USDC to traders
    await usdc.mint(trader1.address, U(100000));
    await usdc.mint(trader2.address, U(100000));
    await usdc.mint(enterprise.address, U(500000));

    // Deploy Marketplace
    const CarbonMarketplace = await ethers.getContractFactory("CarbonMarketplace");
    const marketplace = await CarbonMarketplace.deploy(
      await usdc.getAddress(),
      await tokenVCS.getAddress(),
      await nft.getAddress()
    );
    await marketplace.waitForDeployment();

    // Grant KYC to enterprise
    const KYC_ROLE = await marketplace.KYC_ROLE();
    await marketplace.grantRole(KYC_ROLE, owner.address);
    await marketplace.setKYCStatus(enterprise.address, true);

    return { nft, tokenVCS, usdc, marketplace, owner, issuer, verifier, trader1, trader2, enterprise };
  }

  // ============ END-TO-END WORKFLOW TESTS ============
  describe("End-to-End Carbon Credit Lifecycle", function () {
    it("Should complete full workflow: Mint -> Wrap -> Trade -> Unwrap -> Retire", async function () {
      const { nft, tokenVCS, usdc, marketplace, issuer, trader1, trader2 } = await loadFixture(deployFullSystemFixture);

      // STEP 1: Mint carbon credit NFT
      console.log("      [1/5] Minting carbon credit NFT...");
      await nft.connect(issuer).mintCredit(
        trader1.address,
        "PROJECT_SOLAR_RAJASTHAN",
        "Rajasthan Solar Farm",
        "VCS-2024-001",
        "VERRA_VCS",
        ethers.parseUnits("1000", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("oracle_proof")),
        "QmSatelliteData",
        "ipfs://metadata"
      );

      expect(await nft.ownerOf(1)).to.equal(trader1.address);

      // STEP 2: Wrap NFT into fungible tokens
      console.log("      [2/5] Wrapping NFT into ERC-20...");
      await nft.connect(trader1).approve(await tokenVCS.getAddress(), 1);
      await tokenVCS.connect(trader1).wrapCredit(1);

      expect(await tokenVCS.balanceOf(trader1.address)).to.equal(ethers.parseUnits("1000", 18));

      // STEP 3: Create sell order on marketplace
      console.log("      [3/5] Creating sell order...");
      await tokenVCS.connect(trader1).approve(await marketplace.getAddress(), ethers.parseUnits("1000", 18));
      
      const pricePerTonne = U(15); // $15 per tonne in payment-token base units
      await marketplace.connect(trader1).createSellOrder(
        ethers.parseUnits("1000", 18),
        pricePerTonne,
        3600, // 1 hour expiry
        false // No KYC required
      );

      // STEP 4: Fill order (trader2 buys)
      console.log("      [4/5] Filling order...");
      const totalCost = BigInt(1000) * BigInt(pricePerTonne);
      await usdc.connect(trader2).approve(await marketplace.getAddress(), totalCost);
      await marketplace.connect(trader2).fillOrder(1, ethers.parseUnits("1000", 18));

      expect(await tokenVCS.balanceOf(trader2.address)).to.equal(ethers.parseUnits("1000", 18));
      expect(await marketplace.accruedFees()).to.equal((U(15000) * 25n) / 10000n);

      // STEP 5: Unwrap and retire
      console.log("      [5/5] Unwrapping and retiring...");
      await tokenVCS.connect(trader2).unwrapCredit(1);
      await nft.connect(trader2).retireCredit(1, "Q1 2026 Corporate ESG Offset");

      const stats = await nft.getGlobalStats();
      expect(stats.retired).to.equal(ethers.parseUnits("1000", 18));
    });
  });

  // ============ MARKETPLACE AMM TESTS ============
  describe("AMM Liquidity Pool Operations", function () {
    it("Should add liquidity, swap, and remove liquidity", async function () {
      const { nft, tokenVCS, usdc, marketplace, issuer, trader1, trader2 } = await loadFixture(deployFullSystemFixture);

      // Mint and wrap credits
      await nft.connect(issuer).mintCredit(
        trader1.address,
        "PROJECT_001",
        "Test",
        "VCS-2024-001",
        "VERRA_VCS",
        ethers.parseUnits("10000", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "cid",
        "ipfs://uri"
      );

      await nft.connect(trader1).approve(await tokenVCS.getAddress(), 1);
      await tokenVCS.connect(trader1).wrapCredit(1);

      // Add liquidity
      const carbonAmount = ethers.parseUnits("5000", 18);
      const usdcAmount = U(75000); // $15/tonne

      await tokenVCS.connect(trader1).approve(await marketplace.getAddress(), carbonAmount);
      await usdc.connect(trader1).approve(await marketplace.getAddress(), usdcAmount);

      await marketplace.connect(trader1).addLiquidity(carbonAmount, usdcAmount, 0, 0, 0);

      // Swap USDC for CCT
      const swapAmount = U(1000);
      await usdc.connect(trader2).approve(await marketplace.getAddress(), swapAmount);
      
      const amountOut = await marketplace.connect(trader2).swap(
        false, // Buy carbon with USDC
        swapAmount,
        0 // Min amount out (0 for testing)
      );

      expect(await tokenVCS.balanceOf(trader2.address)).to.be.greaterThan(0);

      // Check price
      const price = await marketplace.getPrice();
      expect(price).to.be.gt(U(15)); // buying CCT pushed the price above the seeded $15
      const lp = await marketplace.lpTokens(trader1.address);
      await marketplace.connect(trader1).removeLiquidity(lp, 0, 0);
      expect(await marketplace.lpTokens(trader1.address)).to.equal(0n);
      console.log(`      Current price: $${ethers.formatUnits(price, DEC)} per tonne`);
    });
  });

  // ============ ENTERPRISE COMPLIANCE WORKFLOW ============
  describe("Enterprise Compliance Workflow", function () {
    it("Should complete KYC-gated enterprise bulk purchase", async function () {
      const { nft, tokenVCS, usdc, marketplace, issuer, enterprise } = await loadFixture(deployFullSystemFixture);

      // Mint large batch for enterprise
      const credits = Array(10).fill(0).map((_, i) => ({
        projectName: `Enterprise Credit ${i}`,
        serialNumber: `VCS-ENT-${i}`,
        methodology: "VERRA_VCS",
        co2Tonnes: ethers.parseUnits("1000", 18),
        vintageYear: 2024,
        geography: "IN",
        oracleProofHash: ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
        satelliteDataCID: `cid${i}`,
        tokenURI: `ipfs://uri${i}`,
      }));

      await nft.connect(issuer).batchMint(enterprise.address, "PROJECT_ENTERPRISE", credits);

      // Wrap all
      for (let i = 1; i <= 10; i++) {
        await nft.connect(enterprise).approve(await tokenVCS.getAddress(), i);
      }
      await tokenVCS.connect(enterprise).batchWrap([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      expect(await tokenVCS.balanceOf(enterprise.address)).to.equal(ethers.parseUnits("10000", 18));

      // Create KYC-required sell order
      await tokenVCS.connect(enterprise).approve(await marketplace.getAddress(), ethers.parseUnits("10000", 18));
      await marketplace.connect(enterprise).createSellOrder(
        ethers.parseUnits("10000", 18),
        U(12), // $12/tonne (bulk discount)
        0, // No expiry
        true // KYC required
      );

      const order = await marketplace.getOrder(1);
      expect(order.requiresKYC).to.be.true;
      expect(order.amount).to.equal(ethers.parseUnits("10000", 18));
    });
  });

  // ============ STRESS TESTS ============
  describe("System Stress Tests", function () {
    it("Should handle high-volume trading", async function () {
      this.timeout(120000); // 2 minutes

      const { nft, tokenVCS, usdc, marketplace, issuer, trader1, trader2 } = await loadFixture(deployFullSystemFixture);

      // batchMint costs ~0.49M gas per credit, so 50 credits are minted in 5 batches of 10 (each well below the block gas limit)
      const TOTAL = 50;
      const BATCH = 10;
      console.log(`      Minting ${TOTAL} credits in batches of ${BATCH}...`);
      for (let start = 0; start < TOTAL; start += BATCH) {
        const credits = Array(BATCH).fill(0).map((_, j) => {
          const i = start + j;
          return {
            projectName: `Stress Test ${i}`,
            serialNumber: `VCS-STRESS-${i}`,
            methodology: "VERRA_VCS",
            co2Tonnes: ethers.parseUnits("100", 18),
            vintageYear: 2024,
            geography: "IN",
            oracleProofHash: ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
            satelliteDataCID: `cid${i}`,
            tokenURI: `ipfs://uri${i}`,
          };
        });
        await nft.connect(issuer).batchMint(trader1.address, `PROJECT_STRESS_${start / BATCH}`, credits);
      }

      console.log("      Wrapping 50 NFTs...");
      const tokenIds = Array(50).fill(0).map((_, i) => i + 1);
      for (const id of tokenIds) {
        await nft.connect(trader1).approve(await tokenVCS.getAddress(), id);
      }
      await tokenVCS.connect(trader1).batchWrap(tokenIds);

      expect(await tokenVCS.balanceOf(trader1.address)).to.equal(ethers.parseUnits("5000", 18));

      console.log("      ✅ Stress test passed!");
    });
  });
});
}
