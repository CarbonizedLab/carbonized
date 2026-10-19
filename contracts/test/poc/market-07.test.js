const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployMarket, giveCCT, approveAll, E18, PAYMENT_DECIMALS } = require("./helpers/marketFixture");

/**
 * [AUD-MARKET-07] REGRESSION: KYC handling is consistent.
 *  - a requiresKYC order is re-checked against the MAKER at fill time (revoked maker => not fillable,
 *    he can still cancel and recover his escrow);
 *  - AMM + auctions are documented non-KYC by default; the admin can switch on a global gate
 *    (`setKYCGate`) that requires KYC for addLiquidity / swap / createAuction / placeBid while exits
 *    (removeLiquidity, cancel, finalize, claim) stay open.
 * KYC does not follow the CCT token itself (plain ERC20), which is documented, not changed.
 */
for (const dec of PAYMENT_DECIMALS) {
  describe(`[AUD-MARKET-07] KYC gating (${dec}-dec payment token)`, function () {
    async function setup() {
      const ctx = await deployMarket({ paymentDecimals: dec });
      const { usdc, attacker: maker, victim: kycTaker, alice: nonKyc, bob, U } = ctx;
      await giveCCT(ctx, maker, 100);
      await giveCCT(ctx, bob, 100);
      for (const u of [kycTaker, nonKyc, bob]) await usdc.mint(u.address, U(10000));
      for (const s of [maker, kycTaker, nonKyc, bob]) await approveAll(ctx, s);
      await ctx.market.setKYCStatus(maker.address, true);
      await ctx.market.setKYCStatus(kycTaker.address, true);
      return ctx;
    }

    it("[AUD-MARKET-07] revoked-KYC maker's KYC-only order can no longer be filled, but he can cancel", async function () {
      const { market, token, owner, attacker: maker, victim: kycTaker, alice: nonKyc, U } = await setup();
      await market.connect(maker).createSellOrder(10n * E18, U(10), 0, true);
      await market.connect(kycTaker).fillOrder(1, 2n * E18); // fine while the maker is verified
      await market.connect(owner).setKYCStatus(maker.address, false);

      await expect(market.connect(nonKyc).fillOrder(1, 1n * E18)).to.be.revertedWith("KYC required");
      await expect(market.connect(kycTaker).fillOrder(1, 1n * E18)).to.be.revertedWith("Maker KYC revoked");

      const before = await token.balanceOf(maker.address);
      await market.connect(maker).cancelOrder(1);
      expect((await token.balanceOf(maker.address)) - before).to.equal(8n * E18);
    });

    it("[AUD-MARKET-07] non-KYC orders are unaffected by KYC status", async function () {
      const { market, owner, attacker: maker, alice: nonKyc, U } = await setup();
      await market.connect(maker).createSellOrder(10n * E18, U(10), 0, false);
      await market.connect(owner).setKYCStatus(maker.address, false);
      await market.connect(nonKyc).fillOrder(1, 1n * E18);
    });

    it("[AUD-MARKET-07] AMM and auctions are open by default (documented), gate is admin-only and off", async function () {
      const { market, token, bob, alice: nonKyc, attacker, U } = await setup();
      expect(await market.kycGateEnabled()).to.equal(false);
      await expect(market.connect(attacker).setKYCGate(true)).to.be.reverted;
      await market.connect(bob).addLiquidity(50n * E18, U(500), 0, 0, 0);
      await market.connect(nonKyc).swap(false, U(100), 0);
      expect(await token.balanceOf(nonKyc.address)).to.be.gt(0n);
    });

    it("[AUD-MARKET-07] with the global gate on, non-KYC wallets cannot use AMM entry points or auctions", async function () {
      const { market, token, usdc, owner, bob, attacker: maker, victim: kycTaker, alice: nonKyc, U } = await setup();
      await market.connect(owner).setKYCStatus(bob.address, true);
      await market.connect(bob).addLiquidity(50n * E18, U(500), 0, 0, 0);

      await expect(market.connect(owner).setKYCGate(true)).to.emit(market, "KYCGateUpdated").withArgs(true);

      await expect(market.connect(nonKyc).swap(false, U(100), 0)).to.be.revertedWith("KYC required");
      await expect(market.connect(nonKyc).addLiquidity(E18, U(10), 0, 0, 0)).to.be.revertedWith("KYC required");
      const end = (await ethers.provider.getBlock("latest")).timestamp + 2 * 3600;
      await expect(market.connect(nonKyc).createAuction(E18, U(10), end)).to.be.revertedWith("KYC required");

      // KYC'd users work, and bids from non-KYC are refused
      await market.connect(kycTaker).swap(false, U(100), 0);
      await market.connect(maker).createAuction(10n * E18, U(50), end);
      await expect(market.connect(nonKyc).placeBid(1, U(60))).to.be.revertedWith("KYC required");
      await market.connect(kycTaker).placeBid(1, U(60));

      // exits are never gated: a revoked LP can still remove liquidity, anyone can finalize
      await market.connect(owner).setKYCStatus(bob.address, false);
      await market.connect(bob).removeLiquidity(await market.lpTokens(bob.address), 0, 0);
      await ethers.provider.send("evm_setNextBlockTimestamp", [end + 1]);
      await market.connect(nonKyc).finalizeAuction(1);
      expect(await token.balanceOf(kycTaker.address)).to.be.gt(10n * E18 - 1n);
      expect(await usdc.balanceOf(await market.getAddress())).to.be.gt(0n);
    });
  });
}
