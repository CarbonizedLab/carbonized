/**
 * AUD-ORACLE-07..09 : RegistrySync - REGRESSION tests (each exploit now fails).
 * Run: npx hardhat test test/poc/oracle-03-registry-sync.test.js
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { NOT_FOUND, ACTIVE, RETIRED, encodeRegistry, deployRouter, deploySync } = require("../helpers/oracle");

const BIG_GAS = 8_000_000n;
const enc = (n) => encodeRegistry(n);

async function fixture() {
  const [admin, issuer, user] = await ethers.getSigners();
  const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
  const router = await deployRouter("PocFunctionsRouter");
  const sync = await deploySync(router, nft);
  await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), issuer.address);
  return { admin, issuer, user, nft, router, sync };
}
const ids = async (sync) => (await sync.queryFilter(sync.filters.RequestSent())).map((e) => e.args.id);
async function answer(sync, router, serial, value, registry = "VERRA") {
  await sync.checkRegistry(registry, serial);
  const all = await ids(sync);
  const id = all[all.length - 1];
  expect(await router.fulfill.staticCall(id, enc(value), "0x")).to.equal(true);
  await router.fulfill(id, enc(value), "0x");
  return id;
}

describe("Regression oracle / RegistrySync", function () {
  it("[AUD-ORACLE-07] batchCheckRegistry works for a VERIFIER_ROLE holder and records the caller as requester", async function () {
    const { admin, user, sync } = await loadFixture(fixture);
    const tx = await sync.batchCheckRegistry("VERRA", ["S1", "S2", "S3"]);
    await expect(tx).to.emit(sync, "RegistryCheckRequested");
    const all = await ids(sync);
    expect(all.length).to.equal(3);
    for (const id of all) {
      const c = await sync.getRegistryCheck(id);
      expect(c.requester).to.equal(admin.address); // not the contract itself
    }
    expect((await sync.getRegistryStats("VERRA")).checksPerformed).to.equal(3n);

    // still role gated for everyone else; size bounded
    await expect(sync.connect(user).batchCheckRegistry("VERRA", ["S4"])).to.be.reverted;
    await expect(sync.batchCheckRegistry("VERRA", [])).to.be.revertedWith("Invalid batch size");
    await expect(sync.batchCheckRegistry("VERRA", Array.from({ length: 21 }, (_, i) => `X${i}`))).to.be.revertedWith(
      "Invalid batch size"
    );
    await expect(sync.batchCheckRegistry("NOPE", ["S1"])).to.be.revertedWith("Registry not supported");
  });

  it("[AUD-ORACLE-08] 'not found' is NOT 'verified'; ACTIVE is a duplicate, only RETIRED-at-source is cleared; verdicts are revocable", async function () {
    const { router, sync } = await loadFixture(fixture);

    // fabricated / typo'd serial (404) is not cleared
    await answer(sync, router, "FAKE-SERIAL-123", NOT_FOUND);
    expect(await sync.isCreditVerified("VERRA", "FAKE-SERIAL-123")).to.equal(false);

    // still circulating at the source: duplicate, not verified
    await answer(sync, router, "S-ACTIVE", ACTIVE);
    expect(await sync.isCreditVerified("VERRA", "S-ACTIVE")).to.equal(false);
    expect(await sync.isSerialUsed("VERRA", "S-ACTIVE")).to.equal(true);

    // retired at the source: cleared, and no longer flagged as circulating
    await answer(sync, router, "S-ACTIVE", RETIRED);
    expect(await sync.isCreditVerified("VERRA", "S-ACTIVE")).to.equal(true);
    expect(await sync.isSerialUsed("VERRA", "S-ACTIVE")).to.equal(false);

    // later it is seen ACTIVE again (or vanishes): approval is revoked, never stale-true
    await answer(sync, router, "S-ACTIVE", ACTIVE);
    expect((await sync.queryFilter(sync.filters.CreditVerificationRevoked())).length).to.equal(1);
    expect(await sync.isCreditVerified("VERRA", "S-ACTIVE")).to.equal(false);
    expect(await sync.isSerialUsed("VERRA", "S-ACTIVE")).to.equal(true);

    // (registry, serial) keys cannot collide through concatenation
    await answer(sync, router, "C", RETIRED, "ICM");
    expect(await sync.isCreditVerified("ICM", "C")).to.equal(true);
    expect(await sync.isCreditVerified("ICM" + "C", "")).to.equal(false);
    expect(await sync.isCreditVerified("ICMC", "")).to.equal(false);
  });

  it("[AUD-ORACLE-08b] oracle errors / malformed answers never clear a credit; newest request wins", async function () {
    const { router, sync } = await loadFixture(fixture);
    await sync.checkRegistry("VERRA", "E-1");
    const [id] = await ids(sync);
    await router.fulfill(id, "0x", ethers.toUtf8Bytes("boom"));
    expect((await sync.getRegistryCheck(id)).registryStatus).to.equal("ERROR");
    expect(await sync.isCreditVerified("VERRA", "E-1")).to.equal(false);

    // out-of-order answers: the newer request's verdict is kept
    await sync.checkRegistry("VERRA", "O-1");
    await sync.checkRegistry("VERRA", "O-1");
    const all = await ids(sync);
    const [older, newer] = [all[all.length - 2], all[all.length - 1]];
    await router.fulfill(newer, enc(RETIRED), "0x");
    await router.fulfill(older, enc(ACTIVE), "0x"); // late, stale answer
    expect(await sync.isCreditVerified("VERRA", "O-1")).to.equal(true);
  });

  it("[AUD-ORACLE-08c] advisory only: the NFT does not consult RegistrySync (documented, not enforced onchain)", async function () {
    const { issuer, nft, router, sync } = await loadFixture(fixture);
    await answer(sync, router, "DUP-1", ACTIVE);
    expect(await sync.isSerialUsed("VERRA", "DUP-1")).to.equal(true);
    // the issuer is the enforcement point: a compliant issuer checks the hook first
    const cleared = (await sync.isCreditVerified("VERRA", "DUP-1")) && !(await sync.isSerialUsed("VERRA", "DUP-1"));
    expect(cleared).to.equal(false);
    // (an issuer that ignores it can still mint; see RegistrySync NatSpec)
    await nft.connect(issuer).mintCredit(
      issuer.address, "P", "P", "VERRA-DUP-1", "VERRA", 1n, 2024, "IN", ethers.keccak256("0x01"), "", "ipfs://x"
    );
  });

  it("[AUD-ORACLE-09] callback gas headroom: default budget covers the callback; setter is bounded and emits", async function () {
    const { router, sync, user } = await loadFixture(fixture);
    expect(await sync.gasLimit()).to.equal(300_000n);
    await sync.checkRegistry("VERRA", "S-1");
    const [id] = await ids(sync);
    const r = await router.fulfillWithGas.staticCall(id, enc(RETIRED), "0x", BIG_GAS);
    console.log("      RegistrySync callback gas ~", r.gasUsed.toString(), "(budget 300000)");
    expect(r.success).to.equal(true);
    expect(r.gasUsed).to.be.lessThan(200_000n);

    await expect(sync.setFunctionsConfig(ethers.ZeroHash, 1, 199_999)).to.be.revertedWith("Gas limit out of bounds");
    await expect(sync.setFunctionsConfig(ethers.ZeroHash, 1, 1_000_001)).to.be.revertedWith("Gas limit out of bounds");
    await expect(sync.setFunctionsConfig(ethers.id("don"), 3, 250_000))
      .to.emit(sync, "FunctionsConfigUpdated")
      .withArgs(ethers.id("don"), 3, 250_000);
    await expect(sync.connect(user).setFunctionsConfig(ethers.ZeroHash, 1, 300_000)).to.be.reverted;
  });

  it("[AUD-ORACLE-09b] registry list admin: no duplicate registries, unknown names rejected, status change emits", async function () {
    const { sync } = await loadFixture(fixture);
    await expect(sync.addRegistry("VERRA", "x")).to.be.revertedWith("Registry exists");
    await expect(sync.setRegistryStatus("NOPE", false)).to.be.revertedWith("Unknown registry");
    await expect(sync.setRegistryStatus("ICM", false)).to.emit(sync, "RegistryStatusChanged").withArgs("ICM", false);
    await expect(sync.checkRegistry("ICM", "S")).to.be.revertedWith("Registry not supported");
    expect((await sync.getSupportedRegistries()).length).to.equal(3);
  });
});
