const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/*
 * [AUD-NFT-09] REGRESSION. batchMint() used to skip every mintCredit validation (0 tonnes,
 * vintage 0, zero proof, unbounded tonnes) and emitted no per-credit events.
 * Fix: both paths use one internal _issueCredit (same validation, same events) and tonnes per
 * credit are capped at MAX_TONNES_PER_CREDIT.
 */
describe("[AUD-NFT-09] batchMint enforces the same validation as mintCredit", function () {
  const proof = ethers.keccak256(ethers.toUtf8Bytes("p"));
  const item = (over = {}) => ({
    projectName: "N",
    serialNumber: "S-1",
    methodology: "VERRA_VCS",
    co2Tonnes: ethers.parseEther("1"),
    vintageYear: 2024,
    geography: "IN",
    oracleProofHash: proof,
    satelliteDataCID: "c",
    tokenURI: "u",
    ...over,
  });

  async function fixture() {
    const [owner, issuer, user1] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), issuer.address);
    return { nft, issuer, user1 };
  }

  it("[AUD-NFT-09] rejects zero tonnes, oversize tonnes, bad vintage, zero proof, empty serial, zero recipient", async function () {
    const { nft, issuer, user1 } = await loadFixture(fixture);
    const b = (items, to = user1.address) => nft.connect(issuer).batchMint(to, "P", items);

    await expect(b([item({ co2Tonnes: 0 })])).to.be.revertedWith("Invalid CO2 amount");
    await expect(b([item({ co2Tonnes: ethers.parseEther("1000000000") })])).to.be.revertedWith("Invalid CO2 amount");
    await expect(b([item({ co2Tonnes: (await nft.MAX_TONNES_PER_CREDIT()) + 1n })])).to.be.revertedWith("Invalid CO2 amount");
    await expect(b([item({ vintageYear: 0 })])).to.be.revertedWith("Invalid vintage year");
    await expect(b([item({ vintageYear: 9999 })])).to.be.revertedWith("Invalid vintage year");
    await expect(b([item({ oracleProofHash: ethers.ZeroHash })])).to.be.revertedWith("Oracle proof required");
    await expect(b([item({ serialNumber: "" })])).to.be.revertedWith("Serial required");
    await expect(b([item({ methodology: "" })])).to.be.revertedWith("Methodology required");
    await expect(b([item()], ethers.ZeroAddress)).to.be.revertedWith("Invalid recipient");
    await expect(b([item(), item({ serialNumber: " s-1 " })])).to.be.revertedWith("Credit already tokenized");
    await expect(b([])).to.be.revertedWith("Invalid batch size");
    expect(await nft.totalSupply()).to.equal(0);

    // the cap itself is allowed
    await b([item({ co2Tonnes: await nft.MAX_TONNES_PER_CREDIT() })]);
    expect(await nft.totalSupply()).to.equal(1);
  });

  it("[AUD-NFT-09] valid batch mints with per-credit events and consistent stats", async function () {
    const { nft, issuer, user1 } = await loadFixture(fixture);
    const tx = nft.connect(issuer).batchMint(user1.address, "P", [item({ serialNumber: "S-1" }), item({ serialNumber: "S-2" })]);
    await expect(tx)
      .to.emit(nft, "CreditMinted")
      .and.to.emit(nft, "SerialNumberRegistered")
      .and.to.emit(nft, "CreditBatchMinted");
    const s = await nft.getGlobalStats();
    expect(s.minted).to.equal(ethers.parseEther("2"));
    expect(s.active).to.equal(2);
    expect(await nft.isSerialTokenized("x", "S-2")).to.equal(true);
    expect(await nft.getMethodologyStats("VERRA_VCS")).to.equal(ethers.parseEther("2"));
  });

  it("[AUD-NFT-09] a zero-tonne NFT can no longer exist, so unwrapAny(0) cannot drain anything", async function () {
    const { nft } = await loadFixture(fixture);
    const cct = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy("T", "T", await nft.getAddress(), "VERRA_VCS");
    const [, , , rando] = await ethers.getSigners();
    await expect(cct.connect(rando).unwrapAny(0)).to.be.revertedWith("Invalid amount");
  });
});
