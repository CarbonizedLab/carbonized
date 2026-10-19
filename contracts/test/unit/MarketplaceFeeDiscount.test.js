const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployMarket, giveCCT, approveAll, PAYMENT_DECIMALS } = require("../poc/helpers/marketFixture");

const MODE = { Fixed: 0, PerUser: 1, Revert: 2, BurnGas: 3, ShortReturn: 4, HugeReturn: 5, Empty: 6 };
const DENOM = 10_000n;

/** fee = cost * snapshotBps * (10000 - discount) / 1e8 (same rounding as the contract) */
const expectedFee = (cost, baseBps, discount) => (cost * baseBps * (DENOM - discount)) / (DENOM * DENOM);

for (const dec of PAYMENT_DECIMALS) {
  describe(`CarbonMarketplace fee discount (${dec}-decimal payment token)`, function () {
    let ctx, owner, alice, bob, carol, attacker, market, usdc, token, U, provider;
    const TONNES = 100;

    beforeEach(async function () {
      ctx = await deployMarket({ paymentDecimals: dec });
      ({ owner, alice, bob, carol, attacker, market, usdc, token, U } = ctx);
      provider = await (await ethers.getContractFactory("MockFeeDiscount")).deploy();
      await provider.waitForDeployment();
      await provider.set(MODE.PerUser, 0);

      for (const u of [alice, bob, carol]) {
        await giveCCT(ctx, u, 1000);
        await usdc.mint(u.address, U(1_000_000));
        await approveAll(ctx, u);
      }
    });

    const cost = () => U(TONNES * 10); // 100 tonnes @ 10 per tonne
    const baseFee = () => expectedFee(cost(), 25n, 0n);
    const amount = () => ethers.parseUnits(TONNES.toString(), 18);

    async function setProvider() {
      await market.setFeeDiscountProvider(await provider.getAddress());
    }

    describe("sell order: the maker (seller) pays the fee", function () {
      it("without a provider the fee is the snapshotted base fee", async function () {
        await market.connect(alice).createSellOrder(amount(), U(10), 0, false);
        const before = await usdc.balanceOf(alice.address);
        await market.connect(bob).fillOrder(1, amount());
        expect(await market.accruedFees()).to.equal(baseFee());
        expect((await usdc.balanceOf(alice.address)) - before).to.equal(cost() - baseFee());
      });

      it("applies the MAKER's discount and credits the discounted fee to accruedFees", async function () {
        await setProvider();
        await provider.setUser(alice.address, 2000); // 20% off the fee
        await provider.setUser(bob.address, 5000); // taker's discount is irrelevant for a sell order
        await market.connect(alice).createSellOrder(amount(), U(10), 0, false);
        const before = await usdc.balanceOf(alice.address);
        await expect(market.connect(bob).fillOrder(1, amount()))
          .to.emit(market, "FeeDiscountApplied")
          .withArgs(alice.address, 2000, expectedFee(cost(), 25n, 2000n));
        const fee = expectedFee(cost(), 25n, 2000n);
        expect(await market.accruedFees()).to.equal(fee);
        expect((await usdc.balanceOf(alice.address)) - before).to.equal(cost() - fee);
        expect(fee).to.be.lt(baseFee());
      });
    });

    describe("buy order: the taker (who sells CCT) pays the fee", function () {
      it("applies the TAKER's discount, not the maker's", async function () {
        await setProvider();
        await provider.setUser(alice.address, 5000); // maker (buyer) - irrelevant
        await provider.setUser(bob.address, 1000); // taker (seller)
        await market.connect(alice).createBuyOrder(amount(), U(10), 0, false);
        const before = await usdc.balanceOf(bob.address);
        await market.connect(bob).fillOrder(1, amount());
        const fee = expectedFee(cost(), 25n, 1000n);
        expect(await market.accruedFees()).to.equal(fee);
        expect((await usdc.balanceOf(bob.address)) - before).to.equal(cost() - fee);
      });

      it("partial fills are discounted per fill", async function () {
        await setProvider();
        await provider.setUser(bob.address, 4000);
        await market.connect(alice).createBuyOrder(amount(), U(10), 0, false);
        const half = amount() / 2n;
        await market.connect(bob).fillOrder(1, half);
        await market.connect(bob).fillOrder(1, half);
        expect(await market.accruedFees()).to.equal(2n * expectedFee(cost() / 2n, 25n, 4000n));
      });
    });

    describe("auction: the seller pays the fee", function () {
      it("applies the seller's discount at finalization", async function () {
        await setProvider();
        await provider.setUser(alice.address, 3000);
        await provider.setUser(bob.address, 5000); // bidder: irrelevant
        const end = (await time.latest()) + 2 * 3600;
        await market.connect(alice).createAuction(amount(), cost(), end);
        await market.connect(bob).placeBid(1, cost());
        await time.increaseTo(end + 1);
        const before = await usdc.balanceOf(alice.address);
        await market.connect(carol).finalizeAuction(1);
        const fee = expectedFee(cost(), 25n, 3000n);
        expect(await market.accruedFees()).to.equal(fee);
        expect((await usdc.balanceOf(alice.address)) - before).to.equal(cost() - fee);
      });
    });

    describe("bounds and non-retroactivity", function () {
      it("clamps the discount to 50% of the snapshotted fee", async function () {
        await setProvider();
        await provider.set(MODE.Fixed, 10_000); // provider claims a 100% discount
        expect(await market.feeDiscountBpsOf(alice.address)).to.equal(5000n);
        await market.connect(alice).createSellOrder(amount(), U(10), 0, false);
        await market.connect(bob).fillOrder(1, amount());
        expect(await market.accruedFees()).to.equal(expectedFee(cost(), 25n, 5000n));
        expect(await market.MAX_FEE_DISCOUNT_BPS()).to.equal(5000n);
      });

      it("a later base-fee change does not touch an existing order: the discount applies to the SNAPSHOT", async function () {
        await setProvider();
        await provider.setUser(alice.address, 2000);
        await market.connect(alice).createSellOrder(amount(), U(10), 0, false); // snapshot 25 bps
        await market.setTradingFee(100); // governance raises the fee to 1%
        await market.connect(bob).fillOrder(1, amount());
        expect(await market.accruedFees()).to.equal(expectedFee(cost(), 25n, 2000n));

        // an order created afterwards snapshots the new fee
        await market.connect(alice).createSellOrder(amount(), U(10), 0, false);
        const before = await market.accruedFees();
        await market.connect(bob).fillOrder(2, amount());
        expect((await market.accruedFees()) - before).to.equal(expectedFee(cost(), 100n, 2000n));
      });

      it("the discount can only lower the fee: never above the snapshot", async function () {
        await setProvider();
        await provider.setUser(alice.address, 0);
        await market.connect(alice).createSellOrder(amount(), U(10), 0, false);
        await market.connect(bob).fillOrder(1, amount());
        expect(await market.accruedFees()).to.equal(baseFee());
      });

      it("AMM swaps are NOT discounted (their fee stays with LPs)", async function () {
        await market.connect(alice).addLiquidity(amount(), cost(), 0, 0, 0);
        const quote = async () => {
          const tx = await market.connect(bob).swap(true, ethers.parseUnits("10", 18), 0);
          const rc = await tx.wait();
          const ev = rc.logs.map((l) => market.interface.parseLog(l)).find((l) => l && l.name === "Swap");
          return ev.args.fee;
        };
        const noDiscountFee = await quote();
        await setProvider();
        await provider.set(MODE.Fixed, 5000);
        expect(await quote()).to.equal(noDiscountFee);
      });
    });

    describe("a broken provider can never block trading", function () {
      for (const [label, mode] of [
        ["reverting", MODE.Revert],
        ["gas-burning", MODE.BurnGas],
        ["short return data", MODE.ShortReturn],
        ["16 KiB return data (extra data ignored, value still read)", MODE.HugeReturn],
        ["empty return data", MODE.Empty],
      ]) {
        it(`${label} provider: order fill and auction settle at the full base fee`, async function () {
          await setProvider();
          await provider.set(mode, 5000);
          expect(await market.feeDiscountBpsOf(alice.address)).to.equal(mode === MODE.HugeReturn ? 5000n : 0n);
          const full = mode === MODE.HugeReturn ? expectedFee(cost(), 25n, 5000n) : baseFee();

          await market.connect(alice).createSellOrder(amount(), U(10), 0, false);
          await market.connect(bob).fillOrder(1, amount());
          expect(await market.accruedFees()).to.equal(full);

          const end = (await time.latest()) + 2 * 3600;
          await market.connect(alice).createAuction(amount(), cost(), end);
          await market.connect(bob).placeBid(1, cost());
          await time.increaseTo(end + 1);
          await market.finalizeAuction(1);
          expect(await market.accruedFees()).to.equal(2n * full);
        });
      }

      it("gas-burning provider cost is capped by DISCOUNT_GAS_LIMIT", async function () {
        await setProvider();
        await provider.set(MODE.BurnGas, 0);
        await market.connect(alice).createSellOrder(amount(), U(10), 0, false);
        const tx = await market.connect(bob).fillOrder(1, amount());
        const rc = await tx.wait();
        expect(rc.gasUsed).to.be.lt(400_000n);
      });

      it("a provider that stops being a contract / is cleared falls back to no discount", async function () {
        await setProvider();
        await provider.setUser(alice.address, 5000);
        await market.setFeeDiscountProvider(ethers.ZeroAddress);
        await market.connect(alice).createSellOrder(amount(), U(10), 0, false);
        await market.connect(bob).fillOrder(1, amount());
        expect(await market.accruedFees()).to.equal(baseFee());
      });

      it("fees accrued with discounts are withdrawable and escrow is untouched", async function () {
        await setProvider();
        await provider.setUser(alice.address, 5000);
        await market.connect(alice).createSellOrder(amount(), U(10), 0, false);
        await market.connect(bob).fillOrder(1, amount());
        const fee = await market.accruedFees();
        await market.connect(owner).withdrawFees(carol.address);
        expect(await market.accruedFees()).to.equal(0n);
        expect(fee).to.equal(expectedFee(cost(), 25n, 5000n));
      });
    });

    describe("provider and parameter administration", function () {
      it("only admin / PARAMETER_ROLE can set the provider; it must be a contract (or zero)", async function () {
        await expect(market.connect(attacker).setFeeDiscountProvider(await provider.getAddress())).to.be.reverted;
        await expect(market.setFeeDiscountProvider(attacker.address)).to.be.revertedWith("Provider not a contract");
        await expect(market.setFeeDiscountProvider(await provider.getAddress()))
          .to.emit(market, "FeeDiscountProviderUpdated")
          .withArgs(ethers.ZeroAddress, await provider.getAddress());
        await market.setFeeDiscountProvider(ethers.ZeroAddress);
        expect(await market.feeDiscountProvider()).to.equal(ethers.ZeroAddress);
      });

      it("PARAMETER_ROLE (a timelock) can tune parameters but cannot pause, set KYC, withdraw fees or manage roles", async function () {
        const PARAMETER_ROLE = await market.PARAMETER_ROLE();
        expect(await market.hasRole(PARAMETER_ROLE, owner.address)).to.equal(false); // not granted at construction
        await market.grantRole(PARAMETER_ROLE, carol.address);

        await market.connect(carol).setTradingFee(50);
        await market.connect(carol).setMinPricePerTonne(U(1));
        await market.connect(carol).setKYCGate(true);
        await market.connect(carol).setKYCGate(false);
        await market.connect(carol).setFeeDiscountProvider(await provider.getAddress());
        expect(await market.tradingFeePercent()).to.equal(50n);
        expect(await market.minPricePerTonne()).to.equal(U(1));

        await expect(market.connect(carol).setTradingFee(101)).to.be.revertedWith("Fee too high");
        await expect(market.connect(carol).pause()).to.be.reverted;
        await expect(market.connect(carol).unpause()).to.be.reverted;
        await expect(market.connect(carol).setKYCStatus(alice.address, true)).to.be.reverted;
        await expect(market.connect(carol).withdrawFees(carol.address)).to.be.reverted;
        await expect(market.connect(carol).grantRole(PARAMETER_ROLE, attacker.address)).to.be.reverted;
      });

      it("the default admin keeps its direct control (existing behaviour) and attackers have none", async function () {
        await market.setTradingFee(30);
        expect(await market.tradingFeePercent()).to.equal(30n);
        await expect(market.connect(attacker).setTradingFee(1)).to.be.reverted;
        await expect(market.connect(attacker).setMinPricePerTonne(1)).to.be.reverted;
        await expect(market.connect(attacker).setKYCGate(true)).to.be.reverted;
      });
    });
  });
}
