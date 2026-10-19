const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CarbonCreditNFT ISSUER_ADMIN_ROLE (issuer role administration)", function () {
  let owner, issuer, mallory, other, nft, ISSUER_ROLE, ISSUER_ADMIN_ROLE, DEFAULT_ADMIN_ROLE;

  beforeEach(async function () {
    [owner, issuer, mallory, other] = await ethers.getSigners();
    nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.waitForDeployment();
    ISSUER_ROLE = await nft.ISSUER_ROLE();
    ISSUER_ADMIN_ROLE = await nft.ISSUER_ADMIN_ROLE();
    DEFAULT_ADMIN_ROLE = await nft.DEFAULT_ADMIN_ROLE();
  });

  it("deployer gets ISSUER_ADMIN_ROLE and ISSUER_ROLE is administered by it", async function () {
    expect(ISSUER_ADMIN_ROLE).to.equal(ethers.id("ISSUER_ADMIN_ROLE"));
    expect(await nft.hasRole(ISSUER_ADMIN_ROLE, owner.address)).to.equal(true);
    expect(await nft.getRoleAdmin(ISSUER_ROLE)).to.equal(ISSUER_ADMIN_ROLE);
    expect(await nft.getRoleAdmin(ISSUER_ADMIN_ROLE)).to.equal(DEFAULT_ADMIN_ROLE);
  });

  it("existing flow is unchanged: the multisig (ISSUER_ADMIN holder) grants / revokes trusted issuers", async function () {
    await nft.grantRole(ISSUER_ROLE, issuer.address);
    expect(await nft.hasRole(ISSUER_ROLE, issuer.address)).to.equal(true);
    await nft.revokeRole(ISSUER_ROLE, issuer.address);
    expect(await nft.hasRole(ISSUER_ROLE, issuer.address)).to.equal(false);
  });

  it("an account with only DEFAULT_ADMIN_ROLE cannot grant ISSUER_ROLE, but can re-point ISSUER_ADMIN_ROLE", async function () {
    await nft.grantRole(DEFAULT_ADMIN_ROLE, other.address);
    await nft.renounceRole(ISSUER_ADMIN_ROLE, owner.address);
    await expect(nft.grantRole(ISSUER_ROLE, issuer.address)).to.be.reverted;
    await expect(nft.connect(other).grantRole(ISSUER_ROLE, issuer.address)).to.be.reverted;

    await nft.connect(other).grantRole(ISSUER_ADMIN_ROLE, other.address);
    await nft.connect(other).grantRole(ISSUER_ROLE, issuer.address);
    expect(await nft.hasRole(ISSUER_ROLE, issuer.address)).to.equal(true);
  });

  it("outsiders cannot grant ISSUER_ROLE or ISSUER_ADMIN_ROLE", async function () {
    await expect(nft.connect(mallory).grantRole(ISSUER_ROLE, mallory.address)).to.be.reverted;
    await expect(nft.connect(mallory).grantRole(ISSUER_ADMIN_ROLE, mallory.address)).to.be.reverted;
  });

  it("an ISSUER_ADMIN holder cannot grant other roles (PAUSER / ORACLE / DEFAULT_ADMIN)", async function () {
    await nft.grantRole(ISSUER_ADMIN_ROLE, other.address);
    await expect(nft.connect(other).grantRole(await nft.PAUSER_ROLE(), other.address)).to.be.reverted;
    await expect(nft.connect(other).grantRole(await nft.ORACLE_ROLE(), other.address)).to.be.reverted;
    await expect(nft.connect(other).grantRole(DEFAULT_ADMIN_ROLE, other.address)).to.be.reverted;
  });
});
