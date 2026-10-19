const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployMarket, giveCCT, approveAll, E18, PAYMENT_DECIMALS } = require("./helpers/marketFixture");

/**
 * [AUD-MARKET-01] REGRESSION: AMM first-depositor / share-inflation attack must no longer work.
 *
 * Original exploit: seed the pool with 1 wei / 1 wei (1 LP wei, nothing locked), inflate stableReserve with a
 * swap whose output rounds to 0 (full amountIn still credited), let the victim deposit (0 LP minted, funds
 * taken) and burn the single LP wei to take everything.
 * Fixes: MINIMUM_LIQUIDITY permanently locked on first deposit, `lpMinted > 0` enforced, zero-output swaps
 * revert, proportional deposits with min-amount / minLiquidity params.
 */
for (const dec of PAYMENT_DECIMALS) {
  describe(`[AUD-MARKET-01] AMM first-depositor inflation (${dec}-dec payment token)`, function () {
    async function setup() {
      const ctx = await deployMarket({ paymentDecimals: dec });
      const { usdc, attacker, victim, U } = ctx;
      await giveCCT(ctx, attacker, 10);
      await giveCCT(ctx, victim, 100);
      await usdc.mint(attacker.address, U(50000));
      await usdc.mint(victim.address, U(1000));
      await approveAll(ctx, attacker);
      await approveAll(ctx, victim);
      return ctx;
    }

    it("[AUD-MARKET-01] 1 wei / 1 wei seeding is rejected and MINIMUM_LIQUIDITY is locked forever", async function () {
      const { market, attacker } = await setup();
      await expect(market.connect(attacker).addLiquidity(1n, 1n, 0, 0, 0)).to.be.revertedWith(
        "Insufficient initial liquidity"
      );

      const min = await market.MINIMUM_LIQUIDITY();
      await market.connect(attacker).addLiquidity(10n * E18, 100n * 10n ** BigInt(dec), 0, 0, 0);
      expect(await market.lpTokens(ethers.ZeroAddress)).to.equal(min);
      const pool = await market.ammPool();
      expect(pool.totalLPTokens).to.equal((await market.lpTokens(attacker.address)) + min);

      // the sole LP removing everything still leaves reserves behind, the pool can never be emptied
      await market.connect(attacker).removeLiquidity(await market.lpTokens(attacker.address), 0, 0);
      const after = await market.ammPool();
      expect(after.totalLPTokens).to.equal(min);
      expect(after.carbonReserve).to.be.gt(0n);
      expect(after.stableReserve).to.be.gt(0n);
    });

    it("[AUD-MARKET-01] zero-output swap no longer donates the input into the reserve", async function () {
      const { market, attacker } = await setup();
      // smallest legal seed
      await market.connect(attacker).addLiquidity(2000n, 2000n, 0, 0, 0);
      const before = await market.ammPool();
      await expect(market.connect(attacker).swap(false, 1n, 0)).to.be.revertedWith("Insufficient output");
      const after = await market.ammPool();
      expect(after.stableReserve).to.equal(before.stableReserve);
    });

    it("[AUD-MARKET-01] victim of an inflated pool is protected: deposit reverts instead of minting 0 LP", async function () {
      const { market, token, usdc, attacker, victim, U } = await setup();
      await market.connect(attacker).addLiquidity(2000n, 2000n, 0, 0, 0);
      // attacker tries to skew the pool with a large swap (costs him real value now)
      const X = U(2000);
      await market.connect(attacker).swap(false, X, 0);

      const vCct = await token.balanceOf(victim.address);
      const vUsdc = await usdc.balanceOf(victim.address);
      await expect(
        market.connect(victim).addLiquidity(100n * E18, U(1000), 0, 0, 1n)
      ).to.be.revertedWith("Insufficient liquidity minted");
      // and with the victim's own min-amount protection the old price expectation is enforced too
      await expect(
        market.connect(victim).addLiquidity(100n * E18, U(1000), 100n * E18, U(1000), 0)
      ).to.be.reverted;
      expect(await token.balanceOf(victim.address)).to.equal(vCct);
      expect(await usdc.balanceOf(victim.address)).to.equal(vUsdc);

      // attacker's inflation capital is now stuck: his 1000 LP wei are worth 0 CCT wei, so removal reverts instead of
      // paying him the pool (the locked MINIMUM_LIQUIDITY keeps the other half of the pool forever)
      await expect(
        market.connect(attacker).removeLiquidity(await market.lpTokens(attacker.address), 0, 0)
      ).to.be.revertedWith("Insufficient liquidity burned");
    });
  });
}
