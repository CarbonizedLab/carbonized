const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployMarket, giveCCT, approveAll, E18, PAYMENT_DECIMALS } = require("./helpers/marketFixture");

const YEAR = 365 * 24 * 3600;
const DAY = 24 * 3600;

/**
 * [AUD-MARKET-04] REGRESSION: auction duration is bounded (MIN 1 hour, MAX 30 days) so a seller can no
 * longer freeze bidders' funds / the lot for years (or by typo, e.g. milliseconds instead of seconds).
 */
for (const dec of PAYMENT_DECIMALS) {
  describe(`[AUD-MARKET-04] bounded auction duration (${dec}-dec payment token)`, function () {
    async function setup() {
      const ctx = await deployMarket({ paymentDecimals: dec });
      const { usdc, attacker: seller, victim: bidder, U } = ctx;
      await giveCCT(ctx, seller, 10);
      await usdc.mint(bidder.address, U(5000));
      await approveAll(ctx, seller);
      await approveAll(ctx, bidder);
      return ctx;
    }

    it("[AUD-MARKET-04] a 100-year auction (or a ms-timestamp typo) cannot be created", async function () {
      const { market, attacker: seller, U } = await setup();
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      expect(await market.MAX_AUCTION_DURATION()).to.equal(30 * DAY);
      expect(await market.MIN_AUCTION_DURATION()).to.equal(3600);
      // a tiny lot used to be enough to lock a bidder for 100 years
      await expect(market.connect(seller).createAuction(E18, U(1), now + 100 * YEAR)).to.be.revertedWith(
        "Duration too long"
      );
      await expect(market.connect(seller).createAuction(10n * E18, U(100), now * 1000)).to.be.revertedWith(
        "Duration too long"
      );
      await expect(market.connect(seller).createAuction(10n * E18, U(100), now + 30 * DAY + 100)).to.be.revertedWith(
        "Duration too long"
      );
    });

    it("[AUD-MARKET-04] too-short auctions are rejected", async function () {
      const { market, attacker: seller, U } = await setup();
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await expect(market.connect(seller).createAuction(10n * E18, U(100), now + 60)).to.be.revertedWith(
        "Duration too short"
      );
      await expect(market.connect(seller).createAuction(10n * E18, U(100), now)).to.be.revertedWith(
        "Duration too short"
      );
    });

    it("[AUD-MARKET-04] a bid on a max-duration auction is recoverable after at most 30 days", async function () {
      const { market, usdc, token, attacker: seller, victim: bidder, U } = await setup();
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const end = now + 30 * DAY;
      await market.connect(seller).createAuction(10n * E18, U(100), end);
      await market.connect(bidder).placeBid(1, U(500));

      await expect(market.finalizeAuction(1)).to.be.revertedWith("Auction not ended");
      await ethers.provider.send("evm_setNextBlockTimestamp", [end]);
      await market.finalizeAuction(1);
      expect(await token.balanceOf(bidder.address)).to.equal(10n * E18);
      expect(await usdc.balanceOf(await market.getAddress())).to.equal((U(500) * 25n) / 10000n); // only the fee remains
    });
  });
}
