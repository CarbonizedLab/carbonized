/**
 * AUD-ORACLE-01..03 : EmissionVerifier - REGRESSION tests (each exploit now fails).
 * Run: npx hardhat test test/poc/oracle-01-emission-verifier.test.js
 *
 * Uses PocFunctionsRouter (contracts/tests/poc) which mirrors the real Chainlink FunctionsRouter
 * semantics that matter: unique request ids, commitment deleted before callback, callback executed
 * with exactly `callbackGasLimit`, failed callback swallowed (USER_CALLBACK_ERROR).
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const { E18, DAY, IOT_URL, CROSS_URL, encodeEmission, deployRouter, deployVerifier } = require("../helpers/oracle");

const BIG_GAS = 8_000_000n;
const enc = (n) => encodeEmission(n);

async function fixture() {
  const [admin, projectOwner, automation, stranger] = await ethers.getSigners();
  const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
  const router = await deployRouter("PocFunctionsRouter");
  const verifier = await deployVerifier(router, nft);
  await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), await verifier.getAddress());
  await verifier.grantRole(await verifier.AUTOMATION_ROLE(), automation.address);
  await verifier.registerProject(
    "P1", projectOwner.address, "VERRA_VCS", 10_000n * E18, 30, 30 * DAY,
    IOT_URL, CROSS_URL, ethers.keccak256(ethers.toUtf8Bytes("sig"))
  );
  return { admin, projectOwner, automation, stranger, nft, router, verifier };
}

const due = () => time.increase(30 * DAY + 1);
const lastRequest = async (verifier, id = "P1") => {
  const ids = await verifier.getProjectRequests(id);
  return ids[ids.length - 1];
};
async function fulfillOk(router, id, measured) {
  expect(await router.fulfill.staticCall(id, enc(measured), "0x"), "callback must succeed with the configured gas").to.equal(true);
  await router.fulfill(id, enc(measured), "0x");
}

describe("Regression oracle / EmissionVerifier", function () {
  it("[AUD-ORACLE-01] 18-dec baseline: an honest fulfilment mints exactly the reduction (no 1e18x inflation)", async function () {
    const { projectOwner, nft, router, verifier } = await loadFixture(fixture);
    await due();
    await verifier.requestVerification("P1");
    const id = await lastRequest(verifier);
    await fulfillOk(router, id, 7_000n * E18);

    // callback only records; nothing minted yet
    expect(await nft.totalSupply()).to.equal(0n);
    const req = await verifier.getVerificationRequest(id);
    expect(req.reductionAchieved).to.equal(3_000n * E18);

    await verifier.claimCredits(id); // anyone may trigger the mint
    expect(await nft.ownerOf(1)).to.equal(projectOwner.address);
    const credit = await nft.credits(1);
    expect(credit.co2Tonnes).to.equal(3_000n * E18);
    expect((await nft.getGlobalStats()).minted).to.equal(3_000n * E18);
    expect(await verifier.projectCreditsMinted("P1")).to.equal(3_000n * E18);
  });

  it("[AUD-ORACLE-01b] unit confusion cannot mint: measured >= baseline gives nothing, oversized / whole-tonne figures are bounded", async function () {
    const { admin, router, verifier } = await loadFixture(fixture);
    await due();
    await verifier.requestVerification("P1");
    const id = await lastRequest(verifier);
    // a measurement in whole tonnes would be < baseline*1e-18... a measurement scaled 1e18x too large gives reduction 0
    await fulfillOk(router, id, 10_000n * E18 * E18);
    expect((await verifier.getVerificationRequest(id)).reductionAchieved).to.equal(0n);
    await expect(verifier.claimCredits(id)).to.be.revertedWith("No reduction");

    const max = await verifier.MAX_BASELINE();
    await expect(
      verifier.registerProject("Big", admin.address, "VERRA_VCS", max + 1n, 30, 0, "", "", ethers.ZeroHash)
    ).to.be.revertedWith("Invalid baseline");
  });

  it("[AUD-ORACLE-02] callback gas: the configured limit is enough for the callback, bounded and admin-settable; mint happens in claimCredits", async function () {
    const { nft, router, verifier, projectOwner, stranger } = await loadFixture(fixture);
    expect(await verifier.gasLimit()).to.equal(300_000n);
    await due();
    await verifier.requestVerification("P1");
    const id = await lastRequest(verifier);

    const measured = await router.fulfillWithGas.staticCall(id, enc(7_000n * E18), "0x", BIG_GAS);
    console.log("      EmissionVerifier callback gas ~", measured.gasUsed.toString(), "(budget 300000)");
    expect(measured.success).to.equal(true);
    expect(measured.gasUsed).to.be.lessThan(250_000n); // generous margin below the 300k default / router caps

    // real path: router forwards exactly gasLimit; the request is fulfilled and no retry loop remains
    await fulfillOk(router, id, 7_000n * E18);
    expect((await verifier.getVerificationRequest(id)).fulfilled).to.equal(true);
    const [upkeep] = await verifier.checkUpkeep("0x");
    expect(upkeep).to.equal(false);

    // minting costs more than a callback may have, which is exactly why it is a separate tx
    const claim = await verifier.connect(stranger).claimCredits(id);
    const receipt = await claim.wait();
    console.log("      claimCredits gas ~", receipt.gasUsed.toString());
    expect(receipt.gasUsed).to.be.greaterThan(300_000n);
    expect(await nft.ownerOf(1)).to.equal(projectOwner.address); // always the project owner, not the caller

    // bounds + event on the admin setter
    await expect(verifier.setFunctionsConfig(ethers.ZeroHash, 1, 199_999)).to.be.revertedWith("Gas limit out of bounds");
    await expect(verifier.setFunctionsConfig(ethers.ZeroHash, 1, 1_000_001)).to.be.revertedWith("Gas limit out of bounds");
    await expect(verifier.setFunctionsConfig(ethers.id("don"), 7, 500_000))
      .to.emit(verifier, "FunctionsConfigUpdated")
      .withArgs(ethers.id("don"), 7, 500_000);
    await expect(verifier.connect(stranger).setFunctionsConfig(ethers.ZeroHash, 1, 300_000)).to.be.reverted;
  });

  it("[AUD-ORACLE-03] pending requests are tracked: repeated upkeeps / requests cannot mint the same reduction several times", async function () {
    const { automation, nft, router, verifier } = await loadFixture(fixture);
    await due();
    const [, performData] = await verifier.checkUpkeep("0x");
    await verifier.connect(automation).performUpkeep(performData);
    await verifier.connect(automation).performUpkeep(performData); // second upkeep in flight: skipped, not a 2nd request
    expect((await verifier.getProjectRequests("P1")).length).to.equal(1);
    const [needed] = await verifier.checkUpkeep("0x");
    expect(needed).to.equal(false); // pending request: automation stops asking
    await expect(verifier.requestVerification("P1")).to.be.revertedWith("Request pending");

    const id = await lastRequest(verifier);
    await fulfillOk(router, id, 7_000n * E18);
    await verifier.claimCredits(id);
    await expect(verifier.claimCredits(id)).to.be.revertedWith("Already claimed");
    expect(await nft.totalSupply()).to.equal(1n);
    expect(await verifier.projectCreditsMinted("P1")).to.equal(3_000n * E18);

    // fulfilled request can never be fulfilled again (router + contract)
    await expect(router.fulfill(id, enc(1n * E18), "0x")).to.be.revertedWith("unknown request");
  });

  it("[AUD-ORACLE-03b] repeated requestVerification in the same period is refused; the next period mints a different serial", async function () {
    const { router, nft, verifier } = await loadFixture(fixture);
    await due();
    await verifier.requestVerification("P1");
    const id1 = await lastRequest(verifier);
    await fulfillOk(router, id1, 7_000n * E18);

    await expect(verifier.requestVerification("P1")).to.be.revertedWith("Verification interval not elapsed");
    await time.increase(29 * DAY);
    await expect(verifier.requestVerification("P1")).to.be.revertedWith("Verification interval not elapsed");

    await time.increase(2 * DAY);
    await verifier.requestVerification("P1");
    const id2 = await lastRequest(verifier);
    await fulfillOk(router, id2, 8_000n * E18);
    await verifier.claimCredits(id1);
    await verifier.claimCredits(id2);
    expect(await nft.totalSupply()).to.equal(2n);
    expect((await nft.credits(1)).serialNumber).to.not.equal((await nft.credits(2)).serialNumber);
    expect(await verifier.periodVerified("P1", 1)).to.equal(true);
    expect(await verifier.periodVerified("P1", 2)).to.equal(true);
  });

  it("[AUD-ORACLE-03c] request-id binding: a superseded (timed-out) request cannot be fulfilled afterwards", async function () {
    const { router, nft, verifier } = await loadFixture(fixture);
    await due();
    await verifier.requestVerification("P1");
    const stale = await lastRequest(verifier);

    await time.increase(7 * 3600); // > PENDING_REQUEST_TIMEOUT, oracle never answered
    await verifier.requestVerification("P1");
    const fresh = await lastRequest(verifier);
    expect(fresh).to.not.equal(stale);
    expect(await verifier.pendingRequestId("P1")).to.equal(fresh);

    // late answer to the stale id: callback rejects it (router reports failure), nothing recorded
    expect(await router.fulfill.staticCall(stale, enc(1n * E18), "0x")).to.equal(false);
    await router.fulfill(stale, enc(1n * E18), "0x");
    expect((await verifier.getVerificationRequest(stale)).fulfilled).to.equal(false);
    await expect(verifier.claimCredits(stale)).to.be.revertedWith("Not verified");

    await fulfillOk(router, fresh, 7_000n * E18);
    await verifier.claimCredits(fresh);
    expect(await nft.totalSupply()).to.equal(1n);
  });

  it("[AUD-ORACLE-03d] oracle errors / malformed / zero answers settle the request without crediting; retry only after the delay", async function () {
    const { router, verifier } = await loadFixture(fixture);
    await due();
    await verifier.requestVerification("P1");
    const id = await lastRequest(verifier);
    await router.fulfill(id, "0x", ethers.toUtf8Bytes("DON error"));
    let req = await verifier.getVerificationRequest(id);
    expect(req.fulfilled && req.failed).to.equal(true);
    await expect(verifier.claimCredits(id)).to.be.revertedWith("Not verified");

    await expect(verifier.requestVerification("P1")).to.be.revertedWith("Retry too soon");
    await time.increase(3601);
    await verifier.requestVerification("P1");
    const id2 = await lastRequest(verifier);
    await router.fulfill(id2, enc(0n), "0x"); // dead sensor must not become a full-baseline credit
    req = await verifier.getVerificationRequest(id2);
    expect(req.failed).to.equal(true);
    expect(await verifier.periodVerified("P1", 1)).to.equal(false);
  });

  it("[AUD-ORACLE-03e] deactivated projects cannot claim; vintage year is the real calendar year", async function () {
    const { router, nft, verifier } = await loadFixture(fixture);
    await due();
    await verifier.requestVerification("P1");
    const id = await lastRequest(verifier);
    await fulfillOk(router, id, 7_000n * E18);
    const reqTime = (await verifier.getVerificationRequest(id)).requestTime;

    await verifier.deactivateProject("P1", "fraud");
    await expect(verifier.claimCredits(id)).to.be.revertedWith("Project not active");

    // re-register under the same id is impossible (period indexes must never repeat)
    const [, , , , , other] = await ethers.getSigners();
    await expect(
      verifier.registerProject("P1", other.address, "VERRA_VCS", 1n * E18, 30, 0, "", "", ethers.ZeroHash)
    ).to.be.revertedWith("Project already registered");

    // vintage on a project that stays active
    await verifier.registerProject("P2", (await ethers.getSigners())[5].address, "VERRA_VCS", 1_000n * E18, 30, 30 * DAY, IOT_URL, CROSS_URL, ethers.ZeroHash);
    await time.increase(30 * DAY + 1);
    await verifier.requestVerification("P2");
    const id2 = await lastRequest(verifier, "P2");
    await fulfillOk(router, id2, 400n * E18);
    await verifier.claimCredits(id2);
    const credit = await nft.credits(1);
    const year = new Date(Number((await verifier.getVerificationRequest(id2)).requestTime) * 1000).getUTCFullYear();
    expect(credit.vintageYear).to.equal(BigInt(year));
    expect(reqTime).to.be.gt(0n);
  });
});
