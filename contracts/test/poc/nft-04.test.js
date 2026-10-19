const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/*
 * [AUD-NFT-04] REGRESSION. The wrapped-NFT lists used to be corrupted: unwrapCredit removed
 * with the caller's list and the wrapper's index (Panic 0x11 / wrong entry deleted) and
 * unwrapAny left stale ids.
 * Fix: wrapperOf[tokenId] is recorded at wrap time and BOTH unwrap paths remove the id from the
 * ORIGINAL wrapper's list (swap-and-pop) via one shared helper.
 */
describe("[AUD-NFT-04] wrapped-list bookkeeping stays consistent", function () {
  async function fixture() {
    const [owner, issuer, alice, dave, carol] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), issuer.address);
    const cct = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy("Carbonized Credit - Verra", "CCT-VCS", await nft.getAddress(), "VERRA_VCS");
    const mint = (to, serial) =>
      nft
        .connect(issuer)
        .mintCredit(to.address, "PROJ", "Project", serial, "VERRA_VCS", ethers.parseEther("1"), 2024, "IN", ethers.keccak256(ethers.toUtf8Bytes(serial)), "cid", "ipfs://x");
    await mint(alice, "A1"); // id 1 (Alice wraps)
    await mint(dave, "D1"); // id 2 (Dave wraps)
    await mint(alice, "A2"); // id 3 (Alice keeps)
    await nft.connect(alice).setApprovalForAll(await cct.getAddress(), true);
    await nft.connect(dave).setApprovalForAll(await cct.getAddress(), true);
    await cct.connect(alice).wrapCredit(1);
    await cct.connect(dave).wrapCredit(2);
    return { nft, cct, issuer, alice, dave, carol };
  }

  it("[AUD-NFT-04] (a) buyer with enough CCT can unwrapCredit", async function () {
    const { nft, cct, alice, carol } = await loadFixture(fixture);
    await cct.connect(alice).transfer(carol.address, ethers.parseEther("1"));
    await cct.connect(carol).unwrapCredit(1);
    expect(await nft.ownerOf(1)).to.equal(carol.address);
    expect(await cct.getUserWrappedNFTs(alice.address)).to.deep.equal([]);
  });

  it("[AUD-NFT-04] (b) unwrapping someone else's NFT never touches the caller's own list", async function () {
    const { nft, cct, alice, dave } = await loadFixture(fixture);
    expect(await cct.getUserWrappedNFTs(dave.address)).to.deep.equal([2n]);

    await cct.connect(dave).unwrapCredit(1); // Dave redeems Alice's NFT with his own CCT
    expect(await nft.ownerOf(1)).to.equal(dave.address);

    expect(await cct.wrappedNFTs(2)).to.equal(true);
    expect(await cct.getUserWrappedNFTs(dave.address)).to.deep.equal([2n]); // untouched
    expect(await cct.getUserWrappedNFTs(alice.address)).to.deep.equal([]); // cleaned
    expect(await cct.wrapperOf(1)).to.equal(ethers.ZeroAddress);
    expect(await cct.wrapperOf(2)).to.equal(dave.address);

    // Dave (true wrapper of #2) can still redeem it after getting 1 CCT
    await cct.connect(alice).transfer(dave.address, ethers.parseEther("1"));
    await cct.connect(dave).unwrapCredit(2);
    expect(await nft.ownerOf(2)).to.equal(dave.address);
    expect(await cct.getUserWrappedNFTs(dave.address)).to.deep.equal([]);
    expect(await cct.totalNFTsWrapped()).to.equal(0);
    expect(await cct.isFullyBacked()).to.equal(true);
  });

  it("[AUD-NFT-04] (c) unwrapAny cleans the original wrapper's list", async function () {
    const { nft, cct, alice, dave } = await loadFixture(fixture);
    const id = await cct.connect(dave).unwrapAny.staticCall(ethers.parseEther("1"));
    await cct.connect(dave).unwrapAny(ethers.parseEther("1"));
    expect(await nft.ownerOf(id)).to.equal(dave.address);
    expect(await cct.wrappedNFTs(id)).to.equal(false);
    const aliceList = await cct.getUserWrappedNFTs(alice.address);
    const daveList = await cct.getUserWrappedNFTs(dave.address);
    expect(aliceList.length + daveList.length).to.equal(1); // exactly the one still-wrapped NFT
    expect([...aliceList, ...daveList]).to.not.include(id);
  });

  it("[AUD-NFT-04] (d) swap-and-pop keeps indices right with several wrapped NFTs per user", async function () {
    const { nft, cct, issuer, alice } = await loadFixture(fixture);
    for (const s of ["X1", "X2", "X3"]) {
      await nft
        .connect(issuer)
        .mintCredit(alice.address, "PROJ", "Project", s, "VERRA_VCS", ethers.parseEther("1"), 2024, "IN", ethers.keccak256(ethers.toUtf8Bytes(s)), "c", "u");
    }
    // ids 4,5,6; Alice wraps them (list: 1,4,5,6)
    await cct.connect(alice).batchWrap([4, 5, 6]);
    await cct.connect(alice).unwrapCredit(4);
    await cct.connect(alice).unwrapCredit(1);
    const list = (await cct.getUserWrappedNFTs(alice.address)).map(Number).sort();
    expect(list).to.deep.equal([5, 6]);
    await cct.connect(alice).unwrapCredit(5);
    await cct.connect(alice).unwrapCredit(6);
    expect(await cct.getUserWrappedNFTs(alice.address)).to.deep.equal([]);
  });
});
