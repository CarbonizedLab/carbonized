/**
 * AUD-ORACLE-10 : MockFunctionsRouter (TEST-ONLY double) - REGRESSION: unique request ids and real callback delivery.
 * (AUD-ORACLE-11, MockERC20 public mint/burn, concerns a test-only token; it stays under contracts/tests and must never be a
 *  production payment token - mainnet uses the real USDC.)
 * Run: npx hardhat test test/poc/oracle-04-mocks.test.js
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const { E18, DAY, IOT_URL, CROSS_URL, encodePrice, encodeEmission, deployRouter, deployPriceOracle, deployVerifier } = require("../helpers/oracle");

describe("Regression mocks (test-only)", function () {
  it("[AUD-ORACLE-10] MockFunctionsRouter: request ids are unique per request and answers reach the client", async function () {
    const [admin, owner, automation] = await ethers.getSigners();
    const router = await deployRouter("MockFunctionsRouter");
    const oracle = await deployPriceOracle(router);
    await oracle.updateAllPrices(); // 3 requests in one tx
    const evs = await oracle.queryFilter(oracle.filters.RequestSent());
    expect(evs.length).to.equal(3);
    expect(new Set(evs.map((e) => e.args.id)).size).to.equal(3);

    // the mock now delivers the answer through handleOracleFulfillment
    await router.fulfillRequest(evs[1].args.id, encodePrice(8n * 10n ** 8n, 1000n, 100n, 3n), "0x");
    expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(8n * 10n ** 8n);
    await expect(oracle.getLatestPrice("ICM_COMPLIANCE")).to.be.revertedWith("Price not available");

    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    const verifier = await deployVerifier(router, nft);
    for (const id of ["P_A", "P_B"]) {
      await verifier.registerProject(id, owner.address, "VERRA_VCS", 1000n * E18, 30, DAY, IOT_URL, CROSS_URL, ethers.ZeroHash);
    }
    await time.increase(DAY + 1);
    const data = ethers.AbiCoder.defaultAbiCoder().encode(["string[]"], [["P_A", "P_B"]]);
    await verifier.grantAutomationRole(automation.address);
    await verifier.connect(automation).performUpkeep(data);
    const reqs = await verifier.queryFilter(verifier.filters.VerificationRequested());
    expect(reqs.length).to.equal(2);
    expect(reqs[0].args.requestId).to.not.equal(reqs[1].args.requestId);
    expect((await verifier.getVerificationRequest(reqs[0].args.requestId)).projectId).to.equal("P_A");
    expect((await verifier.getVerificationRequest(reqs[1].args.requestId)).projectId).to.equal("P_B");
    expect((await verifier.getProjectRequests("P_A")).length).to.equal(1);

    // answer reaches the verifier and is recorded (credits are claimed separately)
    await router.fulfillRequest(reqs[0].args.requestId, encodeEmission(600n * E18), "0x");
    expect((await verifier.getVerificationRequest(reqs[0].args.requestId)).reductionAchieved).to.equal(400n * E18);
  }).timeout(60000);
});
