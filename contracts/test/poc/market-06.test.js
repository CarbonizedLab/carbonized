const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployMarket, giveCCT, approveAll, E18, PAYMENT_DECIMALS } = require("./helpers/marketFixture");

/**
 * [AUD-MARKET-06] REGRESSION: prices are denominated in payment-token base units per tonne and the
 * defaults / bounds follow `paymentToken.decimals()`. With 6-decimal USDC the default minimum is
 * 0.01 USD = 10_000, a realistic 10 USD price (10_000_000) works end to end, and a price entered with
 * the old 1e18 scale is rejected by the sanity cap instead of silently creating an unfillable order.
 */
for (const dec of PAYMENT_DECIMALS) {
  describe(`[AUD-MARKET-06] payment-token decimals (${dec})`, function () {
    async function setup() {
      const ctx = await deployMarket({ paymentDecimals: dec });
      const { usdc, attacker: seller, victim: buyer, U } = ctx;
      await giveCCT(ctx, seller, 100);
      await usdc.mint(buyer.address, U(1_000_000));
      await approveAll(ctx, seller);
      await approveAll(ctx, buyer);
      return ctx;
    }

    it("[AUD-MARKET-06] min price default / caps are scaled by decimals()", async function () {
      const { market, U } = await setup();
      expect(await market.paymentDecimals()).to.equal(dec);
      expect(await market.minPricePerTonne()).to.equal(10n ** BigInt(dec - 2));
      expect(await market.DEFAULT_MIN_PRICE_PER_TONNE()).to.equal(U("0.01"));
      expect(await market.MAX_MIN_PRICE_PER_TONNE()).to.equal(U(1_000_000));
      expect(await market.MAX_PRICE_PER_TONNE()).to.equal(U(1_000_000_000));
    });

    it("[AUD-MARKET-06] a realistic 10 USD/tonne order and auction work and cost exactly 10 USD per tonne", async function () {
      const { market, usdc, token, attacker: seller, victim: buyer, U } = await setup();
      await market.connect(seller).createSellOrder(10n * E18, U(10), 0, false);
      const before = await usdc.balanceOf(buyer.address);
      await market.connect(buyer).fillOrder(1, 4n * E18);
      expect(before - (await usdc.balanceOf(buyer.address))).to.equal(U(40));
      expect(await token.balanceOf(buyer.address)).to.equal(4n * E18);

      await market.connect(buyer).createBuyOrder(5n * E18, U(10), 0, false);
      expect(before - U(40) - (await usdc.balanceOf(buyer.address))).to.equal(U(50));

      const end = (await ethers.provider.getBlock("latest")).timestamp + 2 * 3600;
      await market.connect(seller).createAuction(10n * E18, U(100), end);
      // 0.0099 USD / tonne is below the minimum
      await expect(market.connect(seller).createAuction(10n * E18, U("0.099"), end)).to.be.revertedWith(
        "Price below minimum"
      );
    });

    it("[AUD-MARKET-06] prices below the 0.01 minimum are rejected, a 1e18-scaled price is capped (6-dec)", async function () {
      const { market, attacker: seller, victim: buyer, U } = await setup();
      const min = await market.minPricePerTonne();
      await expect(market.connect(seller).createSellOrder(10n * E18, min - 1n, 0, false)).to.be.revertedWith(
        "Price below minimum"
      );
      await expect(market.connect(buyer).createBuyOrder(10n * E18, min - 1n, 0, false)).to.be.revertedWith(
        "Price below minimum"
      );
      await market.connect(seller).createSellOrder(10n * E18, min, 0, false);

      // the frontend's old `price * 1e18` convention (10 USD -> 10e18) must not be accepted for 6-dec USDC
      const tooBig = 10n * E18;
      if (dec === 6) {
        await expect(market.connect(seller).createSellOrder(10n * E18, tooBig, 0, false)).to.be.revertedWith(
          "Price above maximum"
        );
        await expect(market.connect(buyer).createBuyOrder(10n * E18, tooBig, 0, false)).to.be.revertedWith(
          "Price above maximum"
        );
      } else {
        await market.connect(seller).createSellOrder(10n * E18, tooBig, 0, false); // $10 in 18-dec units
      }
    });

    it("[AUD-MARKET-06] AMM price is reported in payment-token units per tonne", async function () {
      const { market, usdc, attacker: seller, U } = await setup();
      await usdc.mint(seller.address, U(150));
      await market.connect(seller).addLiquidity(10n * E18, U(150), 0, 0, 0);
      expect(await market.getPrice()).to.equal(U(15));
    });
  });
}

describe("[AUD-MARKET-06] unsupported payment decimals are refused at deployment", function () {
  it("[AUD-MARKET-06] rejects tokens with > 18 or < 2 decimals", async function () {
    for (const d of [0, 1, 19]) {
      const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
      const cct = await (await ethers.getContractFactory("CarbonCreditToken")).deploy("n", "S", await nft.getAddress(), "VERRA_VCS");
      const pay = await (await ethers.getContractFactory("MockERC20")).deploy("P", "P", d);
      await expect(
        (await ethers.getContractFactory("CarbonMarketplace")).deploy(
          await pay.getAddress(),
          await cct.getAddress(),
          await nft.getAddress()
        )
      ).to.be.revertedWith("Unsupported payment decimals");
    }
  });
});
