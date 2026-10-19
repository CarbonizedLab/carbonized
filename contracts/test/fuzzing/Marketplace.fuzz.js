const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

for (const DEC of [18, 6]) {
describe(`CarbonMarketplace - Fuzzing Tests (${DEC}-decimal payment token)`, function () {
  const U = (n) => ethers.parseUnits(n.toString(), DEC);

  async function deployMarketplaceFixture() {
    const [owner, trader1, trader2] = await ethers.getSigners();

    const CarbonCreditNFT = await ethers.getContractFactory("CarbonCreditNFT");
    const nft = await CarbonCreditNFT.deploy();
    await nft.waitForDeployment();

    const CarbonCreditToken = await ethers.getContractFactory("CarbonCreditToken");
    const token = await CarbonCreditToken.deploy(
      "Carbonized Credit - Verra",
      "CCT-VCS",
      await nft.getAddress(),
      "VERRA_VCS"
    );
    await token.waitForDeployment();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", DEC);
    await usdc.waitForDeployment();

    await usdc.mint(trader1.address, U(1000000));
    await usdc.mint(trader2.address, U(1000000));

    const CarbonMarketplace = await ethers.getContractFactory("CarbonMarketplace");
    const marketplace = await CarbonMarketplace.deploy(
      await usdc.getAddress(),
      await token.getAddress(),
      await nft.getAddress()
    );
    await marketplace.waitForDeployment();

    const NATIVE_ISSUER_ROLE = await nft.NATIVE_ISSUER_ROLE();
    await nft.grantRole(NATIVE_ISSUER_ROLE, owner.address);

    // Mint and wrap tokens
    await nft.mintCredit(
      trader1.address,
      "PROJECT_FUZZ",
      "Fuzz Test",
      "FUZZ-001",
      "VERRA_VCS",
      ethers.parseUnits("100000", 18),
      2024,
      "IN",
      ethers.keccak256(ethers.toUtf8Bytes("proof")),
      "cid",
      "ipfs://uri"
    );
    await nft.connect(trader1).approve(await token.getAddress(), 1);
    await token.connect(trader1).wrapCredit(1);

    for (const t of [trader1, trader2]) {
      await usdc.connect(t).approve(await marketplace.getAddress(), ethers.MaxUint256);
      await token.connect(t).approve(await marketplace.getAddress(), ethers.MaxUint256);
    }

    return { marketplace, token, usdc, nft, owner, trader1, trader2 };
  }

  // ============ RANDOM PRICE FUZZING ============
  describe("Random Price Fuzzing", function () {
    it("Should handle random price points", async function () {
      const { marketplace, token, usdc, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);

      const testCases = 50;
      let successCount = 0;

      for (let i = 0; i < testCases; i++) {
        const randomPrice = U((Math.random() * 1000 + 0.01).toFixed(2));
        const amount = ethers.parseUnits("10", 18);

        await token.connect(trader1).approve(await marketplace.getAddress(), amount);
        
        try {
          await marketplace.connect(trader1).createSellOrder(
            amount,
            randomPrice,
            3600,
            false
          );
          successCount++;

          // Cancel to clean up
          await marketplace.connect(trader1).cancelOrder(i + 1);
        } catch (error) {
          console.log(`      Failed price: $${ethers.formatUnits(randomPrice, DEC)}`);
        }
      }

      console.log(`      Success rate: ${successCount}/${testCases}`);
      expect(successCount).to.be.greaterThan(testCases * 0.95); // 95% success
    });
  });

  // ============ AMM STRESS TESTS ============
  describe("AMM Fuzzing", function () {
    it("Should handle random swap sizes", async function () {
      this.timeout(120000);

      const { marketplace, token, usdc, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);

      // Add liquidity
      const carbonAmount = ethers.parseUnits("10000", 18);
      const stableAmount = U(150000);
      await marketplace.connect(trader1).addLiquidity(carbonAmount, stableAmount, 0, 0, 0);

      const swapTests = 30;
      let successfulSwaps = 0;

      for (let i = 0; i < swapTests; i++) {
        const randomAmount = U((Math.random() * 100 + 1).toFixed(2));

        await usdc.connect(trader2).approve(await marketplace.getAddress(), randomAmount);

        try {
          await marketplace.connect(trader2).swap(false, randomAmount, 0);
          successfulSwaps++;
        } catch (error) {
          // Expected for amounts exceeding liquidity
        }
      }

      console.log(`      Successful swaps: ${successfulSwaps}/${swapTests}`);
      expect(successfulSwaps).to.be.greaterThan(0);
    });

    it("Should maintain price stability under random trades", async function () {
      const { marketplace, token, usdc, nft, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);

      // Add liquidity
      await marketplace.connect(trader1).addLiquidity(
        ethers.parseUnits("5000", 18),
        U(75000),
        0,
        0,
        0
      );

      const initialPrice = await marketplace.getPrice();
      
      // Perform random swaps
      for (let i = 0; i < 20; i++) {
        const direction = Math.random() > 0.5;
        const tonnes = (Math.random() * 10 + 1).toFixed(2);
        const amount = direction ? U(tonnes) : ethers.parseUnits(tonnes, 18);

        if (direction) {
          // Buy CCT with USDC
          await usdc.connect(trader2).approve(await marketplace.getAddress(), amount);
          try {
            await marketplace.connect(trader2).swap(false, amount, 0);
          } catch {}
        } else {
          // Sell CCT for USDC (need to mint more)
          try {
            await nft.mintCredit(
              trader2.address,
              `PROJECT_SWAP_${i}`,
              "Test",
              `SWAP-${i}`,
              "VERRA_VCS",
              amount,
              2024,
              "IN",
              ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
              "cid",
              "ipfs://uri"
            );
            const tokenId = i + 2;
            await nft.connect(trader2).approve(await token.getAddress(), tokenId);
            await token.connect(trader2).wrapCredit(tokenId);
            await token.connect(trader2).approve(await marketplace.getAddress(), amount);
            await marketplace.connect(trader2).swap(true, amount, 0);
          } catch {}
        }
      }

      const finalPrice = await marketplace.getPrice();
      const priceChange = Math.abs(Number(finalPrice - initialPrice)) / Number(initialPrice);

      console.log(`      Initial price: $${ethers.formatUnits(initialPrice, DEC)}`);
      console.log(`      Final price: $${ethers.formatUnits(finalPrice, DEC)}`);
      console.log(`      Price change: ${(priceChange * 100).toFixed(2)}%`);

      // Price should not deviate wildly
      expect(priceChange).to.be.lessThan(0.5); // Less than 50% change
    });
  });

  // ============ CONCURRENT OPERATIONS ============
  describe("Concurrent Operations", function () {
    it("Should handle multiple simultaneous orders", async function () {
      this.timeout(120000);

      const { marketplace, token, usdc, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);

      const orderCount = 20;
      const amount = ethers.parseUnits("100", 18);

      // One allowance covering every escrow (re-approving `amount` before each order would be overwritten/consumed).
      await token.connect(trader1).approve(await marketplace.getAddress(), amount * BigInt(orderCount));

      // The automining test chain cannot queue transactions, so orders are submitted back-to-back
      for (let i = 0; i < orderCount; i++) {
        await marketplace.connect(trader1).createSellOrder(amount, U(15 + i), 3600, false);
      }

      // Verify all orders created
      for (let i = 1; i <= orderCount; i++) {
        const order = await marketplace.getOrder(i);
        expect(order.isActive).to.be.true;
      }
    });
  });

  // ============ FEE DISCOUNT FUZZING ============
  describe("Fee discount fuzzing", function () {
    it("Random discounts (incl. above the cap) never push the fee outside [base/2, base]", async function () {
      this.timeout(120000);
      const { marketplace, token, usdc, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
      const provider = await (await ethers.getContractFactory("MockFeeDiscount")).deploy();
      await provider.waitForDeployment();
      await marketplace.setFeeDiscountProvider(await provider.getAddress());
      await provider.set(0, 0); // Fixed

      let accrued = 0n;
      for (let i = 0; i < 25; i++) {
        const discount = Math.floor(Math.random() * 12000);
        const tonnes = BigInt(1 + Math.floor(Math.random() * 500));
        const amount = tonnes * 10n ** 18n;
        const price = U(Math.floor(Math.random() * 90) + 1);
        await provider.set(0, discount);

        await marketplace.connect(trader1).createSellOrder(amount, price, 3600, false);
        const orderId = await marketplace.nextOrderId() - 1n;
        const sellerBefore = await usdc.balanceOf(trader1.address);
        await marketplace.connect(trader2).fillOrder(orderId, amount);

        const cost = (amount * price) / 10n ** 18n;
        const baseFee = (cost * 25n) / 10000n;
        const fee = (await marketplace.accruedFees()) - accrued;
        accrued += fee;

        expect(fee).to.be.lte(baseFee);
        expect(fee).to.be.gte(baseFee / 2n);
        expect((await usdc.balanceOf(trader1.address)) - sellerBefore).to.equal(cost - fee);
      }
    });
  });

  // ============ EDGE CASE FUZZING ============
  describe("Edge Cases", function () {
    it("Should handle minimum amounts", async function () {
      const { marketplace, token, trader1 } = await loadFixture(deployMarketplaceFixture);

      const minAmount = 1; // 1 wei
      const price = U(15);

      await token.connect(trader1).approve(await marketplace.getAddress(), minAmount);
      
      await expect(
        marketplace.connect(trader1).createSellOrder(minAmount, price, 3600, false)
      ).to.not.be.reverted;
    });

    it("Should handle maximum amounts", async function () {
      const { marketplace, token, trader1 } = await loadFixture(deployMarketplaceFixture);

      const maxAmount = await token.balanceOf(trader1.address);
      const price = U(15);

      await token.connect(trader1).approve(await marketplace.getAddress(), maxAmount);
      
      await expect(
        marketplace.connect(trader1).createSellOrder(maxAmount, price, 3600, false)
      ).to.not.be.reverted;
    });
  });
});
}
