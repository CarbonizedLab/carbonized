const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTokenStack, K } = require("../poc/helpers/tokenFixture");

const proof = ethers.keccak256(ethers.toUtf8Bytes("attestation"));

const mintNative = (nft, signer) =>
  nft.connect(signer).mintCredit(
    signer.address,
    "PROJECT-1",
    "Project One",
    "VCS-UNATTESTED-1",
    "VERRA_VCS",
    1n,
    2024,
    "ID",
    proof,
    "",
    "ipfs://credit"
  );

describe("CarbonCreditNFT issuance lanes", function () {
  it("does not let an ISSUER_ROLE holder use the native mint path", async function () {
    const [, genericIssuer] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.ISSUER_ROLE(), genericIssuer.address);

    await expect(mintNative(nft, genericIssuer)).to.be.reverted;
    expect(await nft.totalSupply()).to.equal(0n);
  });

  it("bonding never grants ISSUER_ROLE", async function () {
    const { alice, bond, carb, nft } = await deployTokenStack();
    await carb.connect(alice).approve(await bond.getAddress(), K(10_000));

    await bond.connect(alice).bond(K(10_000));

    expect(await nft.hasRole(await nft.ISSUER_ROLE(), alice.address)).to.equal(false);
  });

  it("keeps the external issuer out of the native mint lanes", async function () {
    const [, , externalIssuer] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.EXTERNAL_ISSUER_ROLE(), externalIssuer.address);

    await expect(mintNative(nft, externalIssuer)).to.be.reverted;
    await expect(
      nft.connect(externalIssuer).batchMint(externalIssuer.address, "PROJECT-1", [{
        projectName: "Project One",
        serialNumber: "NATIVE-BATCH-1",
        methodology: "VERRA_VCS",
        co2Tonnes: 1n,
        vintageYear: 2024n,
        geography: "ID",
        oracleProofHash: proof,
        satelliteDataCID: "",
        tokenURI: "ipfs://credit",
      }])
    ).to.be.reverted;
    expect(await nft.totalSupply()).to.equal(0n);
  });

  it("keeps the native issuer out of the external mint lane", async function () {
    const [, nativeIssuer] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), nativeIssuer.address);

    await expect(
      nft.connect(nativeIssuer).mintExternalCredit(
        nativeIssuer.address,
        "PROJECT-1",
        "Project One",
        "VERRA",
        "RETIRED-1",
        "VERRA_VCS",
        1n,
        2024n,
        "ID",
        proof,
        "",
        "ipfs://credit"
      )
    ).to.be.reverted;
    expect(await nft.totalSupply()).to.equal(0n);
  });
});
