const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const E18 = 10n ** 18n;
const DAY = 24 * 3600;

// Every suite runs against an 18-decimal payment token (testnet mock) and a 6-decimal one (production USDC).
// Prices are expressed in payment-token base units per tonne: $15 / tonne = parseUnits("15", decimals).
for (const DEC of [18, 6]) {
  describe(`CarbonMarketplace - Unit Tests (${DEC}-decimal payment token)`, function () {
    const U = (n) => ethers.parseUnits(n.toString(), DEC);
    const PRICE = U(15);
    const T = (n) => ethers.parseUnits(n.toString(), 18); // tonnes in CCT base units
    const fee = (cost, bps = 25n) => (cost * bps) / 10000n;

    async function deployMarketplaceFixture() {
      const [owner, trader1, trader2, enterprise, extra] = await ethers.getSigners();

      const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
      await nft.waitForDeployment();

      const token = await (await ethers.getContractFactory("CarbonCreditToken")).deploy(
        "Carbonized Credit - Verra",
        "CCT-VCS",
        await nft.getAddress(),
        "VERRA_VCS"
      );
      await token.waitForDeployment();

      const usdc = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", DEC);
      await usdc.waitForDeployment();

      await usdc.mint(trader1.address, U(100000));
      await usdc.mint(trader2.address, U(100000));
      await usdc.mint(enterprise.address, U(500000));

      const marketplace = await (await ethers.getContractFactory("CarbonMarketplace")).deploy(
        await usdc.getAddress(),
        await token.getAddress(),
        await nft.getAddress()
      );
      await marketplace.waitForDeployment();

      await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), owner.address);
      await marketplace.grantRole(await marketplace.KYC_ROLE(), owner.address);

      await nft.mintCredit(
        trader1.address,
        "PROJECT_001",
        "Test Project",
        "VCS-TEST-001",
        "VERRA_VCS",
        T(1000),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "cid",
        "ipfs://uri"
      );
      await nft.connect(trader1).approve(await token.getAddress(), 1);
      await token.connect(trader1).wrapCredit(1);

      const addr = await marketplace.getAddress();
      for (const s of [trader1, trader2, enterprise]) {
        await usdc.connect(s).approve(addr, ethers.MaxUint256);
        await token.connect(s).approve(addr, ethers.MaxUint256);
      }

      return { marketplace, token, usdc, nft, owner, trader1, trader2, enterprise, extra };
    }

    /** gives `to` CCT by minting+wrapping a fresh NFT (token ids tracked via nft.totalSupply) */
    async function giveCCT({ nft, token, owner }, to, tonnes, tag) {
      await nft.connect(owner).mintCredit(
        to.address,
        `PROJECT_${tag}`,
        "Test",
        `VCS-TEST-${tag}`,
        "VERRA_VCS",
        T(tonnes),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes(`proof-${tag}`)),
        "cid",
        "ipfs://uri"
      );
      const id = await nft.totalSupply();
      await nft.connect(to).approve(await token.getAddress(), id);
      await token.connect(to).wrapCredit(id);
    }

    // ============ DEPLOYMENT ============
    describe("Deployment", function () {
      it("reads the payment-token decimals and scales min/max price bounds", async function () {
        const { marketplace } = await loadFixture(deployMarketplaceFixture);
        expect(await marketplace.paymentDecimals()).to.equal(DEC);
        expect(await marketplace.minPricePerTonne()).to.equal(U("0.01"));
        expect(await marketplace.DEFAULT_MIN_PRICE_PER_TONNE()).to.equal(U("0.01"));
        expect(await marketplace.MAX_MIN_PRICE_PER_TONNE()).to.equal(U(1_000_000));
      });

      it("deployer holds all roles including FEE_MANAGER_ROLE", async function () {
        const { marketplace, owner } = await loadFixture(deployMarketplaceFixture);
        for (const r of ["DEFAULT_ADMIN_ROLE", "MATCHER_ROLE", "KYC_ROLE", "PAUSER_ROLE", "FEE_MANAGER_ROLE"]) {
          const role = r === "DEFAULT_ADMIN_ROLE" ? ethers.ZeroHash : await marketplace[r]();
          expect(await marketplace.hasRole(role, owner.address)).to.equal(true);
        }
      });
    });

    // ============ ORDER BOOK TESTS ============
    describe("Order Book - Buy Orders", function () {
      it("Should create a buy order", async function () {
        const { marketplace, trader2 } = await loadFixture(deployMarketplaceFixture);
        const amount = T(100);

        await expect(marketplace.connect(trader2).createBuyOrder(amount, PRICE, 3600, false))
          .to.emit(marketplace, "OrderCreated")
          .withArgs(1, trader2.address, true, amount, PRICE);

        const order = await marketplace.getOrder(1);
        expect(order.trader).to.equal(trader2.address);
        expect(order.isBuyOrder).to.be.true;
        expect(order.amount).to.equal(amount);
        expect(order.isActive).to.be.true;
        expect(await marketplace.orderFeeBps(1)).to.equal(25n);
      });

      it("Should reject buy order without sufficient USDC approval", async function () {
        const { marketplace, usdc, trader2 } = await loadFixture(deployMarketplaceFixture);
        await usdc.connect(trader2).approve(await marketplace.getAddress(), 0);
        await expect(marketplace.connect(trader2).createBuyOrder(T(100), PRICE, 3600, false)).to.be.reverted;
      });

      it("Should lock exactly amount * price of USDC when buy order created", async function () {
        const { marketplace, usdc, trader2 } = await loadFixture(deployMarketplaceFixture);
        const before = await usdc.balanceOf(trader2.address);
        await marketplace.connect(trader2).createBuyOrder(T(100), PRICE, 3600, false);
        expect(before - (await usdc.balanceOf(trader2.address))).to.equal(U(1500));
      });
    });

    describe("Order Book - Sell Orders", function () {
      it("Should create a sell order", async function () {
        const { marketplace, trader1 } = await loadFixture(deployMarketplaceFixture);
        await expect(marketplace.connect(trader1).createSellOrder(T(500), PRICE, 3600, false))
          .to.emit(marketplace, "OrderCreated")
          .withArgs(1, trader1.address, false, T(500), PRICE);
      });

      it("Should lock CCT tokens when sell order created", async function () {
        const { marketplace, token, trader1 } = await loadFixture(deployMarketplaceFixture);
        const before = await token.balanceOf(trader1.address);
        await marketplace.connect(trader1).createSellOrder(T(500), PRICE, 3600, false);
        expect(before - (await token.balanceOf(trader1.address))).to.equal(T(500));
      });
    });

    describe("Order Filling", function () {
      it("Should fill a sell order and pay the maker net of fee", async function () {
        const { marketplace, token, usdc, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).createSellOrder(T(500), PRICE, 3600, false);

        const makerBefore = await usdc.balanceOf(trader1.address);
        const takerBefore = await usdc.balanceOf(trader2.address);
        await expect(marketplace.connect(trader2).fillOrder(1, T(500))).to.emit(marketplace, "OrderFilled");

        const cost = U(7500);
        expect(await token.balanceOf(trader2.address)).to.equal(T(500));
        expect(takerBefore - (await usdc.balanceOf(trader2.address))).to.equal(cost);
        expect((await usdc.balanceOf(trader1.address)) - makerBefore).to.equal(cost - fee(cost));
        expect(await marketplace.accruedFees()).to.equal(fee(cost));
      });

      it("Should fill a buy order (taker sells CCT) and pay the taker net of fee", async function () {
        const { marketplace, token, usdc, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader2).createBuyOrder(T(100), PRICE, 3600, false);

        const before = await usdc.balanceOf(trader1.address);
        await marketplace.connect(trader1).fillOrder(1, T(100));
        const cost = U(1500);
        expect((await usdc.balanceOf(trader1.address)) - before).to.equal(cost - fee(cost));
        expect(await token.balanceOf(trader2.address)).to.equal(T(100));
        expect(await marketplace.accruedFees()).to.equal(fee(cost));
      });

      it("Should support partial fills", async function () {
        const { marketplace, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).createSellOrder(T(500), PRICE, 3600, false);
        await marketplace.connect(trader2).fillOrder(1, T(200));

        const order = await marketplace.getOrder(1);
        expect(order.filled).to.equal(T(200));
        expect(order.isActive).to.be.true;
      });

      it("Should deactivate order when fully filled", async function () {
        const { marketplace, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).createSellOrder(T(500), PRICE, 3600, false);
        await marketplace.connect(trader2).fillOrder(1, T(500));
        expect((await marketplace.getOrder(1)).isActive).to.be.false;
      });

      it("Should reject filling expired order", async function () {
        const { marketplace, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).createSellOrder(T(500), PRICE, 10, false);
        await time.increase(11);
        await expect(marketplace.connect(trader2).fillOrder(1, T(500))).to.be.revertedWith("Order expired");
      });

      it("Should reject zero-cost dust fills", async function () {
        const { marketplace, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
        const min = await marketplace.minPricePerTonne();
        await marketplace.connect(trader1).createSellOrder(T(500), min, 3600, false);
        // 1 wei of CCT costs < 1 payment-token base unit
        await expect(marketplace.connect(trader2).fillOrder(1, 1n)).to.be.revertedWith("Fill too small");
      });
    });

    describe("Order Cancellation", function () {
      it("Should cancel active buy order and refund USDC", async function () {
        const { marketplace, usdc, trader2 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader2).createBuyOrder(T(100), PRICE, 3600, false);

        const before = await usdc.balanceOf(trader2.address);
        await marketplace.connect(trader2).cancelOrder(1);
        expect((await usdc.balanceOf(trader2.address)) - before).to.equal(U(1500));
        expect((await marketplace.getOrder(1)).isActive).to.be.false;
      });

      it("Should cancel active sell order and return CCT", async function () {
        const { marketplace, token, trader1 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).createSellOrder(T(500), PRICE, 3600, false);

        const before = await token.balanceOf(trader1.address);
        await marketplace.connect(trader1).cancelOrder(1);
        expect((await token.balanceOf(trader1.address)) - before).to.equal(T(500));
      });

      it("Should refund only the unfilled part after a partial fill", async function () {
        const { marketplace, usdc, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader2).createBuyOrder(T(100), PRICE, 3600, false);
        await marketplace.connect(trader1).fillOrder(1, T(40));
        const before = await usdc.balanceOf(trader2.address);
        await marketplace.connect(trader2).cancelOrder(1);
        expect((await usdc.balanceOf(trader2.address)) - before).to.equal(U(900));
      });

      it("Should reject cancellation by non-creator", async function () {
        const { marketplace, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).createSellOrder(T(500), PRICE, 3600, false);
        await expect(marketplace.connect(trader2).cancelOrder(1)).to.be.revertedWith("Not order creator");
      });
    });

    // ============ AMM TESTS ============
    describe("AMM Liquidity Pool", function () {
      const CARBON = T(500);
      const STABLE = () => U(7500);

      async function seeded() {
        const ctx = await deployMarketplaceFixture();
        await ctx.marketplace.connect(ctx.trader1).addLiquidity(CARBON, STABLE(), 0, 0, 0);
        return ctx;
      }

      it("Should add initial liquidity and lock MINIMUM_LIQUIDITY", async function () {
        const { marketplace, token, usdc, trader1 } = await loadFixture(deployMarketplaceFixture);
        const min = await marketplace.MINIMUM_LIQUIDITY();
        expect(min).to.equal(1000n);

        await expect(marketplace.connect(trader1).addLiquidity(CARBON, STABLE(), 0, 0, 0)).to.emit(
          marketplace,
          "LiquidityAdded"
        );
        const lp = await marketplace.lpTokens(trader1.address);
        expect(lp).to.be.gt(0n);
        expect(await marketplace.lpTokens(ethers.ZeroAddress)).to.equal(min);
        expect((await marketplace.ammPool()).totalLPTokens).to.equal(lp + min);
        expect(await token.balanceOf(await marketplace.getAddress())).to.equal(CARBON);
        expect(await usdc.balanceOf(await marketplace.getAddress())).to.equal(STABLE());
      });

      it("Rejects dust seeding below the locked minimum", async function () {
        const { marketplace, trader1 } = await loadFixture(deployMarketplaceFixture);
        await expect(marketplace.connect(trader1).addLiquidity(1n, 1n, 0, 0, 0)).to.be.revertedWith(
          "Insufficient initial liquidity"
        );
        await expect(marketplace.connect(trader1).addLiquidity(0, 1n, 0, 0, 0)).to.be.revertedWith(
          "Invalid amounts"
        );
      });

      it("Only pulls proportional amounts on subsequent deposits (excess stays with the user)", async function () {
        const { marketplace, token, usdc, trader1, trader2, owner, nft } = await loadFixture(seeded);
        await giveCCT({ nft, token, owner }, trader2, 1000, "A");

        const cBefore = await token.balanceOf(trader2.address);
        const sBefore = await usdc.balanceOf(trader2.address);
        // pool price is 15 / tonne; offer too much stable
        const [cUsed, sUsed, lp] = await marketplace.connect(trader2).addLiquidity.staticCall(T(100), U(5000), 0, 0, 0);
        expect(cUsed).to.equal(T(100));
        expect(sUsed).to.equal(U(1500));
        expect(lp).to.be.gt(0n);
        await marketplace.connect(trader2).addLiquidity(T(100), U(5000), 0, 0, 0);
        expect(cBefore - (await token.balanceOf(trader2.address))).to.equal(T(100));
        expect(sBefore - (await usdc.balanceOf(trader2.address))).to.equal(U(1500));

        // offer too much carbon
        const [c2, s2] = await marketplace.connect(trader2).addLiquidity.staticCall(T(100), U(750), 0, 0, 0);
        expect(c2).to.equal(T(50));
        expect(s2).to.equal(U(750));
        expect(await marketplace.getPrice()).to.equal(PRICE);
      });

      it("quoteAddLiquidity matches addLiquidity", async function () {
        const { marketplace, trader2, token, owner, nft } = await loadFixture(seeded);
        await giveCCT({ nft, token, owner }, trader2, 1000, "B");
        const q = await marketplace.quoteAddLiquidity(T(100), U(5000));
        const r = await marketplace.connect(trader2).addLiquidity.staticCall(T(100), U(5000), 0, 0, 0);
        expect(q.carbonUsed).to.equal(r[0]);
        expect(q.stableUsed).to.equal(r[1]);
        expect(q.lpMinted).to.equal(r[2]);
      });

      it("Enforces carbonMin / stableMin / minLiquidity on addLiquidity", async function () {
        const { marketplace, trader2, token, owner, nft } = await loadFixture(seeded);
        await giveCCT({ nft, token, owner }, trader2, 1000, "C");
        await expect(
          marketplace.connect(trader2).addLiquidity(T(100), U(5000), T(101), 0, 0)
        ).to.be.revertedWith("Carbon below minimum");
        await expect(
          marketplace.connect(trader2).addLiquidity(T(100), U(5000), 0, U(1501), 0)
        ).to.be.revertedWith("Stable below minimum");
        const [, , lp] = await marketplace.connect(trader2).addLiquidity.staticCall(T(100), U(5000), 0, 0, 0);
        await expect(
          marketplace.connect(trader2).addLiquidity(T(100), U(5000), 0, 0, lp + 1n)
        ).to.be.revertedWith("Insufficient liquidity minted");
        await marketplace.connect(trader2).addLiquidity(T(100), U(5000), T(100), U(1500), lp);
      });

      it("Should remove liquidity with min-amount protection", async function () {
        const { marketplace, token, usdc, trader1 } = await loadFixture(seeded);
        const lp = await marketplace.lpTokens(trader1.address);
        await expect(marketplace.connect(trader1).removeLiquidity(lp, T(501), 0)).to.be.revertedWith(
          "Carbon below minimum"
        );
        await expect(marketplace.connect(trader1).removeLiquidity(lp, 0, U(7501))).to.be.revertedWith(
          "Stable below minimum"
        );
        await expect(marketplace.connect(trader1).removeLiquidity(lp + 1n, 0, 0)).to.be.revertedWith(
          "Invalid LP amount"
        );
        await expect(marketplace.connect(trader1).removeLiquidity(lp, 0, 0)).to.emit(
          marketplace,
          "LiquidityRemoved"
        );
        // minimum liquidity stays in the pool forever
        const pool = await marketplace.ammPool();
        expect(pool.totalLPTokens).to.equal(await marketplace.MINIMUM_LIQUIDITY());
        expect(pool.carbonReserve).to.be.gt(0n);
        expect(pool.stableReserve).to.be.gt(0n);
        expect(await token.balanceOf(await marketplace.getAddress())).to.equal(pool.carbonReserve);
        expect(await usdc.balanceOf(await marketplace.getAddress())).to.equal(pool.stableReserve);
      });

      it("Should swap USDC for CCT", async function () {
        const { marketplace, token, trader2 } = await loadFixture(seeded);
        const before = await token.balanceOf(trader2.address);
        await expect(marketplace.connect(trader2).swap(false, U(100), 0)).to.emit(marketplace, "Swap");
        expect(await token.balanceOf(trader2.address)).to.be.gt(before);
      });

      it("Should swap CCT for USDC", async function () {
        const { marketplace, token, usdc, nft, owner, trader2 } = await loadFixture(seeded);
        await giveCCT({ nft, token, owner }, trader2, 100, "D");
        const before = await usdc.balanceOf(trader2.address);
        await marketplace.connect(trader2).swap(true, T(50), 0);
        expect(await usdc.balanceOf(trader2.address)).to.be.gt(before);
      });

      it("Swap keeps the constant product non-decreasing and tracks reserves exactly", async function () {
        const { marketplace, token, usdc, trader2 } = await loadFixture(seeded);
        const p0 = await marketplace.ammPool();
        await marketplace.connect(trader2).swap(false, U(1000), 0);
        const p1 = await marketplace.ammPool();
        expect(p1.carbonReserve * p1.stableReserve).to.be.gte(p0.carbonReserve * p0.stableReserve);
        expect(await token.balanceOf(await marketplace.getAddress())).to.equal(p1.carbonReserve);
        expect(await usdc.balanceOf(await marketplace.getAddress())).to.equal(p1.stableReserve);
      });

      it("Reverts swaps whose output rounds to zero", async function () {
        const { marketplace, trader2 } = await loadFixture(seeded);
        // 1 base unit of the cheaper-per-unit side rounds to zero output (CCT wei is cheaper with 6-dec USDC)
        await expect(marketplace.connect(trader2).swap(DEC === 6, 1n, 0)).to.be.revertedWith("Insufficient output");
      });

      it("Should never drain the pool even with a huge swap", async function () {
        const { marketplace, usdc, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).addLiquidity(T(10), U(150), 0, 0, 0);
        await usdc.mint(trader2.address, U(900000));
        await marketplace.connect(trader2).swap(false, U(900000), 0);
        const pool = await marketplace.ammPool();
        expect(pool.carbonReserve).to.be.gt(0n);
        expect(pool.carbonReserve).to.be.lt(T(10));
      });

      it("Should enforce slippage protection", async function () {
        const { marketplace, trader2 } = await loadFixture(seeded);
        await expect(marketplace.connect(trader2).swap(false, U(100), T(1000))).to.be.revertedWith(
          "Slippage exceeded"
        );
      });

      it("Pool can be exited while paused, entry points cannot", async function () {
        const { marketplace, owner, trader1, trader2 } = await loadFixture(seeded);
        await marketplace.connect(owner).pause();
        await expect(marketplace.connect(trader2).swap(false, U(100), 0)).to.be.reverted;
        await expect(marketplace.connect(trader1).addLiquidity(T(1), U(15), 0, 0, 0)).to.be.reverted;
        await marketplace.connect(trader1).removeLiquidity(await marketplace.lpTokens(trader1.address), 0, 0);
      });
    });

    // ============ KYC TESTS ============
    describe("KYC Gating", function () {
      it("Should create KYC-required order", async function () {
        const { marketplace, trader1, owner } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(owner).setKYCStatus(trader1.address, true);
        await marketplace.connect(trader1).createSellOrder(T(100), PRICE, 3600, true);
        expect((await marketplace.getOrder(1)).requiresKYC).to.be.true;
      });

      it("Should reject non-KYC maker creating KYC order", async function () {
        const { marketplace, trader1 } = await loadFixture(deployMarketplaceFixture);
        await expect(marketplace.connect(trader1).createSellOrder(T(100), PRICE, 3600, true)).to.be.revertedWith(
          "KYC required"
        );
      });

      it("Should reject non-KYC user filling KYC order", async function () {
        const { marketplace, trader1, trader2, owner } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(owner).setKYCStatus(trader1.address, true);
        await marketplace.connect(trader1).createSellOrder(T(100), PRICE, 3600, true);
        await expect(marketplace.connect(trader2).fillOrder(1, T(100))).to.be.revertedWith("KYC required");
      });

      it("Re-checks the maker's KYC at fill time", async function () {
        const { marketplace, trader1, trader2, owner } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(owner).setKYCStatus(trader1.address, true);
        await marketplace.connect(owner).setKYCStatus(trader2.address, true);
        await marketplace.connect(trader1).createSellOrder(T(100), PRICE, 3600, true);
        await marketplace.connect(owner).setKYCStatus(trader1.address, false);
        await expect(marketplace.connect(trader2).fillOrder(1, T(100))).to.be.revertedWith("Maker KYC revoked");
        await marketplace.connect(trader1).cancelOrder(1); // exit stays open
      });

      it("Only the admin can toggle the global KYC gate", async function () {
        const { marketplace, trader1, owner } = await loadFixture(deployMarketplaceFixture);
        await expect(marketplace.connect(trader1).setKYCGate(true)).to.be.reverted;
        await expect(marketplace.connect(owner).setKYCGate(true)).to.emit(marketplace, "KYCGateUpdated").withArgs(true);
        expect(await marketplace.kycGateEnabled()).to.equal(true);
      });
    });

    // ============ PRICE QUERY TESTS ============
    describe("Price Discovery", function () {
      it("Should return the AMM price in payment-token units per tonne", async function () {
        const { marketplace, trader1 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).addLiquidity(T(1000), U(15000), 0, 0, 0);
        expect(await marketplace.getPrice()).to.equal(U(15));
      });
    });

    // ============ FEE TESTS ============
    describe("Trading Fees", function () {
      it("Should collect 0.25% fee on trades", async function () {
        const { marketplace, usdc, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).createSellOrder(T(100), PRICE, 3600, false);

        const before = await usdc.balanceOf(trader1.address);
        await marketplace.connect(trader2).fillOrder(1, T(100));
        const received = (await usdc.balanceOf(trader1.address)) - before;
        expect(U(1500) - received).to.equal(fee(U(1500)));
      });

      it("Fee changes are not retroactive and emit an event", async function () {
        const { marketplace, owner, trader1, trader2 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).createSellOrder(T(100), PRICE, 3600, false);
        await expect(marketplace.connect(owner).setTradingFee(100)).to.emit(marketplace, "TradingFeeUpdated").withArgs(25, 100);
        await marketplace.connect(trader2).fillOrder(1, T(100));
        expect(await marketplace.accruedFees()).to.equal(fee(U(1500), 25n));

        await expect(marketplace.connect(owner).setTradingFee(101)).to.be.revertedWith("Fee too high");
        await expect(marketplace.connect(trader1).setTradingFee(1)).to.be.reverted;
      });

      it("withdrawFees pays out only the tracked fees", async function () {
        const { marketplace, usdc, owner, trader1, trader2, extra } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).createSellOrder(T(100), PRICE, 3600, false);
        await marketplace.connect(trader2).createBuyOrder(T(10), PRICE, 3600, false); // escrow 150
        await marketplace.connect(trader2).fillOrder(1, T(100));

        await expect(marketplace.connect(trader1).withdrawFees(trader1.address)).to.be.reverted;
        await marketplace.connect(owner).withdrawFees(extra.address);
        expect(await usdc.balanceOf(extra.address)).to.equal(fee(U(1500)));
        expect(await usdc.balanceOf(await marketplace.getAddress())).to.equal(U(150));
      });
    });

    // ============ MINIMUM PRICE / GUARDS ============
    describe("Minimum price validation", function () {
      const AMOUNT = T(100);
      const MIN = U("0.01");

      it("Initial minimum price is 0.01 of the payment token", async function () {
        const { marketplace } = await loadFixture(deployMarketplaceFixture);
        expect(await marketplace.minPricePerTonne()).to.equal(MIN);
      });

      it("Rejects sell order below minimum and accepts equal to minimum", async function () {
        const { marketplace, trader1 } = await loadFixture(deployMarketplaceFixture);
        await expect(marketplace.connect(trader1).createSellOrder(AMOUNT, MIN - 1n, 3600, false)).to.be.revertedWith(
          "Price below minimum"
        );
        await expect(marketplace.connect(trader1).createSellOrder(AMOUNT, 0, 3600, false)).to.be.revertedWith(
          "Price below minimum"
        );
        await expect(marketplace.connect(trader1).createSellOrder(AMOUNT, MIN, 3600, false)).to.emit(
          marketplace,
          "OrderCreated"
        );
      });

      it("Rejects buy order below minimum and accepts equal to minimum", async function () {
        const { marketplace, trader2 } = await loadFixture(deployMarketplaceFixture);
        await expect(marketplace.connect(trader2).createBuyOrder(AMOUNT, MIN - 1n, 3600, false)).to.be.revertedWith(
          "Price below minimum"
        );
        await expect(marketplace.connect(trader2).createBuyOrder(AMOUNT, MIN, 3600, false)).to.emit(
          marketplace,
          "OrderCreated"
        );
      });

      it("Rejects prices above the sanity cap", async function () {
        const { marketplace, trader1 } = await loadFixture(deployMarketplaceFixture);
        const cap = await marketplace.MAX_PRICE_PER_TONNE();
        await expect(marketplace.connect(trader1).createSellOrder(AMOUNT, cap + 1n, 3600, false)).to.be.revertedWith(
          "Price above maximum"
        );
        await marketplace.connect(trader1).createSellOrder(AMOUNT, cap, 3600, false);
      });

      it("Rejects auction whose start price per tonne is below minimum", async function () {
        const { marketplace, trader1 } = await loadFixture(deployMarketplaceFixture);
        const endTime = (await time.latest()) + 2 * 3600;
        // 100 tonnes, total 0.99 => 0.0099 / tonne
        await expect(marketplace.connect(trader1).createAuction(AMOUNT, U("0.99"), endTime)).to.be.revertedWith(
          "Price below minimum"
        );
        // total 1 => exactly 0.01 / tonne
        await expect(marketplace.connect(trader1).createAuction(AMOUNT, U(1), endTime)).to.emit(
          marketplace,
          "AuctionCreated"
        );
      });

      it("Admin can update minimum price and event is emitted", async function () {
        const { marketplace, owner } = await loadFixture(deployMarketplaceFixture);
        const newMin = U(1);
        await expect(marketplace.connect(owner).setMinPricePerTonne(newMin))
          .to.emit(marketplace, "MinPriceUpdated")
          .withArgs(MIN, newMin);
        expect(await marketplace.minPricePerTonne()).to.equal(newMin);
      });

      it("Rejects non-admin, zero and above-cap minimum price", async function () {
        const { marketplace, owner, trader1 } = await loadFixture(deployMarketplaceFixture);
        await expect(marketplace.connect(trader1).setMinPricePerTonne(1n)).to.be.reverted;
        await expect(marketplace.connect(owner).setMinPricePerTonne(0)).to.be.revertedWith("Invalid min price");
        const cap = U(1_000_000);
        await expect(marketplace.connect(owner).setMinPricePerTonne(cap + 1n)).to.be.revertedWith(
          "Min price too high"
        );
        await expect(marketplace.connect(owner).setMinPricePerTonne(cap)).to.emit(marketplace, "MinPriceUpdated");
      });
    });

    // ============ AUCTIONS ============
    describe("Auctions", function () {
      async function auctionFixture() {
        const base = await deployMarketplaceFixture();
        const { marketplace, trader1 } = base;
        const endTime = (await time.latest()) + 2 * 3600;
        await marketplace.connect(trader1).createAuction(T(100), U(10), endTime);
        return { ...base, endTime };
      }

      it("Seller cannot bid on own auction", async function () {
        const { marketplace, trader1 } = await loadFixture(auctionFixture);
        await expect(marketplace.connect(trader1).placeBid(1, U(20))).to.be.revertedWith("Seller cannot bid");
      });

      it("Other bidders can bid, bids must beat start price and the highest bid", async function () {
        const { marketplace, trader2, enterprise } = await loadFixture(auctionFixture);
        await expect(marketplace.connect(trader2).placeBid(1, U(9))).to.be.revertedWith("Bid below start price");
        await expect(marketplace.connect(trader2).placeBid(1, U(20)))
          .to.emit(marketplace, "BidPlaced")
          .withArgs(1, trader2.address, U(20));
        await expect(marketplace.connect(enterprise).placeBid(1, U(20))).to.be.revertedWith("Bid too low");
      });

      it("Outbid bidder is refunded immediately; winner gets CCT; seller paid net of snapshot fee", async function () {
        const { marketplace, token, usdc, trader1, trader2, enterprise, owner, endTime } =
          await loadFixture(auctionFixture);
        await marketplace.connect(trader2).placeBid(1, U(20));
        const before = await usdc.balanceOf(trader2.address);
        await marketplace.connect(enterprise).placeBid(1, U(30));
        expect((await usdc.balanceOf(trader2.address)) - before).to.equal(U(20));
        expect(await marketplace.pendingWithdrawals(trader2.address)).to.equal(0n);

        await marketplace.connect(owner).setTradingFee(100); // must not apply to this auction
        await expect(marketplace.finalizeAuction(1)).to.be.revertedWith("Auction not ended");
        await time.increaseTo(endTime);
        const sellerBefore = await usdc.balanceOf(trader1.address);
        await marketplace.finalizeAuction(1);
        expect(await token.balanceOf(enterprise.address)).to.equal(T(100));
        expect((await usdc.balanceOf(trader1.address)) - sellerBefore).to.equal(U(30) - fee(U(30)));
        expect(await marketplace.accruedFees()).to.equal(fee(U(30)));
      });

      it("Unbid auction returns the lot on finalize; cancel only before bids", async function () {
        const { marketplace, token, trader1, trader2, endTime } = await loadFixture(auctionFixture);
        const before = await token.balanceOf(trader1.address);
        await marketplace.connect(trader1).cancelAuction(1);
        expect((await token.balanceOf(trader1.address)) - before).to.equal(T(100));

        await marketplace.connect(trader1).createAuction(T(100), U(10), endTime + 100);
        await marketplace.connect(trader2).placeBid(2, U(10));
        await expect(marketplace.connect(trader1).cancelAuction(2)).to.be.revertedWith("Auction has bids");
      });

      it("Enforces min / max auction duration", async function () {
        const { marketplace, trader1 } = await loadFixture(deployMarketplaceFixture);
        const now = await time.latest();
        await expect(marketplace.connect(trader1).createAuction(T(10), U(10), now + 600)).to.be.revertedWith(
          "Duration too short"
        );
        await expect(
          marketplace.connect(trader1).createAuction(T(10), U(10), now + 31 * DAY)
        ).to.be.revertedWith("Duration too long");
        await marketplace.connect(trader1).createAuction(T(10), U(10), now + 30 * DAY);
      });
    });

    // ============ PULL PAYMENTS ============
    describe("Pull payments", function () {
      it("claim() reverts when nothing is pending", async function () {
        const { marketplace, trader1 } = await loadFixture(deployMarketplaceFixture);
        await expect(marketplace.connect(trader1).claim()).to.be.revertedWith("Nothing to claim");
      });
    });

    describe("Own order fill guard", function () {
      it("Rejects filling your own order", async function () {
        const { marketplace, trader1 } = await loadFixture(deployMarketplaceFixture);
        await marketplace.connect(trader1).createSellOrder(T(100), PRICE, 3600, false);
        await expect(marketplace.connect(trader1).fillOrder(1, T(100))).to.be.revertedWith("Cannot fill own order");
      });
    });
  });
}
