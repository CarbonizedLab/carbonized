const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/*
 * [AUD-NFT-03] REGRESSION. unwrapAny() used to scan ids 1..nft.totalSupply(); retirements
 * shrink totalSupply() so high-id wrapped NFTs became unreachable for CCT buyers.
 * Fix: wrapped NFTs are tracked explicitly (tonnes buckets); unwrapAny never reads
 * totalSupply() and never scans ids.
 */
describe("[AUD-NFT-03] unwrapAny no longer depends on NFT totalSupply", function () {
  async function fixture() {
    const [owner, issuer, alice, bob, carol] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), issuer.address);
    const cct = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy("Carbonized Credit - Verra", "CCT-VCS", await nft.getAddress(), "VERRA_VCS");

    const mint = (to, serial, tonnes) =>
      nft
        .connect(issuer)
        .mintCredit(to.address, "PROJ", "Project", serial, "VERRA_VCS", ethers.parseEther(tonnes), 2024, "IN", ethers.keccak256(ethers.toUtf8Bytes(serial)), "cid", "ipfs://x");
    await mint(bob, "S1", "7"); // id 1
    await mint(bob, "S2", "9"); // id 2
    await mint(alice, "S3", "100"); // id 3
    return { nft, cct, owner, issuer, alice, bob, carol };
  }

  it("[AUD-NFT-03] after retirements, a CCT buyer can still redeem the NFT that backs their CCT", async function () {
    const { nft, cct, alice, bob, carol } = await loadFixture(fixture);

    await nft.connect(alice).approve(await cct.getAddress(), 3);
    await cct.connect(alice).wrapCredit(3);
    await cct.connect(alice).transfer(carol.address, ethers.parseEther("100")); // sold to Carol

    await nft.connect(bob).batchRetire([1, 2], "offset");
    expect(await nft.totalSupply()).to.equal(1); // < id 3: this used to lock the NFT

    expect(await cct.wrappedCountByTonnes(ethers.parseEther("100"))).to.equal(1);
    await cct.connect(carol).unwrapAny(ethers.parseEther("100"));
    expect(await nft.ownerOf(3)).to.equal(carol.address);
    expect(await cct.wrappedNFTs(3)).to.equal(false);
    expect(await cct.totalSupply()).to.equal(0);
    expect(await cct.isFullyBacked()).to.equal(true);
  });

  it("[AUD-NFT-03] unwrapCredit by a non-wrapper with an empty list works too", async function () {
    const { nft, cct, alice, bob, carol } = await loadFixture(fixture);
    await nft.connect(alice).approve(await cct.getAddress(), 3);
    await cct.connect(alice).wrapCredit(3);
    await cct.connect(alice).transfer(carol.address, ethers.parseEther("100"));
    await nft.connect(bob).batchRetire([1, 2], "offset");
    await cct.connect(carol).unwrapCredit(3);
    expect(await nft.ownerOf(3)).to.equal(carol.address);
  });
});
