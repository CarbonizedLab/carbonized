const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/*
 * [AUD-NFT-08] REGRESSION. issuedSerials used to be keyed by
 * keccak256(abi.encodePacked(methodology, serialNumber)): the same registry serial could be
 * tokenized again under another methodology label / case / whitespace; packed strings
 * collided; an empty serial was accepted once.
 * Fix: key = keccak256(abi.encode(trim(upper(serial)))) - independent of the methodology label,
 * length-delimited, empty/whitespace-only serial rejected.
 */
describe("[AUD-NFT-08] canonical serial hash (methodology/case/whitespace independent)", function () {
  async function fixture() {
    const [owner, issuer, user1] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), issuer.address);
    const mint = (methodology, serial) =>
      nft
        .connect(issuer)
        .mintCredit(user1.address, "P", "N", serial, methodology, ethers.parseEther("1"), 2024, "IN", ethers.keccak256(ethers.toUtf8Bytes("p")), "c", "u");
    return { nft, mint };
  }

  it("[AUD-NFT-08] (a) same registry serial cannot be tokenized again under another label/case/whitespace", async function () {
    const { nft, mint } = await loadFixture(fixture);
    await mint("VERRA_VCS", "VCS-123");
    for (const [m, s] of [
      ["VERRA_VCS", "VCS-123"],
      ["GOLD_STANDARD", "VCS-123"],
      ["verra_vcs", "VCS-123"],
      ["VERRA_VCS", "vcs-123"],
      ["VERRA_VCS", "VCS-123 "],
      ["VERRA_VCS", "  vcs-123\t"],
      ["VERRA_VCS", "\nVcs-123\r\n"],
    ]) {
      await expect(mint(m, s), `${m} / ${JSON.stringify(s)}`).to.be.revertedWith("Credit already tokenized");
    }
    expect(await nft.totalSupply()).to.equal(1);
    expect(await nft.isSerialTokenized("ANYTHING", " vcs-123 ")).to.equal(true);
    expect(await nft.isSerialTokenized("VERRA_VCS", "VCS-124")).to.equal(false);
  });

  it("[AUD-NFT-08] (b) distinct credits no longer collide through packed encoding", async function () {
    const { nft, mint } = await loadFixture(fixture);
    await mint("VERRA_VCS", "-1");
    expect(await nft.isSerialTokenized("VERRA_VCS-", "1")).to.equal(false);
    await mint("VERRA_VCS-", "1"); // distinct serial, must be accepted
    expect(await nft.totalSupply()).to.equal(2);
  });

  it("[AUD-NFT-08] (c) empty / whitespace-only serial is rejected", async function () {
    const { nft, mint } = await loadFixture(fixture);
    await expect(mint("VERRA_VCS", "")).to.be.revertedWith("Serial required");
    await expect(mint("VERRA_VCS", "  \t ")).to.be.revertedWith("Serial required");
    expect(await nft.isSerialTokenized("VERRA_VCS", "")).to.equal(false);
    expect(await nft.totalSupply()).to.equal(0);
  });
});
