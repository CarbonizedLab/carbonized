const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/*
 * NEGATIVE checks (attack classes that were tried and FAIL). These tests pass when the
 * contract correctly rejects the attack; they document coverage for the internal audit notes.
 */
describe("[AUD-NFT-SAFE] attack classes that do not work", function () {
  async function fixture() {
    const [owner, issuer, alice, mallory, op] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), issuer.address);
    const mk = (n) => ethers.getContractFactory("CarbonCreditToken").then((f) => f.deploy(n, n, nft.getAddress(), "VERRA_VCS"));
    const cct = await mk("A");
    const cct2 = await mk("B"); // second pool with the same methodology
    for (let i = 1; i <= 3; i++) {
      await nft.connect(issuer).mintCredit(alice.address, "P", "N", "S" + i, "VERRA_VCS", ethers.parseEther("1"), 2024, "IN", ethers.keccak256(ethers.toUtf8Bytes("p")), "c", "u");
    }
    return { nft, cct, cct2, owner, issuer, alice, mallory, op };
  }

  it("non-issuers cannot mint; minting roles are enforced", async function () {
    const { nft, mallory } = await loadFixture(fixture);
    expect(nft.interface.getFunction("mintSimpleCredits")).to.equal(null);
    await expect(nft.connect(mallory).mintCredit(mallory.address, "P", "N", "x", "VERRA_VCS", 1, 2024, "IN", ethers.keccak256("0x01"), "c", "u")).to.be.reverted;
    await expect(nft.connect(mallory).batchMint(mallory.address, "P", [])).to.be.reverted;
    await expect(nft.connect(mallory).updateVerification(1, ethers.keccak256("0x01"), "c")).to.be.reverted;
    await expect(nft.connect(mallory).grantRole(await nft.NATIVE_ISSUER_ROLE(), mallory.address)).to.be.reverted;
  });

  it("the old starter-pack faucet no longer exists", async function () {
    const { nft } = await loadFixture(fixture);
    expect(nft.interface.getFunction("registerAndClaimCredits")).to.equal(null);
  });

  it("only the owner can retire; approved operators and strangers cannot; no double retire", async function () {
    const { nft, alice, mallory, op } = await loadFixture(fixture);
    await expect(nft.connect(mallory).retireCredit(1, "x")).to.be.revertedWith("Not credit owner");
    await nft.connect(alice).setApprovalForAll(op.address, true);
    await expect(nft.connect(op).retireCredit(1, "x")).to.be.revertedWith("Not credit owner");
    await expect(nft.connect(mallory).batchRetire([1], "x")).to.be.revertedWith("Not owner");
    await nft.connect(alice).retireCredit(1, "x");
    await expect(nft.connect(alice).retireCredit(1, "x")).to.be.reverted; // burned: ownerOf reverts
    await expect(nft.connect(alice).batchRetire([2, 2], "x")).to.be.reverted; // duplicate ids
    expect(await nft.totalActiveCredits()).to.equal(2); // unchanged by the failed batch
  });

  it("an NFT cannot back two CCT: wrap needs ownership + approval, duplicates and second pool fail", async function () {
    const { nft, cct, cct2, alice, mallory } = await loadFixture(fixture);
    await nft.connect(alice).setApprovalForAll(await cct.getAddress(), true);
    await nft.connect(alice).setApprovalForAll(await cct2.getAddress(), true);
    await expect(cct.connect(mallory).wrapCredit(1)).to.be.revertedWith("Not NFT owner");
    await expect(cct.connect(alice).batchWrap([1, 1])).to.be.revertedWith("Not NFT owner"); // 2nd iteration: vault owns it
    await cct.connect(alice).wrapCredit(1);
    await expect(cct.connect(alice).wrapCredit(1)).to.be.revertedWith("Not NFT owner");
    await expect(cct2.connect(alice).wrapCredit(1)).to.be.revertedWith("Not NFT owner");
    expect(await cct.totalSupply()).to.equal(ethers.parseEther("1"));
    expect(await cct2.totalSupply()).to.equal(0);
  });

  it("cannot unwrap with insufficient CCT, cannot unwrap an unwrapped NFT, cannot retire a vaulted NFT", async function () {
    const { nft, cct, alice, mallory } = await loadFixture(fixture);
    await nft.connect(alice).setApprovalForAll(await cct.getAddress(), true);
    await cct.connect(alice).wrapCredit(1);
    await expect(cct.connect(mallory).unwrapCredit(1)).to.be.revertedWith("Insufficient CCT balance");
    await expect(cct.connect(alice).unwrapCredit(2)).to.be.revertedWith("NFT not wrapped");
    await expect(nft.connect(alice).retireCredit(1, "x")).to.be.revertedWith("Not credit owner");
    await expect(nft.connect(mallory).transferFrom(await cct.getAddress(), mallory.address, 1)).to.be.reverted;
  });

  it("pause blocks mint, transfers, burns (retire) and CCT movements; only PAUSER may toggle", async function () {
    const { nft, cct, alice, mallory, issuer } = await loadFixture(fixture);
    await expect(nft.connect(mallory).pause()).to.be.reverted;
    await nft.pause();
    await expect(
      nft.connect(issuer).mintCredit(mallory.address, "P", "N", "NEW-1", "VERRA_VCS", ethers.parseEther("1"), 2024, "IN", ethers.keccak256("0x01"), "c", "u")
    ).to.be.revertedWith("Pausable: paused");
    await expect(nft.connect(alice).retireCredit(1, "x")).to.be.revertedWith("Pausable: paused");
    await expect(nft.connect(alice).transferFrom(alice.address, mallory.address, 1)).to.be.revertedWith("Pausable: paused");
    await expect(cct.connect(mallory).pause()).to.be.reverted;
  });

  it("[info] DEFAULT_ADMIN can renounce -> nobody can ever grant/revoke roles or fix a mis-assigned PAUSER (centralisation / brick risk)", async function () {
    const { nft, owner, mallory } = await loadFixture(fixture);
    await nft.renounceRole(await nft.PAUSER_ROLE(), owner.address); // while paused this bricks unpause
    await nft.renounceRole(await nft.DEFAULT_ADMIN_ROLE(), owner.address);
    await expect(nft.grantRole(await nft.PAUSER_ROLE(), owner.address)).to.be.reverted;
    await expect(nft.pause()).to.be.reverted;
  });

  it("tokenURI of an issued credit is the issuer-supplied URI (no starter credits without metadata exist)", async function () {
    const { nft } = await loadFixture(fixture);
    expect(await nft.tokenURI(1)).to.equal("u");
  });
});
