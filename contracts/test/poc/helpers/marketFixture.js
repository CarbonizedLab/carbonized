// Shared setup for the marketplace regression tests (local in-process Hardhat network only).
const { ethers } = require("hardhat");

const E18 = 10n ** 18n;
/** Payment-token decimals every marketplace suite is run with (18 = testnet mock, 6 = production USDC). */
const PAYMENT_DECIMALS = [18, 6];
let serial = 0;

/**
 * Deploys NFT + CCT + payment token + marketplace.
 * `paymentContract` / `paymentDecimals` let a test choose BlacklistERC20 or a 6-decimal mock.
 * The returned `U(n)` converts a human amount (e.g. 10 or "0.5") into payment-token base units.
 */
async function deployMarket({ paymentContract = "MockERC20", paymentDecimals = 18 } = {}) {
  const signers = await ethers.getSigners();
  const [owner, attacker, victim, alice, bob, carol] = signers;

  const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
  await nft.waitForDeployment();
  const token = await (await ethers.getContractFactory("CarbonCreditToken")).deploy(
    "Carbonized Credit - Verra",
    "CCT-VCS",
    await nft.getAddress(),
    "VERRA_VCS"
  );
  await token.waitForDeployment();

  const usdc = await (await ethers.getContractFactory(paymentContract)).deploy("USD Coin", "USDC", paymentDecimals);
  await usdc.waitForDeployment();

  const market = await (await ethers.getContractFactory("CarbonMarketplace")).deploy(
    await usdc.getAddress(),
    await token.getAddress(),
    await nft.getAddress()
  );
  await market.waitForDeployment();

  await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), owner.address);

  const U = (n) => ethers.parseUnits(n.toString(), paymentDecimals);

  return { owner, attacker, victim, alice, bob, carol, signers, nft, token, usdc, market, dec: paymentDecimals, U };
}

/** Mints an NFT carrying `tonnes` tonnes to `to` and wraps it into CCT (18-dec, 1 tonne = 1e18). */
async function giveCCT(ctx, to, tonnes) {
  const { nft, token, owner } = ctx;
  serial += 1;
  await nft.connect(owner).mintCredit(
    to.address,
    `PROJECT_${serial}`,
    "PoC Project",
    `VCS-POC-${serial}`,
    "VERRA_VCS",
    ethers.parseUnits(tonnes.toString(), 18),
    2024,
    "IN",
    ethers.keccak256(ethers.toUtf8Bytes(`proof-${serial}`)),
    "cid",
    "ipfs://uri"
  );
  const id = await nft.totalSupply();
  await nft.connect(to).approve(await token.getAddress(), id);
  await token.connect(to).wrapCredit(id);
}

async function approveAll({ market, token, usdc }, signer) {
  await token.connect(signer).approve(await market.getAddress(), ethers.MaxUint256);
  await usdc.connect(signer).approve(await market.getAddress(), ethers.MaxUint256);
}

module.exports = { deployMarket, giveCCT, approveAll, E18, PAYMENT_DECIMALS };
