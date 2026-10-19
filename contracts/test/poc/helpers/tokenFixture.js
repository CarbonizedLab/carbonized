// Shared setup for the CARB utility suites (CarbToken, CarbStaking, IssuerBond, governance, marketplace discount).
// Local in-process Hardhat network only.
const { ethers } = require("hardhat");
const { deployMarket } = require("./marketFixture");

const E18 = 10n ** 18n;
const DAY = 24 * 60 * 60;

const K = (n) => ethers.parseUnits(n.toString(), 18);

const STAKING_DEFAULTS = {
  warmup: 3 * DAY,
  cooldown: 7 * DAY,
  thresholds: [K(1_000), K(5_000), K(25_000)],
  discountsBps: [0, 1000, 2500, 5000],
};

const BOND_DEFAULTS = {
  minBond: K(10_000),
  unbondDelay: 30 * DAY,
  disputeWindow: 7 * DAY,
  bondRequired: true,
  slashTreasury: ethers.ZeroAddress,
};

/**
 * NFT + CCT + payment token + marketplace (marketFixture) + CARB, staking, issuer bond.
 * The owner is the CARB recipient (treasury), the admin of staking / bond, and holds the NFT's ISSUER_ADMIN_ROLE
 * (the bond contract is granted ISSUER_ADMIN_ROLE too). 200,000 CARB is sent to each of alice, bob, carol,
 * attacker and victim.
 */
async function deployTokenStack({ paymentDecimals = 6, staking: s = {}, bond: b = {} } = {}) {
  const ctx = await deployMarket({ paymentDecimals });
  const { owner, alice, bob, carol, attacker, victim, nft } = ctx;

  const carb = await (await ethers.getContractFactory("CarbToken")).deploy(owner.address);
  await carb.waitForDeployment();

  const sc = { ...STAKING_DEFAULTS, ...s };
  const staking = await (await ethers.getContractFactory("CarbStaking")).deploy(
    await carb.getAddress(),
    owner.address,
    sc.warmup,
    sc.cooldown,
    sc.thresholds,
    sc.discountsBps
  );
  await staking.waitForDeployment();

  const bc = { ...BOND_DEFAULTS, ...b };
  const bond = await (await ethers.getContractFactory("IssuerBond")).deploy(
    await carb.getAddress(),
    owner.address,
    bc.minBond,
    bc.unbondDelay,
    bc.disputeWindow,
    bc.bondRequired,
    bc.slashTreasury
  );
  await bond.waitForDeployment();

  for (const holder of [alice, bob, carol, attacker, victim]) {
    await carb.transfer(holder.address, K(200_000));
  }

  return { ...ctx, carb, staking, bond, K, DAY, sc, bc };
}

module.exports = { deployTokenStack, STAKING_DEFAULTS, BOND_DEFAULTS, K, E18, DAY };
