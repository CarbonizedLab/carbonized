const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/*
 * [AUD-NFT-06] REGRESSION. A public 1-wei ERC20Burnable.burn() used to break the 1:1
 * NFT<->CCT backing permanently (last NFT could never be unwrapped).
 * Fix: CCT no longer inherits ERC20Burnable; supply only changes through wrap/unwrap, so
 * totalSupply() == totalTonnesWrapped is an invariant.
 */
describe("[AUD-NFT-06] holders cannot burn CCT; backing stays 1:1", function () {
  async function fixture() {
    const [owner, issuer, alice, bob, carol, mallory] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), issuer.address);
    const cct = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy("Carbonized Credit - Verra", "CCT-VCS", await nft.getAddress(), "VERRA_VCS");
    const mint = async (to, serial, t) => {
      await nft
        .connect(issuer)
        .mintCredit(to.address, "P", "N", serial, "VERRA_VCS", ethers.parseEther(t), 2024, "IN", ethers.keccak256(ethers.toUtf8Bytes(serial)), "c", "u");
    };
    await mint(alice, "A", "100"); // 1
    await mint(bob, "B", "50"); // 2
    await mint(carol, "C", "25"); // 3
    await mint(mallory, "M", "1"); // 4
    for (const [s, id] of [[alice, 1], [bob, 2], [carol, 3], [mallory, 4]]) {
      await nft.connect(s).approve(await cct.getAddress(), id);
      await cct.connect(s).wrapCredit(id);
    }
    return { nft, cct, alice, bob, carol, mallory };
  }

  it("[AUD-NFT-06] burn / burnFrom are not part of the token ABI and cannot be called", async function () {
    const { cct, mallory } = await loadFixture(fixture);
    expect(cct.interface.getFunction("burn")).to.equal(null);
    expect(cct.interface.getFunction("burnFrom")).to.equal(null);
    const burnSel = ethers.id("burn(uint256)").slice(0, 10) + ethers.toBeHex(1, 32).slice(2);
    await expect(mallory.sendTransaction({ to: await cct.getAddress(), data: burnSel })).to.be.reverted;
    expect(await cct.isFullyBacked()).to.equal(true);
  });

  it("[AUD-NFT-06] full redemption of every NFT always succeeds (no stranded backing)", async function () {
    const { nft, cct, alice, bob, carol, mallory } = await loadFixture(fixture);
    await cct.connect(mallory).transfer(carol.address, ethers.parseEther("1"));
    await cct.connect(alice).unwrapCredit(1);
    await cct.connect(bob).unwrapCredit(2);
    await cct.connect(carol).unwrapCredit(3);
    expect(await cct.totalSupply()).to.equal(ethers.parseEther("1"));
    await cct.connect(carol).unwrapCredit(4); // last NFT redeemable
    expect(await nft.ownerOf(4)).to.equal(carol.address);
    expect(await cct.totalSupply()).to.equal(0);
    expect(await cct.totalTonnesWrapped()).to.equal(0);
    expect(await cct.isFullyBacked()).to.equal(true);
  });
});
