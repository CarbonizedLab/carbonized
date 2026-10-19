const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployMarket, giveCCT, approveAll, E18 } = require("./helpers/marketFixture");

/**
 * [AUD-MARKET-05] REGRESSION (production-only): a USDC-blacklisted participant can no longer freeze an
 * auction / order. Refunds and proceeds that the payment token refuses to push are credited to
 * `pendingWithdrawals` (pull payment, `claim()`), so settlement of everybody else always completes.
 * Uses BlacklistERC20 (6 decimals) which mimics the USDC blacklist.
 */
describe("[AUD-MARKET-05] USDC blacklist no longer freezes auctions (6-dec blacklist token)", function () {
  async function setup() {
    const ctx = await deployMarket({ paymentContract: "BlacklistERC20", paymentDecimals: 6 });
    const { usdc, attacker: seller, victim: bidder1, alice: bidder2, U } = ctx;
    await giveCCT(ctx, seller, 100);
    for (const b of [bidder1, bidder2]) await usdc.mint(b.address, U(100000));
    for (const s of [seller, bidder1, bidder2]) await approveAll(ctx, s);
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    return { ctx, end: now + 2 * 3600 };
  }

  it("[AUD-MARKET-05] blacklisted highest bidder cannot block competing bids; his refund is claimable later", async function () {
    const { ctx, end } = await setup();
    const { market, usdc, token, attacker: seller, victim: bidder1, alice: bidder2, U } = ctx;
    await market.connect(seller).createAuction(10n * E18, U(10), end);
    await market.connect(bidder1).placeBid(1, U(10));
    await usdc.setBlacklisted(bidder1.address, true); // compliance blacklist hits bidder1

    // honest bidder2 offers 100x more and succeeds; bidder1's refund is parked for a pull payment
    await expect(market.connect(bidder2).placeBid(1, U(1000)))
      .to.emit(market, "PaymentDeferred")
      .withArgs(bidder1.address, U(10));
    expect(await market.pendingWithdrawals(bidder1.address)).to.equal(U(10));
    await expect(market.connect(bidder1).claim()).to.be.revertedWith("Blacklisted");

    await ethers.provider.send("evm_setNextBlockTimestamp", [end + 1]);
    await market.finalizeAuction(1);
    expect(await token.balanceOf(bidder2.address)).to.equal(10n * E18); // lot goes to the real winner

    // once the blacklist is lifted the refund is recoverable and the accounting closes
    await usdc.setBlacklisted(bidder1.address, false);
    const before = await usdc.balanceOf(bidder1.address);
    await expect(market.connect(bidder1).claim()).to.emit(market, "PaymentClaimed").withArgs(bidder1.address, U(10));
    expect((await usdc.balanceOf(bidder1.address)) - before).to.equal(U(10));
    expect(await market.pendingWithdrawals(bidder1.address)).to.equal(0n);
    await expect(market.connect(bidder1).claim()).to.be.revertedWith("Nothing to claim");
  });

  it("[AUD-MARKET-05] blacklisted seller cannot make finalizeAuction revert: winner gets the lot, proceeds are pending", async function () {
    const { ctx, end } = await setup();
    const { market, usdc, token, attacker: seller, victim: bidder1, U } = ctx;
    await market.connect(seller).createAuction(10n * E18, U(10), end);
    await market.connect(bidder1).placeBid(1, U(500));
    await usdc.setBlacklisted(seller.address, true);

    await ethers.provider.send("evm_setNextBlockTimestamp", [end + 1]);
    await market.finalizeAuction(1);
    expect(await token.balanceOf(bidder1.address)).to.equal(10n * E18);

    const fee = (U(500) * 25n) / 10000n;
    expect(await market.pendingWithdrawals(seller.address)).to.equal(U(500) - fee);
    expect(await market.accruedFees()).to.equal(fee);
    // contract holds exactly pending + fees, nothing is locked beyond that
    expect(await usdc.balanceOf(await market.getAddress())).to.equal(U(500));

    await usdc.setBlacklisted(seller.address, false);
    await market.connect(seller).claim();
    expect(await usdc.balanceOf(await market.getAddress())).to.equal(fee);
  });

  it("[AUD-MARKET-05] blacklisted maker of a sell order cannot block fills (same class)", async function () {
    const { ctx } = await setup();
    const { market, usdc, token, attacker: maker, victim: taker, U } = ctx;
    await market.connect(maker).createSellOrder(10n * E18, U(10), 0, false);
    await usdc.setBlacklisted(maker.address, true);

    await market.connect(taker).fillOrder(1, 10n * E18);
    expect(await token.balanceOf(taker.address)).to.equal(10n * E18);
    const fee = (U(100) * 25n) / 10000n;
    expect(await market.pendingWithdrawals(maker.address)).to.equal(U(100) - fee);
  });
});
