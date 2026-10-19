const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployMarket, giveCCT, approveAll, E18, PAYMENT_DECIMALS } = require("./helpers/marketFixture");

/**
 * [AUD-MARKET-03] REGRESSION: order-book / auction fees are tracked in `accruedFees` and can be withdrawn
 * with `withdrawFees(to)` (FEE_MANAGER_ROLE), without ever touching user escrow. Fee changes are not
 * retroactive for existing orders / auctions.
 */
for (const dec of PAYMENT_DECIMALS) {
  describe(`[AUD-MARKET-03] fee withdrawal (${dec}-dec payment token)`, function () {
    async function setup() {
      const ctx = await deployMarket({ paymentDecimals: dec });
      const { usdc, attacker: seller, victim: buyer, alice: bidder, U } = ctx;
      await giveCCT(ctx, seller, 400);
      await usdc.mint(buyer.address, U(10000));
      await usdc.mint(bidder.address, U(10000));
      for (const s of [seller, buyer, bidder]) await approveAll(ctx, s);
      return ctx;
    }

    it("[AUD-MARKET-03] fees accrue, are withdrawable by the fee manager only, and never touch escrow", async function () {
      const ctx = await setup();
      const { market, usdc, owner, attacker: seller, victim: buyer, alice: bidder, bob, U } = ctx;

      // order-book trade: 100 CCT @ 10 = 1000, fee 2.5 ; plus an untouched buy order holding 300 of escrow
      await market.connect(seller).createSellOrder(100n * E18, U(10), 0, false);
      await market.connect(buyer).fillOrder(1, 100n * E18);
      await market.connect(buyer).createBuyOrder(30n * E18, U(10), 0, false); // escrow 300

      // auction: winning bid 1000, fee 2.5
      const end = (await ethers.provider.getBlock("latest")).timestamp + 2 * 3600;
      await market.connect(seller).createAuction(100n * E18, U(500), end);
      await market.connect(bidder).placeBid(1, U(1000));
      await ethers.provider.send("evm_setNextBlockTimestamp", [end + 1]);
      await market.finalizeAuction(1);

      const fees = (U(1000) * 25n) / 10000n * 2n;
      expect(await market.accruedFees()).to.equal(fees);
      const mkt = await market.getAddress();
      expect(await usdc.balanceOf(mkt)).to.equal(fees + U(300)); // fees + open buy-order escrow

      await expect(market.connect(bob).withdrawFees(bob.address)).to.be.reverted;
      await expect(market.connect(owner).withdrawFees(ethers.ZeroAddress)).to.be.revertedWith("Invalid recipient");

      await expect(market.connect(owner).withdrawFees(bob.address))
        .to.emit(market, "FeesWithdrawn")
        .withArgs(bob.address, fees);
      expect(await usdc.balanceOf(bob.address)).to.equal(fees);
      expect(await market.accruedFees()).to.equal(0n);
      // escrow of the open buy order is untouched and refundable
      expect(await usdc.balanceOf(mkt)).to.equal(U(300));
      await expect(market.connect(owner).withdrawFees(bob.address)).to.be.revertedWith("No fees");
      const before = await usdc.balanceOf(buyer.address);
      await market.connect(buyer).cancelOrder(2);
      expect((await usdc.balanceOf(buyer.address)) - before).to.equal(U(300));
      expect(await usdc.balanceOf(mkt)).to.equal(0n);
    });

    it("[AUD-MARKET-03] fee manager role can be delegated and the fee change is not retroactive", async function () {
      const { market, usdc, owner, attacker: seller, victim: buyer, bob, carol, U } = await setup();

      await market.connect(seller).createSellOrder(100n * E18, U(10), 0, false); // created at 0.25 %
      await expect(market.connect(owner).setTradingFee(100)).to.emit(market, "TradingFeeUpdated").withArgs(25, 100);
      await expect(market.connect(owner).setTradingFee(101)).to.be.revertedWith("Fee too high");
      await market.connect(buyer).fillOrder(1, 100n * E18);
      expect(await market.accruedFees()).to.equal((U(1000) * 25n) / 10000n); // old fee, not 1 %

      // new orders use the new fee
      await market.connect(seller).createSellOrder(100n * E18, U(10), 0, false);
      const before = await market.accruedFees();
      await market.connect(buyer).fillOrder(2, 100n * E18);
      expect((await market.accruedFees()) - before).to.equal((U(1000) * 100n) / 10000n);

      // delegate to a treasury / multisig
      await market.connect(owner).grantRole(await market.FEE_MANAGER_ROLE(), carol.address);
      await expect(market.connect(carol).withdrawFees(bob.address)).to.emit(market, "FeesWithdrawn");
      expect(await usdc.balanceOf(bob.address)).to.be.gt(0n);
    });
  });
}
