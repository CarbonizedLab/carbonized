/**
 * AUD-REGISTRY-01..03 : CarbonRegistry (starter credits, KYB badge integrity) - REGRESSION tests.
 * Each test asserts that the original exploit now FAILS.
 * Run: npx hardhat test test/poc/registry-01-starter-credits.test.js
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const E18 = 10n ** 18n;
const coder = ethers.AbiCoder.defaultAbiCoder();
const contact = (email, phone, salt = ethers.id("s")) =>
  ethers.keccak256(coder.encode(["string", "string", "bytes32"], [email, phone, salt]));

async function fixture() {
  const [admin, attacker, verifier, other] = await ethers.getSigners();
  const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
  const registry = await (await ethers.getContractFactory("CarbonRegistry")).deploy(admin.address);
  // Worst case for the old faucet: the registry holds NATIVE_ISSUER_ROLE on the NFT. It still cannot mint anything.
  await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), await registry.getAddress());
  await registry.grantRole(await registry.VERIFIER_ROLE(), verifier.address);
  return { admin, attacker, verifier, other, nft, registry };
}

describe("Regression registry / CarbonRegistry", function () {
  it("[AUD-REGISTRY-01] Sybil farming through the registry is impossible: no faucet, registering mints nothing", async function () {
    const { nft, registry } = await loadFixture(fixture);
    const wallets = [];
    for (let i = 0; i < 5; i++) {
      const w = ethers.Wallet.createRandom().connect(ethers.provider);
      await ethers.provider.send("hardhat_setBalance", [w.address, "0x56BC75E2D63100000"]);
      await registry.connect(w).registerTrader(`Sybil${i}`, contact(`s${i}@x.io`, "1"), "XX");
      wallets.push(w);
    }
    expect(await registry.totalTraders()).to.equal(5n);
    for (const w of wallets) {
      expect(await nft.balanceOf(w.address)).to.equal(0n);
      // the old entry point is gone from the contract entirely
      const legacy = new ethers.Contract(
        await registry.getAddress(),
        ["function registerAndClaimCredits() returns (uint256[])"],
        w
      );
      await expect(legacy.registerAndClaimCredits()).to.be.reverted;
    }
    expect((await nft.getGlobalStats()).minted).to.equal(0n);
  });

  it("[AUD-REGISTRY-01b] a contract wallet cannot collect credits via registration either", async function () {
    const { nft, registry } = await loadFixture(fixture);
    const Registry = await ethers.getContractFactory("CarbonRegistry");
    expect(Registry.interface.getFunction("registerAndClaimCredits")).to.equal(null);
    expect(Registry.interface.getFunction("starterCreditsClaimed")).to.equal(null);
    expect(await nft.totalSupply()).to.equal(0n);
    expect(await registry.totalTraders()).to.equal(0n);
  });

  it("[AUD-REGISTRY-02] KYB 'verified' badge no longer survives name, contact and emissions changes", async function () {
    const { attacker, verifier, registry } = await loadFixture(fixture);
    await registry.connect(attacker).registerCompany("Acme Steel Ltd", "L-1", 1000n * E18, 0, 0, contact("a@acme", "1"));
    await registry.connect(verifier).setCompanyVerified(attacker.address, true, await registry.profileHashOf(attacker.address));
    expect((await registry.getCompanyKyb(attacker.address)).verified).to.equal(true);

    // the original exploit: rename to "Tesla Inc", change contact, zero emissions
    await registry.connect(attacker).updateCompanyProfile("Tesla Inc", "L-1", contact("ceo@tesla", "2"));
    expect((await registry.getCompanyKyb(attacker.address)).verified).to.equal(false);
    await registry.connect(verifier).setCompanyVerified(attacker.address, true, await registry.profileHashOf(attacker.address));
    await registry.connect(attacker).updateEmissions(0, 0, 0);
    expect((await registry.getCompanyKyb(attacker.address)).verified).to.equal(false);
  });

  it("[AUD-REGISTRY-03] an impostor cannot obtain the KYB badge for a legal ID already verified for another wallet", async function () {
    const { attacker, other, verifier, registry } = await loadFixture(fixture);
    await registry.connect(other).registerCompany("Real Co", "L-77", 1n, 0, 0, contact("r@real", "1"));
    await registry.connect(verifier).setCompanyVerified(other.address, true, await registry.profileHashOf(other.address));

    // impostor registers identical name + legalId (registration stays permissionless) ...
    await registry.connect(attacker).registerCompany("Real Co", "l 77", 1n, 0, 0, contact("x@evil", "9"));
    // ... but a second verification of the same legal ID is refused
    await expect(
      registry.connect(verifier).setCompanyVerified(attacker.address, true, await registry.profileHashOf(attacker.address))
    ).to.be.revertedWith("Legal ID already verified");
    expect((await registry.getCompanyKyb(attacker.address)).verified).to.equal(false);
    expect(await registry.verifiedOwnerOfLegalId("L-77")).to.equal(other.address);
  });
});
