const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployMarket, giveCCT, approveAll, E18, PAYMENT_DECIMALS } = require("./helpers/marketFixture");

/**
 * [AUD-MARKET-02] REGRESSION: addLiquidity must not donate the over-supplied side and must be
 * sandwich-protected by min-amount / minLiquidity parameters.
 *
 * Original exploit: pool 98 % owned by the attacker; he front-runs a victim deposit with a big swap, the
 * victim's full amounts were pulled while LP was minted for the scarcer side only, then he unwound.
 * Fixes: only the proportional (optimal) amounts are pulled, `carbonMin`/`stableMin`/`minLiquidity` revert
 * the deposit when the price moved, and the sandwich is no longer profitable.
 */
for (const dec of PAYMENT_DECIMALS) {
  describe(`[AUD-MARKET-02] addLiquidity sandwich (${dec}-dec payment token)`, function () {
    // value of (cct wei, stable units) in stable units at the pre-attack price of 1 tonne = 1 stable unit
    const eq = (cct, stable) => stable + (cct * 10n ** BigInt(dec)) / E18;

    async function setup() {
      const ctx = await deployMarket({ paymentDecimals: dec });
      const { usdc, attacker, victim, alice, U } = ctx;
      await giveCCT(ctx, attacker, 5000);
      await giveCCT(ctx, victim, 100);
      await giveCCT(ctx, alice, 100);
      await usdc.mint(attacker.address, U(100000));
      await usdc.mint(victim.address, U(100));
      await usdc.mint(alice.address, U(100));
      for (const s of [attacker, victim, alice]) await approveAll(ctx, s);
      ctx.atkCct0 = await ctx.token.balanceOf(attacker.address);
      ctx.atkUsdc0 = await usdc.balanceOf(attacker.address);
      // existing pool: attacker ~98 %, alice 2 %
      await ctx.market.connect(attacker).addLiquidity(4900n * E18, U(4900), 0, 0, 0);
      await ctx.market.connect(alice).addLiquidity(100n * E18, U(100), 0, 0, 0);
      return ctx;
    }

    it("[AUD-MARKET-02] protected victim: deposit reverts when the price was moved", async function () {
      const { market, token, usdc, attacker, victim, U } = await setup();
      await market.connect(attacker).swap(false, U(10000), 0);

      const vCct = await token.balanceOf(victim.address);
      const vUsdc = await usdc.balanceOf(victim.address);
      // victim quoted 1:1 and wants at least 99 % of both legs
      await expect(
        market.connect(victim).addLiquidity(100n * E18, U(100), 99n * E18, U(99), 0)
      ).to.be.reverted;
      expect(await token.balanceOf(victim.address)).to.equal(vCct);
      expect(await usdc.balanceOf(victim.address)).to.equal(vUsdc);
    });

    it("[AUD-MARKET-02] unprotected victim only pays the proportional amounts (no donated excess leg)", async function () {
      const { market, token, usdc, attacker, victim, U, atkCct0, atkUsdc0 } = await setup();

      const swapIn = U(10000);
      const got = await market.connect(attacker).swap.staticCall(false, swapIn, 0);
      await market.connect(attacker).swap(false, swapIn, 0); // front-run

      const vCct0 = await token.balanceOf(victim.address);
      const vUsdc0 = await usdc.balanceOf(victim.address);
      const [carbonUsed, stableUsed] = await market.connect(victim).addLiquidity.staticCall(
        100n * E18, U(100), 0, 0, 0
      );
      await market.connect(victim).addLiquidity(100n * E18, U(100), 0, 0, 0);
      // victim wallet only lost the proportional amounts, the excess leg stayed in the wallet
      expect(vCct0 - (await token.balanceOf(victim.address))).to.equal(carbonUsed);
      expect(vUsdc0 - (await usdc.balanceOf(victim.address))).to.equal(stableUsed);
      expect(carbonUsed < 100n * E18 || stableUsed < U(100)).to.equal(true);
      const vLp = await market.lpTokens(victim.address);
      expect(vLp).to.be.gt(0n);

      await market.connect(attacker).swap(true, got, 0); // back-run
      await market.connect(attacker).removeLiquidity(await market.lpTokens(attacker.address), 0, 0);

      // victim exits: gets back (almost) what he put in; deposit was proportional so nothing was donated
      await market.connect(victim).removeLiquidity(vLp, 0, 0);
      const vCct1 = await token.balanceOf(victim.address);
      const vUsdc1 = await usdc.balanceOf(victim.address);
      const victimLoss = eq(vCct0 - vCct1, vUsdc0 - vUsdc1);
      const atkProfit = eq((await token.balanceOf(attacker.address)) - atkCct0, (await usdc.balanceOf(attacker.address)) - atkUsdc0);

      // The excess leg is no longer donated: the attacker can only capture the victim's loss from depositing at
      // the manipulated price (inherent AMM impermanent loss, which carbonMin/stableMin above prevent), and
      // that loss is far below the 131 / 200 donated by the old implementation.
      expect(atkProfit).to.be.lte(victimLoss);
      expect(victimLoss).to.be.lt(eq(100n * E18, U(100)) / 3n);
    });
  });
}
