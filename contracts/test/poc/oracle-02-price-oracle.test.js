/**
 * AUD-ORACLE-04..06 + AUD-ORACLE-12 : CarbonPriceOracle - REGRESSION tests (each exploit now fails).
 * Run: npx hardhat test test/poc/oracle-02-price-oracle.test.js
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const { USD, encodePrice, deployRouter, deployPriceOracle } = require("../helpers/oracle");

const BIG_GAS = 8_000_000n;
// confidence = share of the 3 configured sources that answered; dataPoints = how many
const pack = (price, volume, conf) =>
  encodePrice(BigInt(price), BigInt(volume), BigInt(conf), BigInt(Math.max(1, Math.round((Number(conf) * 3) / 100))));

async function fixture() {
  const [admin, other] = await ethers.getSigners();
  const router = await deployRouter("PocFunctionsRouter");
  const oracle = await deployPriceOracle(router);
  return { admin, other, router, oracle };
}
const requestIds = async (oracle) =>
  (await oracle.queryFilter(oracle.filters.RequestSent())).map((e) => e.args.id);

describe("Regression oracle / CarbonPriceOracle", function () {
  it("[AUD-ORACLE-04] fulfilment is bound to the request's methodology: each answer lands under its own name", async function () {
    const { oracle, router } = await loadFixture(fixture);
    await oracle.updateAllPrices();
    const ids = await requestIds(oracle);
    expect(ids.length).to.equal(3);
    expect(await oracle.requestMethodology(ids[0])).to.equal("ICM_COMPLIANCE");
    expect(await oracle.requestMethodology(ids[1])).to.equal("VERRA_VCS");
    expect(await oracle.requestMethodology(ids[2])).to.equal("GOLD_STANDARD");

    const answers = [8n, 15n, 25n].map((p) => p * USD);
    // answers may arrive in any order
    for (const i of [2, 0, 1]) {
      expect(await router.fulfill.staticCall(ids[i], pack(answers[i], 1000, 100), "0x")).to.equal(true);
      await router.fulfill(ids[i], pack(answers[i], 1000, 100), "0x");
    }
    expect(await oracle.getLatestPrice("ICM_COMPLIANCE")).to.equal(8n * USD);
    expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(15n * USD);
    expect(await oracle.getLatestPrice("GOLD_STANDARD")).to.equal(25n * USD);
    // binding is consumed: a request id works once
    expect(await oracle.requestMethodology(ids[0])).to.equal("");
  });

  it("[AUD-ORACLE-04b] only configured methodologies can be requested", async function () {
    const { oracle } = await loadFixture(fixture);
    await expect(oracle.updatePrice("MADE_UP")).to.be.revertedWith("Unsupported methodology");
  });

  it("[AUD-ORACLE-05] callback gas: default budget covers the first fulfilment (no unbounded history push), limit is bounded + settable", async function () {
    const { oracle, router, other } = await loadFixture(fixture);
    expect(await oracle.gasLimit()).to.equal(300_000n);
    await oracle.updatePrice("ICM_COMPLIANCE");
    const [id] = await requestIds(oracle);
    const r = await router.fulfillWithGas.staticCall(id, pack(8n * USD, 1000, 100), "0x", BIG_GAS);
    console.log("      first-fulfilment callback gas ~", r.gasUsed.toString(), "(budget 300000)");
    expect(r.success).to.equal(true);
    expect(r.gasUsed).to.be.lessThan(200_000n);

    // exact budget as the real router forwards it
    expect(await router.fulfill.staticCall(id, pack(8n * USD, 1000, 100), "0x")).to.equal(true);
    await router.fulfill(id, pack(8n * USD, 1000, 100), "0x");
    expect(await oracle.getLatestPrice("ICM_COMPLIANCE")).to.equal(8n * USD);

    await expect(oracle.setFunctionsConfig(ethers.ZeroHash, 1, 199_999)).to.be.revertedWith("Gas limit out of bounds");
    await expect(oracle.setFunctionsConfig(ethers.ZeroHash, 1, 1_000_001)).to.be.revertedWith("Gas limit out of bounds");
    await expect(oracle.setFunctionsConfig(ethers.id("don"), 9, 400_000))
      .to.emit(oracle, "FunctionsConfigUpdated")
      .withArgs(ethers.id("don"), 9, 400_000);
    await expect(oracle.connect(other).setFunctionsConfig(ethers.ZeroHash, 1, 300_000)).to.be.reverted;
  });

  it("[AUD-ORACLE-06] sanity bounds: price 0 / absurd price / low confidence are rejected and never served by getLatestPrice", async function () {
    const { oracle, router } = await loadFixture(fixture);
    for (let i = 0; i < 4; i++) await oracle.updatePrice("ICM_COMPLIANCE");
    const ids = await requestIds(oracle);

    await expect(router.fulfill(ids[0], pack(0, 0, 100), "0x")).to.emit(oracle, "PriceRequestFailed");
    await expect(oracle.getLatestPrice("ICM_COMPLIANCE")).to.be.revertedWith("Price not available");

    await router.fulfill(ids[1], pack(10n ** 30n >> 8n, 0, 100), "0x"); // absurd price (fits the 128-bit slot)
    await expect(oracle.getLatestPrice("ICM_COMPLIANCE")).to.be.revertedWith("Price not available");

    await router.fulfill(ids[2], pack(8n * USD, 0, 20), "0x"); // only one source answered
    await expect(oracle.getLatestPrice("ICM_COMPLIANCE")).to.be.revertedWith("Price not available");

    await router.fulfill(ids[3], pack(8n * USD, 0, 67), "0x"); // 2 of 3 sources, sane price
    expect(await oracle.getLatestPrice("ICM_COMPLIANCE")).to.equal(8n * USD);
    expect((await oracle.getPriceData("ICM_COMPLIANCE")).dataPoints).to.equal(2n);
  });

  it("[AUD-ORACLE-06b] bounds / confidence / staleness are admin-settable only within sane limits and emit events", async function () {
    const { oracle, router, other } = await loadFixture(fixture);
    await expect(oracle.setPriceBounds(0, 100)).to.be.revertedWith("Invalid bounds");
    await expect(oracle.setPriceBounds(100, 100)).to.be.revertedWith("Invalid bounds");
    await expect(oracle.setPriceBounds(1, (await oracle.PRICE_CEILING()) + 1n)).to.be.revertedWith("Invalid bounds");
    await expect(oracle.setPriceBounds(5n * USD, 20n * USD)).to.emit(oracle, "PriceBoundsChanged").withArgs(5n * USD, 20n * USD);
    await expect(oracle.setMinConfidence(0)).to.be.revertedWith("Invalid confidence");
    await expect(oracle.setMinConfidence(101)).to.be.revertedWith("Invalid confidence");
    await expect(oracle.setMinConfidence(100)).to.emit(oracle, "MinConfidenceChanged").withArgs(100);
    await expect(oracle.setMaxStaleness(60)).to.be.revertedWith("Invalid staleness");
    await expect(oracle.setMaxStaleness(8 * 24 * 3600)).to.be.revertedWith("Invalid staleness");
    await expect(oracle.setUpdateInterval(60)).to.be.revertedWith("Invalid interval");
    await expect(oracle.setVolatilityThreshold(51)).to.be.revertedWith("Invalid threshold");
    for (const fn of [
      () => oracle.connect(other).setPriceBounds(1, 2),
      () => oracle.connect(other).setMinConfidence(10),
      () => oracle.connect(other).setMaxStaleness(3600),
    ]) {
      await expect(fn()).to.be.reverted;
    }

    // new bounds apply: 25 USD is above 20 USD max, 100% confidence required
    await oracle.updatePrice("ICM_COMPLIANCE");
    await oracle.updatePrice("ICM_COMPLIANCE");
    const [a, b] = await requestIds(oracle);
    await router.fulfill(a, pack(25n * USD, 0, 100), "0x");
    await expect(oracle.getLatestPrice("ICM_COMPLIANCE")).to.be.revertedWith("Price not available");
    await router.fulfill(b, pack(10n * USD, 0, 100), "0x");
    expect(await oracle.getLatestPrice("ICM_COMPLIANCE")).to.equal(10n * USD);
  });

  it("[AUD-ORACLE-06c] staleness: getLatestPrice reverts after maxStaleness (admin-tunable)", async function () {
    const { oracle, router } = await loadFixture(fixture);
    await oracle.updatePrice("VERRA_VCS");
    const [id] = await requestIds(oracle);
    await router.fulfill(id, pack(15n * USD, 0, 100), "0x");
    await time.increase(23 * 3600);
    expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(15n * USD);
    await oracle.setMaxStaleness(3600);
    await expect(oracle.getLatestPrice("VERRA_VCS")).to.be.revertedWith("Price too stale");
  });

  it("[AUD-ORACLE-12] the admin's updateInterval is never overwritten by fulfilments; volatility only shortens the effective interval", async function () {
    const { router, oracle } = await loadFixture(fixture);
    await oracle.setUpdateInterval(24 * 3600);
    for (let i = 0; i < 3; i++) await oracle.updatePrice("ICM_COMPLIANCE");
    const ids = await requestIds(oracle);
    await router.fulfill(ids[0], pack(100n * USD, 1, 100), "0x");
    await router.fulfill(ids[1], pack(200n * USD, 1, 100), "0x"); // +100% => "high volatility"
    expect(await oracle.updateInterval()).to.equal(24n * 3600n); // admin's 24h kept
    expect(await oracle.currentUpdateInterval()).to.equal(15n * 60n); // but checks run faster while volatile
    expect(await oracle.volatileCount()).to.equal(1n);

    await oracle.setUpdateInterval(5 * 60);
    await router.fulfill(ids[2], pack(201n * USD, 1, 100), "0x"); // calm again
    expect(await oracle.updateInterval()).to.equal(300n); // admin's 5 min kept
    expect(await oracle.volatileCount()).to.equal(0n);
    expect(await oracle.currentUpdateInterval()).to.equal(300n);
  });

  it("[AUD-ORACLE-12b] automation uses the effective interval", async function () {
    const { router, oracle, admin } = await loadFixture(fixture);
    await oracle.grantAutomationRole(admin.address);
    await oracle.setUpdateInterval(24 * 3600);
    await oracle.updateAllPrices();
    const ids = await requestIds(oracle);
    await router.fulfill(ids[0], pack(100n * USD, 1, 100), "0x");
    await oracle.updatePrice("ICM_COMPLIANCE");
    const next = (await requestIds(oracle))[3];
    await router.fulfill(next, pack(200n * USD, 1, 100), "0x");

    expect((await oracle.checkUpkeep("0x"))[0]).to.equal(false);
    await time.increase(16 * 60);
    expect((await oracle.checkUpkeep("0x"))[0]).to.equal(true);
    await oracle.performUpkeep("0x");
    await expect(oracle.performUpkeep("0x")).to.be.revertedWith("Update not due");
  });
});
