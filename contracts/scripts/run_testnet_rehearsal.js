const fs = require("node:fs");
const hre = require("hardhat");

async function main() {
  const deployment = JSON.parse(fs.readFileSync("deployments/robinhood.json", "utf8"));
  const { ethers } = hre;
  const network = await ethers.provider.getNetwork();
  if (hre.network.name !== "robinhood" || network.chainId !== 46630n) {
    throw new Error("testnet rehearsal is restricted to Robinhood testnet (chain 46630)");
  }
  const [deployer] = await ethers.getSigners();
  const c = deployment.contracts;
  const nft = await ethers.getContractAt("CarbonCreditNFT", c.CarbonCreditNFT, deployer);
  const pool = await ethers.getContractAt("CarbonCreditToken", c.CarbonCreditTokens.VERRA_VCS, deployer);
  const market = await ethers.getContractAt("CarbonMarketplace", c.CarbonMarketplace, deployer);
  const nativeIssuer = await nft.NATIVE_ISSUER_ROLE();
  const externalIssuer = await nft.EXTERNAL_ISSUER_ROLE();

  if (!(await nft.hasRole(nativeIssuer, deployer.address))) throw new Error("deployer lacks NATIVE_ISSUER_ROLE");
  if (await nft.hasRole(externalIssuer, deployer.address)) throw new Error("deployer unexpectedly has EXTERNAL_ISSUER_ROLE");

  const pauseTx = await market.pause();
  await pauseTx.wait();
  if (!(await market.paused())) throw new Error("marketplace pause readback failed");
  const unpauseTx = await market.unpause();
  await unpauseTx.wait();
  if (await market.paused()) throw new Error("marketplace unpause readback failed");

  const serial = `REHEARSAL-${Date.now()}`;
  const mintTx = await nft.mintCredit(
    deployer.address,
    "TESTNET-REHEARSAL",
    "Carbonized Testnet Rehearsal",
    serial,
    "VERRA_VCS",
    ethers.parseEther("1"),
    2026,
    "ID",
    ethers.keccak256(ethers.toUtf8Bytes(serial)),
    "",
    "ipfs://testnet-rehearsal"
  );
  await mintTx.wait();
  const tokenId = await nft.totalActiveCredits();

  await (await nft.approve(await pool.getAddress(), tokenId)).wait();
  const wrapTx = await pool.wrapCredit(tokenId);
  await wrapTx.wait();
  if (!(await pool.wrappedNFTs(tokenId))) throw new Error("wrap readback failed");

  const unwrapTx = await pool.unwrapCredit(tokenId);
  await unwrapTx.wait();
  if (await pool.wrappedNFTs(tokenId)) throw new Error("unwrap readback failed");

  const retireTx = await nft.retireCredit(tokenId, "Testnet rehearsal retirement");
  await retireTx.wait();
  const certificate = await nft.retirementCertificates(tokenId);
  if (certificate.retiredBy.toLowerCase() !== deployer.address.toLowerCase()) throw new Error("retirement readback failed");

  console.log(`PAUSE_TX=${pauseTx.hash}`);
  console.log(`UNPAUSE_TX=${unpauseTx.hash}`);
  console.log(`MINT_TX=${mintTx.hash}`);
  console.log(`WRAP_TX=${wrapTx.hash}`);
  console.log(`UNWRAP_TX=${unwrapTx.hash}`);
  console.log(`RETIRE_TX=${retireTx.hash}`);
  console.log(`TOKEN_ID=${tokenId}`);
  console.log("REHEARSAL=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
