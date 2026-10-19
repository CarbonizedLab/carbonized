const { expect } = require("chai");
const { ethers } = require("hardhat");

/*
 * [AUD-NFT-05] REGRESSION. unwrapAny() used to be an O(n) scan (~47k gas per wrapped NFT with
 * a lower id) so an attacker who wrapped many junk NFTs could push the victim's redemption
 * over the block gas limit.
 * Fix: wrapped NFTs are bucketed by tonnes; unwrapAny pops from the bucket in O(1). The gas
 * used by the victim's unwrapAny must not grow with the number of other wrapped NFTs.
 */
describe("[AUD-NFT-05] unwrapAny gas is independent of the number of wrapped NFTs", function () {
  this.timeout(900000);

  async function scenario(junkCount) {
    const [owner, issuer, alice, carol, attacker] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), issuer.address);
    const cct = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy("Carbonized Credit - Verra", "CCT-VCS", await nft.getAddress(), "VERRA_VCS");
    await nft.connect(attacker).setApprovalForAll(await cct.getAddress(), true);

    const proof = ethers.keccak256(ethers.toUtf8Bytes("p"));
    // attacker-held 1-tonne credits, wrapped first (low ids)
    let serial = 0;
    for (let left = junkCount; left > 0; ) {
      const n = Math.min(left, 25); // batchMint costs ~0.5M gas per credit; keep under the 16.7M tx cap
      const items = [];
      for (let i = 0; i < n; i++) {
        items.push({
          projectName: "N",
          serialNumber: `JUNK-${serial++}`,
          methodology: "VERRA_VCS",
          co2Tonnes: ethers.parseEther("1"),
          vintageYear: 2024,
          geography: "IN",
          oracleProofHash: proof,
          satelliteDataCID: "c",
          tokenURI: "u",
        });
      }
      const ids = await nft.connect(issuer).batchMint.staticCall(attacker.address, "P", items);
      await nft.connect(issuer).batchMint(attacker.address, "P", items);
      await cct.connect(attacker).batchWrap([...ids]);
      left -= n;
    }
    const id = (await nft.getGlobalStats()).totalTokens + 1n;
    await nft
      .connect(issuer)
      .mintCredit(alice.address, "P", "Real", "VCS-1000", "VERRA_VCS", ethers.parseEther("1000"), 2024, "IN", proof, "c", "u");
    await nft.connect(alice).approve(await cct.getAddress(), id);
    await cct.connect(alice).wrapCredit(id);
    await cct.connect(alice).transfer(carol.address, ethers.parseEther("1000"));
    const tx = await cct.connect(carol).unwrapAny(ethers.parseEther("1000"), { gasLimit: 1_000_000 });
    const r = await tx.wait();
    expect(await nft.ownerOf(id)).to.equal(carol.address);
    return r.gasUsed;
  }

  it("[AUD-NFT-05] victim's unwrapAny costs the same with 0 and 150 junk wrapped NFTs (and fits 1M gas)", async function () {
    const small = await scenario(1);
    const large = await scenario(150);
    console.log("      unwrapAny gas with 1 vs 150 other wrapped NFTs:", small.toString(), large.toString());
    expect(large).to.be.lessThan(small + small / 10n); // <10% drift, no linear growth
    expect(large).to.be.lessThan(300_000n);
  });
});
