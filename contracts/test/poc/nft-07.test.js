const { expect } = require("chai");
const { ethers } = require("hardhat");

/*
 * [AUD-NFT-07] REGRESSION. A contract receiver used to re-enter retireCredit() from
 * onERC721Received while the credit struct was not yet written (zero-tonne retirement,
 * corrupted stats).
 * Fix: the starter-pack mint paths are gone; mintCredit/batchMint are nonReentrant and write
 * the credit struct, counters and serial BEFORE the _safeMint callback; retireCredit also
 * rejects uninitialised credits.
 */
describe("[AUD-NFT-07] no reentrancy into retireCredit during issuance", function () {
  async function fixture() {
    const [owner, issuer] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), issuer.address);
    const attacker = await (await ethers.getContractFactory("PocReentrantClaimer")).deploy(await nft.getAddress());
    return { nft, issuer, attacker };
  }
  const proof = ethers.keccak256(ethers.toUtf8Bytes("p"));

  it("[AUD-NFT-07] retireCredit from onERC721Received during mintCredit is rejected; stats stay consistent", async function () {
    const { nft, issuer, attacker } = await fixture();
    await nft
      .connect(issuer)
      .mintCredit(await attacker.getAddress(), "P", "N", "VCS-1", "VERRA_VCS", ethers.parseEther("3"), 2024, "IN", proof, "c", "u");

    expect(await attacker.reentered()).to.equal(0);
    expect(await attacker.blocked()).to.equal(1);
    expect(await nft.ownerOf(1)).to.equal(await attacker.getAddress());

    const s = await nft.getGlobalStats();
    expect(s.minted).to.equal(ethers.parseEther("3"));
    expect(s.retired).to.equal(0);
    expect(s.active).to.equal(1);
    await expect(nft.getRetirementCertificate(1)).to.be.revertedWith("Not retired");
    const c = await nft.credits(1);
    expect(c.isRetired).to.equal(false);
    expect(c.co2Tonnes).to.equal(ethers.parseEther("3"));
  });

  it("[AUD-NFT-07] same for batchMint (every item's callback is blocked)", async function () {
    const { nft, issuer, attacker } = await fixture();
    const items = [1, 2, 3].map((i) => ({
      projectName: "N",
      serialNumber: `VCS-B${i}`,
      methodology: "VERRA_VCS",
      co2Tonnes: ethers.parseEther("1"),
      vintageYear: 2024,
      geography: "IN",
      oracleProofHash: proof,
      satelliteDataCID: "c",
      tokenURI: "u",
    }));
    await nft.connect(issuer).batchMint(await attacker.getAddress(), "P", items);
    expect(await attacker.reentered()).to.equal(0);
    expect(await attacker.blocked()).to.equal(3);
    const s = await nft.getGlobalStats();
    expect(s.minted).to.equal(ethers.parseEther("3"));
    expect(s.active).to.equal(3);
    expect(await nft.balanceOf(await attacker.getAddress())).to.equal(3);
  });

  it("[AUD-NFT-07] retireCredit on a never-minted id reverts (no zero-tonne certificates)", async function () {
    const { nft, attacker } = await fixture();
    await expect(nft.connect((await ethers.getSigners())[3]).retireCredit(1, "x")).to.be.reverted;
    void attacker;
  });
});
