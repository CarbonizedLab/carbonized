const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ACTIVE, RETIRED, encodeRegistry, deployRouter, deploySync } = require("../helpers/oracle");

const proof = ethers.keccak256("0x01");

async function fixture() {
  const [admin, nativeIssuer, externalIssuer] = await ethers.getSigners();
  const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
  const router = await deployRouter("PocFunctionsRouter");
  const sync = await deploySync(router, nft);
  await nft.setRegistrySync(await sync.getAddress());
  await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), nativeIssuer.address);
  await nft.grantRole(await nft.EXTERNAL_ISSUER_ROLE(), externalIssuer.address);
  return { nft, router, sync, nativeIssuer, externalIssuer };
}

async function answer(sync, router, serial, status) {
  await sync.checkRegistry("VERRA", serial);
  const events = await sync.queryFilter(sync.filters.RequestSent());
  const id = events.at(-1).args.id;
  await router.fulfill(id, encodeRegistry(status), "0x");
}

const mintExternal = (nft, signer, serial) =>
  nft.connect(signer).mintExternalCredit(
    signer.address,
    "PROJECT-1",
    "Project One",
    "VERRA",
    serial,
    "VERRA_VCS",
    1n,
    2024,
    "ID",
    proof,
    "",
    "ipfs://credit"
  );

describe("CarbonCreditNFT external-registry attestation", function () {
  it("rejects an ACTIVE external registry serial", async function () {
    const { nft, router, sync, externalIssuer } = await loadFixture(fixture);
    await answer(sync, router, "ACTIVE-1", ACTIVE);
    await expect(mintExternal(nft, externalIssuer, "ACTIVE-1")).to.be.revertedWith("External registry credit not verified");
  });

  it("mints a RETIRED external registry serial only through the external issuer lane", async function () {
    const { nft, router, sync, nativeIssuer, externalIssuer } = await loadFixture(fixture);
    await answer(sync, router, "RETIRED-1", RETIRED);
    await expect(mintExternal(nft, nativeIssuer, "RETIRED-1")).to.be.reverted;
    await expect(mintExternal(nft, externalIssuer, "RETIRED-1")).to.emit(nft, "CreditMinted");
  });

  it("rejects an attestation older than 7 days for external mint", async function () {
    const { nft, router, sync, externalIssuer } = await loadFixture(fixture);
    await answer(sync, router, "STALE-1", RETIRED);

    const snapshot = await ethers.provider.send("evm_snapshot", []);
    const verifiedAt = await sync.verificationTimestamp("VERRA", "STALE-1");
    await ethers.provider.send("evm_setNextBlockTimestamp", [`0x${(verifiedAt + 8n * 24n * 3600n).toString(16)}`]);
    await ethers.provider.send("evm_mine");

    await expect(mintExternal(nft, externalIssuer, "STALE-1")).to.be.revertedWith("Registry attestation stale");
    expect(await nft.totalSupply()).to.equal(0n);

    await ethers.provider.send("evm_revert", [snapshot]);
  });

  it("reverts an entire external batch when one serial is not registry-cleared", async function () {
    const { nft, router, sync, externalIssuer } = await loadFixture(fixture);
    await answer(sync, router, "BATCH-OK", RETIRED);
    await answer(sync, router, "BATCH-BAD", ACTIVE);
    const credit = (serialNumber) => ({
      projectName: "Project One",
      serialNumber,
      methodology: "VERRA_VCS",
      co2Tonnes: 1n,
      vintageYear: 2024n,
      geography: "ID",
      oracleProofHash: proof,
      satelliteDataCID: "",
      tokenURI: "ipfs://credit",
    });

    await expect(
      nft.connect(externalIssuer).batchMintExternal(externalIssuer.address, "PROJECT-1", "VERRA", [credit("BATCH-OK"), credit("BATCH-BAD")])
    ).to.be.revertedWith("External registry credit not verified");
    expect(await nft.totalActiveCredits()).to.equal(0n);
  });
});
