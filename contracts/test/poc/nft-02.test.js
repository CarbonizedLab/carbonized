const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/*
 * [AUD-NFT-02] REGRESSION. Quality arbitrage inside the CCT pool: a free junk credit used to
 * be swappable for a verified credit another user had wrapped.
 * Fix: (1) there is no free / unverified credit anymore (faucet removed, serial + oracle proof
 * mandatory at issuance), (2) the CCT wrap gate only accepts credits of the pool's methodology
 * that carry a registry serial and a non-zero oracle proof, so the pool is homogeneous,
 * (3) unwrap bookkeeping is explicit (see nft-03/04).
 */
describe("[AUD-NFT-02] CCT pool only admits verified credits (no junk-for-verified swap)", function () {
  async function fixture() {
    const [owner, issuer, alice, mallory] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), issuer.address);
    const cct = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy("Carbonized Credit - Verra", "CCT-VCS", await nft.getAddress(), "VERRA_VCS");

    await nft
      .connect(issuer)
      .mintCredit(alice.address, "PROJECT_REAL", "Real Verra Project", "VCS-777", "VERRA_VCS", ethers.parseEther("1"), 2024, "IN", ethers.keccak256(ethers.toUtf8Bytes("real-oracle-proof")), "QmReal", "ipfs://real");
    await nft.connect(alice).approve(await cct.getAddress(), 1);
    await cct.connect(alice).wrapCredit(1);
    return { nft, cct, owner, issuer, alice, mallory };
  }

  it("[AUD-NFT-02] (a) the issuer cannot create a serial-less / proof-less credit that could be wrapped", async function () {
    const { nft, issuer, mallory } = await loadFixture(fixture);
    const proof = ethers.keccak256(ethers.toUtf8Bytes("p"));
    await expect(
      nft.connect(issuer).mintCredit(mallory.address, "P", "N", "", "VERRA_VCS", ethers.parseEther("1"), 2024, "IN", proof, "c", "u")
    ).to.be.revertedWith("Serial required");
    await expect(
      nft.connect(issuer).mintCredit(mallory.address, "P", "N", "S", "VERRA_VCS", ethers.parseEther("1"), 2024, "IN", ethers.ZeroHash, "c", "u")
    ).to.be.revertedWith("Oracle proof required");
  });

  it("[AUD-NFT-02] (b) the CCT wrap gate rejects unverified credits (empty serial / zero proof)", async function () {
    const { alice, mallory } = await loadFixture(fixture);
    const loose = await (await ethers.getContractFactory("PocLooseNft")).deploy();
    const cct = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy("T", "T", await loose.getAddress(), "VERRA_VCS");
    const proof = ethers.keccak256(ethers.toUtf8Bytes("p"));
    const one = ethers.parseEther("1");
    await loose.put(1, mallory.address, "VERRA_VCS", one, "", proof); // no serial (old starter credit)
    await loose.put(2, mallory.address, "VERRA_VCS", one, "VCS-1", ethers.ZeroHash); // no proof
    await loose.put(3, mallory.address, "VERRA_VCS", 0, "VCS-3", proof); // zero tonnes
    await loose.put(4, mallory.address, "VERRA_VCS", one, "VCS-4", proof); // control: verified
    await expect(cct.connect(mallory).wrapCredit(1)).to.be.revertedWith("Unverified credit");
    await expect(cct.connect(mallory).wrapCredit(2)).to.be.revertedWith("Unverified credit");
    await expect(cct.connect(mallory).wrapCredit(3)).to.be.revertedWith("Empty credit");
    await expect(cct.connect(mallory).batchWrap([4, 1])).to.be.revertedWith("Unverified credit");
    expect(await cct.totalSupply()).to.equal(0);
    await cct.connect(mallory).wrapCredit(4); // verified one is fine
    expect(await cct.balanceOf(mallory.address)).to.equal(one);
    void alice;
  });

  it("[AUD-NFT-02] (c) a credit of another methodology cannot enter the pool", async function () {
    const { nft, cct, issuer, mallory } = await loadFixture(fixture);
    await nft
      .connect(issuer)
      .mintCredit(mallory.address, "P", "N", "GS-1", "GOLD_STANDARD", ethers.parseEther("1"), 2024, "IN", ethers.keccak256(ethers.toUtf8Bytes("x")), "c", "u");
    await nft.connect(mallory).approve(await cct.getAddress(), 2);
    await expect(cct.connect(mallory).wrapCredit(2)).to.be.revertedWith("Methodology mismatch");
  });

  it("[AUD-NFT-02] (d) a mallory without CCT cannot pull Alice's NFT out; backing stays verified", async function () {
    const { nft, cct, alice, mallory } = await loadFixture(fixture);
    await expect(cct.connect(mallory).unwrapCredit(1)).to.be.revertedWith("Insufficient CCT balance");
    await expect(cct.connect(mallory).unwrapAny(ethers.parseEther("1"))).to.be.revertedWith("Insufficient balance");
    expect(await nft.ownerOf(1)).to.equal(await cct.getAddress());
    expect((await nft.getCreditDetails(1)).serialNumber).to.equal("VCS-777");
    expect(await cct.getUserWrappedNFTs(alice.address)).to.deep.equal([1n]);
  });
});
