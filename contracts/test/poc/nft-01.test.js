const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/*
 * [AUD-NFT-01] REGRESSION. The NFT used to expose a public, un-gated
 * registerAndClaimCredits() (free "VERRA_VCS" credits per address, sybil-farmable) and an
 * issuer-only mintSimpleCredits() that produced proof-less starter credits.
 * Fix: both functions and `hasRegistered` are removed. The only issuance paths are
 * mintCredit / batchMint (NATIVE_ISSUER_ROLE, serial + oracle proof + validation).
 */
describe("[AUD-NFT-01] no free credit minting on the NFT (faucet removed)", function () {
  async function fixture() {
    const [owner, attacker, sybil] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    return { nft, owner, attacker, sybil };
  }

  const selector = (sig) => ethers.id(sig).slice(0, 10);

  it("[AUD-NFT-01] faucet functions and registration flag are gone from the ABI", async function () {
    const { nft } = await loadFixture(fixture);
    expect(nft.interface.getFunction("registerAndClaimCredits")).to.equal(null);
    expect(nft.interface.getFunction("mintSimpleCredits")).to.equal(null);
    expect(nft.interface.getFunction("hasRegistered")).to.equal(null);
  });

  it("[AUD-NFT-01] calling the old faucet selectors reverts for anyone (also for fresh sybil wallets)", async function () {
    const { nft, attacker, sybil, owner } = await loadFixture(fixture);
    const to = await nft.getAddress();
    for (const signer of [attacker, sybil, owner]) {
      await expect(signer.sendTransaction({ to, data: selector("registerAndClaimCredits()") })).to.be.reverted;
      await expect(
        signer.sendTransaction({
          to,
          data:
            selector("mintSimpleCredits(address,uint256)") +
            ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [signer.address, 5]).slice(2),
        })
      ).to.be.reverted;
    }
    expect(await nft.totalSupply()).to.equal(0);
    expect((await nft.getGlobalStats()).minted).to.equal(0);
  });

  it("[AUD-NFT-01] without NATIVE_ISSUER_ROLE nobody can mint (mintCredit / batchMint)", async function () {
    const { nft, attacker } = await loadFixture(fixture);
    const proof = ethers.keccak256(ethers.toUtf8Bytes("p"));
    await expect(
      nft.connect(attacker).mintCredit(attacker.address, "P", "N", "VCS-1", "VERRA_VCS", ethers.parseEther("1"), 2024, "IN", proof, "c", "u")
    ).to.be.reverted;
    await expect(nft.connect(attacker).batchMint(attacker.address, "P", [])).to.be.reverted;
    expect(await nft.totalSupply()).to.equal(0);
  });
});
