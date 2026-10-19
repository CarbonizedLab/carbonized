/**
 * Negative checks (attack classes that FAIL, kept so the audit claims stay reproducible).
 * (AUD-ORACLE-12 - admin interval override - is covered as a regression in oracle-02-price-oracle.test.js.)
 * Run: npx hardhat test test/poc/oracle-05-checks-and-config.test.js
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const { E18, DAY, IOT_URL, CROSS_URL, encodeEmission, deployRouter, deployPriceOracle, deployVerifier, deploySync } = require("../helpers/oracle");

async function deployAll() {
  const [admin, attacker] = await ethers.getSigners();
  const router = await deployRouter("PocFunctionsRouter");
  const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
  const oracle = await deployPriceOracle(router);
  const verifier = await deployVerifier(router, nft);
  const sync = await deploySync(router, nft);
  await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), await verifier.getAddress());
  return { admin, attacker, router, nft, oracle, verifier, sync };
}

describe("PoC oracle: negative checks", function () {
  it("[CHECK-safe] only the router can call handleOracleFulfillment; forged fulfilment from an EOA/contract reverts on all three clients", async function () {
    const { attacker, oracle, verifier, sync } = await deployAll();
    const fake = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1n]);
    for (const c of [oracle, verifier, sync]) {
      await expect(c.connect(attacker).handleOracleFulfillment(ethers.ZeroHash, fake, "0x")).to.be.revertedWithCustomError(c, "OnlyRouterCanFulfill");
    }
  });

  it("[CHECK-safe] request / upkeep entry points are role gated; a replayed or unknown request id cannot be fulfilled through the router", async function () {
    const { attacker, router, verifier, sync, oracle } = await deployAll();
    await expect(verifier.connect(attacker).requestVerification("X")).to.be.reverted;
    await expect(verifier.connect(attacker).performUpkeep("0x")).to.be.reverted;
    await expect(verifier.connect(attacker).registerProject("X", attacker.address, "VERRA_VCS", 1, 1, DAY, IOT_URL, CROSS_URL, ethers.ZeroHash)).to.be.reverted;
    await expect(sync.connect(attacker).checkRegistry("VERRA", "S")).to.be.reverted;
    await expect(oracle.connect(attacker).updatePrice("ICM_COMPLIANCE")).to.be.reverted;
    await expect(oracle.connect(attacker).performUpkeep("0x")).to.be.reverted;
    await expect(router.fulfill(ethers.id("nope"), "0x", "0x")).to.be.revertedWith("unknown request");

    // replay: a successful fulfilment cannot be repeated (router deletes the commitment; contract also guards)
    await verifier.registerProject("P", attacker.address, "VERRA_VCS", 10n * E18, 30, DAY, IOT_URL, CROSS_URL, ethers.ZeroHash);
    await time.increase(DAY + 1);
    await verifier.requestVerification("P");
    const [id] = await verifier.getProjectRequests("P");
    const resp = encodeEmission(5n * E18);
    await router.fulfill(id, resp, "0x");
    await expect(router.fulfill(id, resp, "0x")).to.be.revertedWith("unknown request");
  });

  it("[CHECK-safe] malformed (empty) oracle response only fails/settles that request; contract state is not bricked", async function () {
    const { router, oracle, verifier, attacker } = await deployAll();
    await oracle.updatePrice("ICM_COMPLIANCE");
    const [e] = await oracle.queryFilter(oracle.filters.RequestSent());
    await expect(router.fulfill(e.args.id, "0x", "0x")).to.emit(oracle, "PriceRequestFailed"); // handled, not reverted
    await oracle.updatePrice("ICM_COMPLIANCE"); // still usable

    await verifier.registerProject("P", attacker.address, "VERRA_VCS", 10n * E18, 30, DAY, IOT_URL, CROSS_URL, ethers.ZeroHash);
    await time.increase(DAY + 1);
    await verifier.requestVerification("P");
    const [id] = await verifier.getProjectRequests("P");
    await router.fulfill(id, "0x", "0x");
    expect((await verifier.getVerificationRequest(id)).failed).to.equal(true);
    expect(await verifier.pendingRequestId("P")).to.equal(ethers.ZeroHash);
  });
});
