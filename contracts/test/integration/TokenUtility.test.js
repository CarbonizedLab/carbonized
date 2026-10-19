const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployTokenStack, K, DAY } = require("../poc/helpers/tokenFixture");
const { giveCCT, approveAll } = require("../poc/helpers/marketFixture");
const {
  deployGovernance,
  governanceRolePlan,
  applyGovernanceSetup,
  handOverToGovernance,
  assertGovernanceBoundaries,
} = require("../../scripts/lib/governance-setup");

/**
 * End-to-end: CARB -> staking tier -> marketplace fee discount; issuer bond -> slashable accountability;
 * governor -> timelock -> marketplace parameter. 6-decimal USDC (the production payment token).
 */
describe("CARB utility: full flow", function () {
  const WARMUP = 3 * DAY;
  const GOV = { timelockDelay: 2 * DAY, votingDelay: DAY, votingPeriod: 5 * DAY, proposalThreshold: K(100_000), quorumPercent: 4 };

  it("stake -> tier discount on a fill; bond stays non-authoritative; slash burns; governance changes min price", async function () {
    const s = await deployTokenStack({ paymentDecimals: 6 });
    const { owner, alice, bob, carol, victim, nft, carb, staking, bond, market, usdc, U } = s;

    // ---- governance stack: timelock holds PARAMETER_ROLE/SLASHER_ROLE only ----
    const { governor, timelock } = await deployGovernance(ethers, {
      token: carb,
      deployer: owner,
      targets: [market, staking, bond],
      params: GOV,
    });
    const plan = governanceRolePlan({ market, staking, bond, nft });
    await applyGovernanceSetup(plan, await timelock.getAddress(), owner);
    await assertGovernanceBoundaries(plan, await timelock.getAddress());

    // ---- staking tier drives the marketplace fee ----
    await market.setFeeDiscountProvider(await staking.getAddress());
    await carb.connect(alice).approve(await staking.getAddress(), ethers.MaxUint256);
    await staking.connect(alice).stake(K(30_000)); // tier 3 = 50% off the fee after the warm-up
    expect(await staking.tierOf(alice.address)).to.equal(0n); // warming up: flash-stake safe
    await time.increase(WARMUP + 10);
    expect(await staking.tierOf(alice.address)).to.equal(3n);
    expect(await market.feeDiscountBpsOf(alice.address)).to.equal(5000n);

    for (const u of [alice, bob, carol]) {
      await giveCCT(s, u, 200);
      await usdc.mint(u.address, U(100_000));
      await approveAll(s, u);
    }
    const tonnes = ethers.parseUnits("100", 18);
    const cost = U(1_000); // 100 t @ 10
    const baseFee = (cost * 25n) / 10_000n;

    await market.connect(alice).createSellOrder(tonnes, U(10), 0, false); // staker sells
    await market.connect(carol).createSellOrder(tonnes, U(10), 0, false); // non-staker sells
    await market.connect(bob).fillOrder(1, tonnes);
    expect(await market.accruedFees()).to.equal(baseFee / 2n);
    await market.connect(bob).fillOrder(2, tonnes);
    expect(await market.accruedFees()).to.equal(baseFee / 2n + baseFee);

    // unstaking drops the discount immediately
    await staking.connect(alice).unstake(K(30_000));
    expect(await market.feeDiscountBpsOf(alice.address)).to.equal(0n);

    // ---- issuer bond: bonding never grants a native issuance role ----
    const NATIVE_ISSUER_ROLE = await nft.NATIVE_ISSUER_ROLE();
    await carb.connect(bob).approve(await bond.getAddress(), ethers.MaxUint256);
    await carb.connect(victim).approve(await bond.getAddress(), ethers.MaxUint256);
    await bond.connect(bob).bond(K(10_000));
    await bond.connect(victim).bond(K(40_000));
    expect(await nft.hasRole(NATIVE_ISSUER_ROLE, bob.address)).to.equal(false);
    await bond.connect(bob).startUnbond();
    expect(await nft.hasRole(NATIVE_ISSUER_ROLE, bob.address)).to.equal(false);
    await time.increase(30 * DAY + 10);
    await bond.connect(bob).withdraw();
    expect(await carb.balanceOf(await bond.getAddress())).to.equal(K(40_000));

    // ---- slash: proposed by SLASHER_ROLE, executable after the dispute window, burns CARB ----
    await bond.proposeSlash(victim.address, K(15_000), "Minted credits without registry retirement");
    await expect(bond.connect(victim).startUnbond()).to.be.revertedWith("Slash pending");
    await time.increase(7 * DAY + 10);
    const supply = await carb.totalSupply();
    await bond.connect(carol).executeSlash(1);
    expect(await carb.totalSupply()).to.equal(supply - K(15_000));
    expect((await bond.bonds(victim.address)).amount).to.equal(K(25_000));
    expect(await nft.hasRole(NATIVE_ISSUER_ROLE, victim.address)).to.equal(false);

    // ---- governance: proposal -> vote -> queue -> timelock -> marketplace min price ----
    await carb.connect(owner).delegate(owner.address);
    await carb.connect(alice).delegate(alice.address);
    await time.increase(5);

    const newMin = U(5);
    const data = market.interface.encodeFunctionData("setMinPricePerTonne", [newMin]);
    const targets = [await market.getAddress()];
    const description = "Set the marketplace minimum price to 5 USDC / tonne";
    await governor.connect(alice).propose(targets, [0n], [data], description);
    const descHash = ethers.id(description);
    const id = await governor.hashProposal(targets, [0n], [data], descHash);

    await time.increase(DAY + 5);
    await governor.connect(owner).castVote(id, 1);
    await time.increase(5 * DAY + 5);
    await governor.queue(targets, [0n], [data], descHash);
    await time.increase(2 * DAY + 5);
    await governor.execute(targets, [0n], [data], descHash);

    expect(await market.minPricePerTonne()).to.equal(newMin);
    await expect(market.connect(carol).createSellOrder(tonnes, U(4), 0, false)).to.be.revertedWith("Price below minimum");
    await market.connect(carol).createSellOrder(tonnes, U(5), 0, false);

    // the multisig can now step back from parameter control but keeps the guardian role
    await handOverToGovernance(plan, owner);
    expect(await market.hasRole(await market.PARAMETER_ROLE(), owner.address)).to.equal(false);
    expect(await market.hasRole(ethers.ZeroHash, owner.address)).to.equal(true);
    await assertGovernanceBoundaries(plan, await timelock.getAddress());
  });
});
