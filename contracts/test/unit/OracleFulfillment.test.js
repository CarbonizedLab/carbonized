/**
 * Oracle layer: strict decoding of the DON answers (valid / invalid / oversized / error), replay and wrong request ids,
 * for CarbonPriceOracle, EmissionVerifier and RegistrySync, through MockFunctionsRouter.
 * Run: npx hardhat test test/unit/OracleFulfillment.test.js
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time, setBalance, impersonateAccount, stopImpersonatingAccount } = require("@nomicfoundation/hardhat-network-helpers");
const {
  E18, USD, DAY, IOT_URL, CROSS_URL, encodePrice, encodeEmission, encodeRegistry, NOT_FOUND, ACTIVE, RETIRED,
  deployRouter, deployPriceOracle, deployVerifier, deploySync,
} = require("../helpers/oracle");

const coder = ethers.AbiCoder.defaultAbiCoder();
const u256 = (n) => coder.encode(["uint256"], [n]);
const OVERSIZED = `0x${"ab".repeat(4096)}`;

/** Call handleOracleFulfillment as the router (a forged/replayed delivery that bypasses the router's own bookkeeping). */
async function asRouter(router, client, requestId, response, err = "0x") {
  const addr = await router.getAddress();
  await impersonateAccount(addr);
  await setBalance(addr, 10n ** 18n);
  try {
    const signer = await ethers.getSigner(addr);
    return await client.connect(signer).handleOracleFulfillment(requestId, response, err);
  } finally {
    await stopImpersonatingAccount(addr);
  }
}

describe("Oracle layer: fulfilment decoding", function () {
  // ======================================================== CarbonPriceOracle
  describe("CarbonPriceOracle (128 bytes: price, volume24h, confidence, dataPoints)", function () {
    async function priceFixture() {
      const router = await deployRouter();
      const oracle = await deployPriceOracle(router);
      await oracle.updatePrice("VERRA_VCS");
      return { router, oracle, id: await router.lastRequestId() };
    }

    it("stores a valid answer under its methodology with the answered volume / confidence / dataPoints", async function () {
      const { router, oracle, id } = await loadFixture(priceFixture);
      await expect(router.fulfillRequest(id, encodePrice(15n * USD, 1234n * USD, 67n, 2n), "0x"))
        .to.emit(oracle, "PriceUpdated");
      const d = await oracle.getPriceData("VERRA_VCS");
      expect([d.price, d.volume24h, d.confidence, d.dataPoints]).to.deep.equal([15n * USD, 1234n * USD, 67n, 2n]);
      expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(15n * USD);
      expect(await oracle.lastPriceManual("VERRA_VCS")).to.equal(false);
      expect(await oracle.requestMethodology(id)).to.equal(""); // binding consumed
    });

    it("an oracle error settles the request: PriceRequestFailed(error text), nothing stored", async function () {
      const { router, oracle, id } = await loadFixture(priceFixture);
      await expect(router.fulfillRequest(id, "0x", ethers.toUtf8Bytes("sources disagree")))
        .to.emit(oracle, "PriceRequestFailed")
        .withArgs("VERRA_VCS", "sources disagree");
      await expect(oracle.getLatestPrice("VERRA_VCS")).to.be.revertedWith("Price not available");
      expect(await oracle.requestMethodology(id)).to.equal("");
    });

    it("any other length is 'Malformed response' without reverting: empty, legacy 32-byte, short, 160 bytes, oversized", async function () {
      const bad = ["0x", u256(15n * USD), `0x${"00".repeat(127)}`, `0x${"00".repeat(160)}`, OVERSIZED];
      for (const response of bad) {
        const { router, oracle, id } = await priceFixture();
        await expect(router.fulfillRequest(id, response, "0x"))
          .to.emit(oracle, "PriceRequestFailed")
          .withArgs("VERRA_VCS", "Malformed response");
        await expect(oracle.getLatestPrice("VERRA_VCS")).to.be.revertedWith("Price not available");
      }
    });

    it("out-of-range fields are rejected with a reason and never stored", async function () {
      const cases = [
        [encodePrice(0n), "Price out of bounds"],
        [encodePrice(1n), "Price out of bounds"],
        [encodePrice(10n ** 13n), "Price out of bounds"], // above the 10,000 USD default maximum
        [encodePrice(ethers.MaxUint256), "Price out of bounds"],
        [encodePrice(15n * USD, 0n, 101n, 3n), "Invalid response"], // confidence > 100
        [encodePrice(15n * USD, 0n, 100n, 0n), "Invalid response"], // no data point
        [encodePrice(15n * USD, 0n, 100n, 6n), "Invalid response"], // more than MAX_PRICE_SOURCES
        [encodePrice(15n * USD, 2n ** 128n, 100n, 3n), "Invalid response"], // volume > uint128
        [encodePrice(15n * USD, 0n, 59n, 3n), "Confidence too low"], // below default minConfidence 60
        [encodePrice(15n * USD, 0n, 0n, 1n), "Confidence too low"],
      ];
      for (const [response, reason] of cases) {
        const { router, oracle, id } = await priceFixture();
        await expect(router.fulfillRequest(id, response, "0x"))
          .to.emit(oracle, "PriceRequestFailed")
          .withArgs("VERRA_VCS", reason);
        await expect(oracle.getLatestPrice("VERRA_VCS")).to.be.revertedWith("Price not available");
      }
    });

    it("boundary values are accepted (min/max price, confidence 100 / minConfidence, 5 data points, volume uint128 max)", async function () {
      const { router, oracle, id } = await loadFixture(priceFixture);
      await router.fulfillRequest(id, encodePrice(await oracle.maxPrice(), 2n ** 128n - 1n, 100n, 5n), "0x");
      expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(await oracle.maxPrice());
      await oracle.updatePrice("ICM_COMPLIANCE");
      await router.fulfillRequest(await router.lastRequestId(), encodePrice(await oracle.minPrice(), 0n, 60n, 1n), "0x");
      expect(await oracle.getLatestPrice("ICM_COMPLIANCE")).to.equal(await oracle.minPrice());
    });

    it("replay / wrong request id: the router rejects a settled id, the contract rejects ids it never sent", async function () {
      const { router, oracle, id } = await loadFixture(priceFixture);
      await router.fulfillRequest(id, encodePrice(15n * USD), "0x");
      await expect(router.fulfillRequest(id, encodePrice(16n * USD), "0x")).to.be.revertedWith("Request not found");
      // even a delivery that reaches the contract again is refused (binding was consumed)
      await expect(asRouter(router, oracle, id, encodePrice(16n * USD))).to.be.revertedWith("Unknown request");
      await expect(asRouter(router, oracle, ethers.id("never sent"), encodePrice(16n * USD))).to.be.revertedWith("Unknown request");
      expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(15n * USD);
    });

    it("answers land under the methodology of THEIR request, in any order", async function () {
      const router = await deployRouter();
      const oracle = await deployPriceOracle(router);
      await oracle.updatePrice("ICM_COMPLIANCE");
      const a = await router.lastRequestId();
      await oracle.updatePrice("GOLD_STANDARD");
      const b = await router.lastRequestId();
      await router.fulfillRequest(b, encodePrice(30n * USD), "0x");
      await router.fulfillRequest(a, encodePrice(8n * USD), "0x");
      expect(await oracle.getLatestPrice("ICM_COMPLIANCE")).to.equal(8n * USD);
      expect(await oracle.getLatestPrice("GOLD_STANDARD")).to.equal(30n * USD);
      await expect(oracle.getLatestPrice("VERRA_VCS")).to.be.revertedWith("Price not available");
    });
  });

  // ======================================================== EmissionVerifier
  describe("EmissionVerifier (64 bytes: measuredEmissions, confidence)", function () {
    async function verifierFixture() {
      const [, owner] = await ethers.getSigners();
      const router = await deployRouter();
      const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
      const verifier = await deployVerifier(router, nft);
      await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), await verifier.getAddress());
      await verifier.registerProject("P1", owner.address, "VERRA_VCS", 10_000n * E18, 30, 30 * DAY, IOT_URL, CROSS_URL, ethers.ZeroHash);
      await time.increase(30 * DAY + 1);
      await verifier.requestVerification("P1");
      return { router, nft, verifier, owner, id: await router.lastRequestId() };
    }
    const failedWith = async (verifier, id, reason) => {
      const r = await verifier.getVerificationRequest(id);
      expect(r.fulfilled && r.failed, "request settled as failed").to.equal(true);
      expect(r.reductionAchieved).to.equal(0n);
      expect(await verifier.pendingRequestId("P1")).to.equal(ethers.ZeroHash);
      const evs = await verifier.queryFilter(verifier.filters.VerificationFailed());
      expect(evs[evs.length - 1].args.reason).to.equal(reason);
      await expect(verifier.claimCredits(id)).to.be.revertedWith("Not verified");
    };

    it("records a valid answer (measurement + confidence) and the credits are claimable at confidence >= 90", async function () {
      const { router, nft, verifier, owner, id } = await loadFixture(verifierFixture);
      await expect(router.fulfillRequest(id, encodeEmission(7_000n * E18, 100n), "0x"))
        .to.emit(verifier, "VerificationFulfilled")
        .withArgs(id, "P1", 7_000n * E18, 3_000n * E18, 100);
      const r = await verifier.getVerificationRequest(id);
      expect([r.measuredEmissions, r.reductionAchieved, r.confidenceScore]).to.deep.equal([7_000n * E18, 3_000n * E18, 100n]);
      expect(r.dataProofHash).to.equal(ethers.keccak256(encodeEmission(7_000n * E18, 100n)));
      await verifier.claimCredits(id);
      expect(await nft.ownerOf(1)).to.equal(owner.address);
    });

    it("a single-source answer (confidence 70) is recorded but cannot be claimed", async function () {
      const { router, verifier, id } = await loadFixture(verifierFixture);
      await router.fulfillRequest(id, encodeEmission(7_000n * E18, 70n), "0x");
      expect((await verifier.getVerificationRequest(id)).confidenceScore).to.equal(70n);
      await expect(verifier.claimCredits(id)).to.be.revertedWith("Confidence too low");
      // boundary: exactly the threshold passes
      const f = await verifierFixture();
      await f.router.fulfillRequest(f.id, encodeEmission(7_000n * E18, 90n), "0x");
      await f.verifier.claimCredits(f.id);
    });

    it("oracle error / wrong length / oversized / zero / invalid confidence settle as failed and never mint", async function () {
      const cases = [
        [(r, id) => r.fulfillRequest(id, "0x", ethers.toUtf8Bytes("measurement request failed")), "Oracle error"],
        [(r, id) => r.fulfillRequest(id, "0x", "0x"), "Malformed response"],
        [(r, id) => r.fulfillRequest(id, u256(7_000n * E18), "0x"), "Malformed response"], // legacy 32-byte format
        [(r, id) => r.fulfillRequest(id, `0x${"00".repeat(96)}`, "0x"), "Malformed response"],
        [(r, id) => r.fulfillRequest(id, OVERSIZED, "0x"), "Malformed response"],
        [(r, id) => r.fulfillRequest(id, encodeEmission(0n, 100n), "0x"), "Zero measurement"],
        [(r, id) => r.fulfillRequest(id, encodeEmission(7_000n * E18, 0n), "0x"), "Invalid confidence"],
        [(r, id) => r.fulfillRequest(id, encodeEmission(7_000n * E18, 101n), "0x"), "Invalid confidence"],
      ];
      for (const [send, reason] of cases) {
        const { router, nft, verifier, id } = await verifierFixture();
        await send(router, id);
        await failedWith(verifier, id, reason);
        expect(await nft.totalSupply()).to.equal(0n);
        expect(await verifier.periodVerified("P1", 1)).to.equal(false);
      }
    });

    it("an implausibly large measurement gives no reduction (no credits)", async function () {
      const { router, verifier, id } = await loadFixture(verifierFixture);
      await router.fulfillRequest(id, encodeEmission(ethers.MaxUint256, 100n), "0x");
      expect((await verifier.getVerificationRequest(id)).reductionAchieved).to.equal(0n);
      await expect(verifier.claimCredits(id)).to.be.revertedWith("No reduction");
    });

    it("replay / wrong request id: settled ids and unknown ids are rejected", async function () {
      const { router, verifier, id } = await loadFixture(verifierFixture);
      await router.fulfillRequest(id, encodeEmission(7_000n * E18, 100n), "0x");
      await expect(router.fulfillRequest(id, encodeEmission(1n * E18, 100n), "0x")).to.be.revertedWith("Request not found");
      await expect(asRouter(router, verifier, id, encodeEmission(1n * E18, 100n))).to.be.revertedWith("Request already fulfilled");
      await expect(asRouter(router, verifier, ethers.id("never sent"), encodeEmission(1n * E18, 100n))).to.be.revertedWith("Unknown request");
      expect((await verifier.getVerificationRequest(id)).measuredEmissions).to.equal(7_000n * E18);
    });
  });

  // ======================================================== RegistrySync
  describe("RegistrySync (32 bytes: status 0 NOT_FOUND / 1 ACTIVE / 2 RETIRED)", function () {
    async function syncFixture() {
      const router = await deployRouter();
      const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
      const sync = await deploySync(router, nft);
      await sync.checkRegistry("VERRA", "S-1");
      return { router, sync, id: await router.lastRequestId() };
    }
    const statusOf = async (sync, id) => (await sync.getRegistryCheck(id)).registryStatus;

    it("decodes each valid status and applies the verdict", async function () {
      for (const [status, name, verified, used] of [
        [NOT_FOUND, "NOT_FOUND", false, false],
        [ACTIVE, "ACTIVE", false, true],
        [RETIRED, "RETIRED", true, false],
      ]) {
        const { router, sync, id } = await syncFixture();
        await router.fulfillRequest(id, encodeRegistry(status), "0x");
        expect(await statusOf(sync, id)).to.equal(name);
        expect(await sync.isCreditVerified("VERRA", "S-1")).to.equal(verified);
        expect(await sync.isSerialUsed("VERRA", "S-1")).to.equal(used);
        expect((await sync.getRegistryCheck(id)).existsInRegistry).to.equal(status !== NOT_FOUND);
      }
    });

    it("error / wrong length / oversized / out-of-range status => ERROR and NO verdict change (fail closed)", async function () {
      const cases = [
        ["0x", ethers.toUtf8Bytes("registry request failed")],
        ["0x", "0x"],
        [coder.encode(["uint256", "uint256"], [2n, 0n]), "0x"], // 64 bytes
        [OVERSIZED, "0x"],
        [encodeRegistry(3n), "0x"],
        [encodeRegistry(257n), "0x"], // legacy "exists*256 + status" format is no longer valid
        [encodeRegistry(ethers.MaxUint256), "0x"],
      ];
      for (const [response, err] of cases) {
        const { router, sync, id } = await syncFixture();
        await router.fulfillRequest(id, response, err);
        expect(await statusOf(sync, id)).to.equal("ERROR");
        expect(await sync.isCreditVerified("VERRA", "S-1")).to.equal(false);
        expect(await sync.isSerialUsed("VERRA", "S-1")).to.equal(false);
      }
      // an ERROR after a RETIRED verdict does not revoke it
      const { router, sync, id } = await syncFixture();
      await router.fulfillRequest(id, encodeRegistry(RETIRED), "0x");
      await sync.checkRegistry("VERRA", "S-1");
      await router.fulfillRequest(await router.lastRequestId(), "0x", ethers.toUtf8Bytes("boom"));
      expect(await sync.isCreditVerified("VERRA", "S-1")).to.equal(true);
    });

    it("replay / wrong request id: settled ids and unknown ids are rejected", async function () {
      const { router, sync, id } = await loadFixture(syncFixture);
      await router.fulfillRequest(id, encodeRegistry(RETIRED), "0x");
      await expect(router.fulfillRequest(id, encodeRegistry(ACTIVE), "0x")).to.be.revertedWith("Request not found");
      await expect(asRouter(router, sync, id, encodeRegistry(ACTIVE))).to.be.revertedWith("Request already fulfilled");
      await expect(asRouter(router, sync, ethers.id("never sent"), encodeRegistry(ACTIVE))).to.be.revertedWith("Unknown request");
      expect(await sync.isCreditVerified("VERRA", "S-1")).to.equal(true);
    });
  });
});
