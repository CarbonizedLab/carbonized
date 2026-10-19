/**
 * CarbonPriceOracle manual-reporter fallback (ORACLE_REPORTER_ROLE): works without Chainlink Functions, bounded by
 * price bounds, report freshness, spacing and a max deviation versus the last fresh price.
 * Run: npx hardhat test test/unit/PriceOracleFallback.test.js
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { USD, encodePrice, deployRouter, deployPriceOracle } = require("../helpers/oracle");

const MISSING_ROLE = /is missing role/;
const SPACING = 5 * 60;

async function fixture() {
  const [admin, reporter, stranger] = await ethers.getSigners();
  const router = await deployRouter();
  // deliberately NOT configured for Functions: the fallback must not depend on it
  const oracle = await deployPriceOracle(router, { configured: false });
  await oracle.grantRole(await oracle.ORACLE_REPORTER_ROLE(), reporter.address);
  return { admin, reporter, stranger, router, oracle };
}
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
/** Report `price` observed `age` seconds before the next block. */
async function report(oracle, signer, methodology, price, { volume = 0n, age = 10 } = {}) {
  return oracle.connect(signer).reportPrice(methodology, price, volume, (await now()) + 1 - age);
}

describe("CarbonPriceOracle: manual reporter fallback", function () {
  it("ORACLE_REPORTER_ROLE is never granted at construction; only the admin can grant it", async function () {
    const { admin, reporter, stranger, oracle } = await loadFixture(fixture);
    const role = await oracle.ORACLE_REPORTER_ROLE();
    expect(role).to.equal(ethers.id("ORACLE_REPORTER_ROLE"));
    const fresh = await deployPriceOracle(await deployRouter(), { configured: false });
    expect(await fresh.hasRole(role, admin.address)).to.equal(false);
    await expect(fresh.reportPrice("VERRA_VCS", 10n * USD, 0, await now())).to.be.revertedWith(MISSING_ROLE);
    await expect(oracle.connect(stranger).grantRole(role, stranger.address)).to.be.revertedWith(MISSING_ROLE);
    await expect(report(oracle, stranger, "VERRA_VCS", 10n * USD)).to.be.revertedWith(MISSING_ROLE);
    expect(await oracle.hasRole(role, reporter.address)).to.equal(true);
  });

  it("posts a price without any Functions configuration; reads stay the same; PriceReported + PriceUpdated are emitted", async function () {
    const { reporter, oracle } = await loadFixture(fixture);
    expect(await oracle.source()).to.equal(""); // no Functions source, no subscription
    const observed = (await now()) + 1 - 30;
    const tx = await oracle.connect(reporter).reportPrice("VERRA_VCS", 15n * USD, 4_000n * USD, observed);
    await expect(tx).to.emit(oracle, "PriceReported").withArgs("VERRA_VCS", reporter.address, 15n * USD, 4_000n * USD, observed);
    await expect(tx).to.emit(oracle, "PriceUpdated");

    // consumer-facing reads are unchanged
    expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(15n * USD);
    const [price, timestamp] = await oracle.getPrice("VERRA_VCS");
    expect([price, timestamp]).to.deep.equal([15n * USD, BigInt(await now())]);
    const d = await oracle.getPriceData("VERRA_VCS");
    expect([d.price, d.volume24h, d.confidence, d.dataPoints]).to.deep.equal([15n * USD, 4_000n * USD, 100n, 1n]);
    expect(await oracle.lastPriceManual("VERRA_VCS")).to.equal(true);
    // other methodologies are untouched
    await expect(oracle.getLatestPrice("ICM_COMPLIANCE")).to.be.revertedWith("Price not available");
  });

  it("rejects unsupported methodology, out-of-bounds price / volume and stale or future observations", async function () {
    const { reporter, oracle } = await loadFixture(fixture);
    await expect(report(oracle, reporter, "MADE_UP", 10n * USD)).to.be.revertedWith("Unsupported methodology");
    await expect(report(oracle, reporter, "VERRA_VCS", 0n)).to.be.revertedWith("Price out of bounds");
    await expect(report(oracle, reporter, "VERRA_VCS", (await oracle.minPrice()) - 1n)).to.be.revertedWith("Price out of bounds");
    await expect(report(oracle, reporter, "VERRA_VCS", (await oracle.maxPrice()) + 1n)).to.be.revertedWith("Price out of bounds");
    await expect(report(oracle, reporter, "VERRA_VCS", 10n * USD, { volume: 2n ** 128n })).to.be.revertedWith("Volume out of bounds");

    const maxAge = Number(await oracle.MAX_REPORT_AGE());
    await expect(report(oracle, reporter, "VERRA_VCS", 10n * USD, { age: maxAge + 5 })).to.be.revertedWith("Stale report");
    await expect(report(oracle, reporter, "VERRA_VCS", 10n * USD, { age: -60 })).to.be.revertedWith("Stale report"); // future
    await report(oracle, reporter, "VERRA_VCS", 10n * USD, { age: maxAge - 5 }); // boundary: accepted
    expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(10n * USD);

    // admin-tuned bounds apply to reports too
    await time.increase(SPACING);
    await oracle.setPriceBounds(5n * USD, 12n * USD);
    await expect(report(oracle, reporter, "VERRA_VCS", 13n * USD)).to.be.revertedWith("Price out of bounds");
  });

  it("enforces spacing between prices of one methodology (stops stepping the price inside one block)", async function () {
    const { reporter, oracle } = await loadFixture(fixture);
    await report(oracle, reporter, "VERRA_VCS", 10n * USD);
    await expect(report(oracle, reporter, "VERRA_VCS", 10n * USD + 1n)).to.be.revertedWith("Report too soon");
    await time.increase(SPACING - 30);
    await expect(report(oracle, reporter, "VERRA_VCS", 10n * USD + 1n)).to.be.revertedWith("Report too soon");
    await time.increase(30);
    await report(oracle, reporter, "VERRA_VCS", 10n * USD + 1n);
    // spacing is per methodology
    await report(oracle, reporter, "GOLD_STANDARD", 25n * USD);
  });

  it("enforces max deviation versus the last fresh price, up and down, per methodology", async function () {
    const { admin, reporter, stranger, oracle } = await loadFixture(fixture);
    expect(await oracle.maxReportDeviationBps()).to.equal(1000n);
    await report(oracle, reporter, "VERRA_VCS", 10n * USD);
    await report(oracle, reporter, "ICM_COMPLIANCE", 100n * USD); // first price: no anchor, bounds only

    await time.increase(SPACING);
    await expect(report(oracle, reporter, "VERRA_VCS", 11n * USD + USD / 1000n)).to.be.revertedWith("Deviation too large"); // +10.01% (measured in whole bps)
    await expect(report(oracle, reporter, "VERRA_VCS", 9n * USD - USD / 1000n)).to.be.revertedWith("Deviation too large"); // -10.01%
    await report(oracle, reporter, "VERRA_VCS", 11n * USD); // exactly +10%: allowed
    expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(11n * USD);
    expect(await oracle.getLatestPrice("ICM_COMPLIANCE")).to.equal(100n * USD); // independent

    await time.increase(SPACING);
    await report(oracle, reporter, "VERRA_VCS", (11n * USD * 90n) / 100n); // exactly -10%

    // admin-tunable within 0.1%..50%, role gated, emitted
    await expect(oracle.connect(stranger).setMaxReportDeviation(500)).to.be.revertedWith(MISSING_ROLE);
    await expect(oracle.setMaxReportDeviation(9)).to.be.revertedWith("Invalid deviation");
    await expect(oracle.setMaxReportDeviation(5001)).to.be.revertedWith("Invalid deviation");
    await expect(oracle.setMaxReportDeviation(500)).to.emit(oracle, "MaxReportDeviationChanged").withArgs(500);
    await time.increase(SPACING);
    const last = await oracle.getLatestPrice("VERRA_VCS");
    await expect(report(oracle, reporter, "VERRA_VCS", (last * 1051n) / 1000n)).to.be.revertedWith("Deviation too large");
    await report(oracle, reporter, "VERRA_VCS", (last * 105n) / 100n);
    expect(admin.address).to.not.equal(reporter.address);
  });

  it("a stale previous price has no deviation anchor: recovery after an outage works, still inside the bounds", async function () {
    const { reporter, oracle } = await loadFixture(fixture);
    await report(oracle, reporter, "VERRA_VCS", 10n * USD);
    await time.increase(Number(await oracle.maxStaleness()) - 60);
    await expect(report(oracle, reporter, "VERRA_VCS", 30n * USD)).to.be.revertedWith("Deviation too large"); // still fresh
    await time.increase(120); // now stale: getLatestPrice would revert
    await expect(oracle.getLatestPrice("VERRA_VCS")).to.be.revertedWith("Price too stale");
    await report(oracle, reporter, "VERRA_VCS", 30n * USD);
    expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(30n * USD);
    await time.increase(Number(await oracle.maxStaleness()) + 1);
    await expect(report(oracle, reporter, "VERRA_VCS", (await oracle.maxPrice()) + 1n)).to.be.revertedWith("Price out of bounds");
  });

  it("a reported price feeds the volatility logic; a Functions answer takes over and clears the manual flag", async function () {
    const { reporter, router, oracle } = await loadFixture(fixture);
    await report(oracle, reporter, "VERRA_VCS", 10n * USD);
    await time.increase(SPACING);
    await expect(report(oracle, reporter, "VERRA_VCS", 11n * USD)).to.emit(oracle, "HighVolatilityDetected");
    expect(await oracle.isVolatile("VERRA_VCS")).to.equal(true);
    expect(await oracle.volatileCount()).to.equal(1n);

    // Functions comes back: configure, request, answer
    await oracle.setFunctionsConfig(ethers.encodeBytes32String("fun-test-1"), 1, 300_000);
    await oracle.setSource("return Functions.encodeUint256(1n);");
    await oracle.setPriceSources(["https://price-a.test/{methodology}"]);
    await oracle.updatePrice("VERRA_VCS");
    await router.fulfillRequest(await router.lastRequestId(), encodePrice(11n * USD + 1_000n, 0n, 100n, 1n), "0x");
    expect(await oracle.lastPriceManual("VERRA_VCS")).to.equal(false);
    expect(await oracle.isVolatile("VERRA_VCS")).to.equal(false); // ~0% change: calm again
    expect(await oracle.volatileCount()).to.equal(0n);

    // and the reporter's deviation anchor is now the Functions price
    await time.increase(SPACING);
    await expect(report(oracle, reporter, "VERRA_VCS", 15n * USD)).to.be.revertedWith("Deviation too large");
    await report(oracle, reporter, "VERRA_VCS", 12n * USD);
    expect(await oracle.lastPriceManual("VERRA_VCS")).to.equal(true);
  });

  it("revoking the role stops the reporter; getPrice / getLatestPrice / getPriceData keep their ABI", async function () {
    const { reporter, oracle } = await loadFixture(fixture);
    await oracle.revokeRole(await oracle.ORACLE_REPORTER_ROLE(), reporter.address);
    await expect(report(oracle, reporter, "VERRA_VCS", 10n * USD)).to.be.revertedWith(MISSING_ROLE);
    const iface = oracle.interface;
    expect(iface.getFunction("getPrice").outputs.map((o) => o.type)).to.deep.equal(["uint256", "uint256"]);
    expect(iface.getFunction("getLatestPrice").outputs.map((o) => o.type)).to.deep.equal(["uint256"]);
    expect(iface.getFunction("getPriceData").outputs[0].components.map((c) => c.name)).to.deep.equal([
      "price", "timestamp", "volume24h", "confidence", "dataPoints",
    ]);
  });
});
