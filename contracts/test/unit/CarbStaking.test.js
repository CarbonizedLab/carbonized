const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployTokenStack, K, DAY } = require("../poc/helpers/tokenFixture");

describe("CarbStaking (tiers, warm-up, cooldown)", function () {
  let s, owner, alice, bob, attacker, carb, staking;
  const WARMUP = 3 * DAY;
  const COOLDOWN = 7 * DAY;

  beforeEach(async function () {
    s = await deployTokenStack();
    ({ owner, alice, bob, attacker, carb, staking } = s);
    for (const u of [alice, bob, attacker]) {
      await carb.connect(u).approve(await staking.getAddress(), ethers.MaxUint256);
    }
  });

  /** Stakes and returns the timestamp of the stake transaction. */
  async function stakeAt(signer, amount) {
    const tx = await staking.connect(signer).stake(amount);
    return (await ethers.provider.getBlock((await tx.wait()).blockNumber)).timestamp;
  }

  describe("construction", function () {
    it("stores parameters and grants admin + PARAMETER_ROLE to the admin", async function () {
      expect(await staking.WARMUP()).to.equal(BigInt(WARMUP));
      expect(await staking.COOLDOWN()).to.equal(BigInt(COOLDOWN));
      expect(await staking.tierThresholds(2)).to.equal(K(25_000));
      expect(await staking.tierDiscountBps(3)).to.equal(5000n);
      expect(await staking.hasRole(await staking.PARAMETER_ROLE(), owner.address)).to.equal(true);
      expect(await staking.hasRole(ethers.ZeroHash, owner.address)).to.equal(true);
    });

    it("enforces bounds on warm-up, cooldown, thresholds and discounts", async function () {
      const F = await ethers.getContractFactory("CarbStaking");
      const k = await carb.getAddress();
      const th = [K(1), K(2), K(3)];
      const di = [0, 100, 200, 300];
      await expect(F.deploy(ethers.ZeroAddress, owner.address, WARMUP, COOLDOWN, th, di)).to.be.revertedWith("Invalid token");
      await expect(F.deploy(k, ethers.ZeroAddress, WARMUP, COOLDOWN, th, di)).to.be.revertedWith("Invalid admin");
      await expect(F.deploy(k, owner.address, 60, COOLDOWN, th, di)).to.be.revertedWith("Warmup out of bounds");
      await expect(F.deploy(k, owner.address, 15 * DAY, COOLDOWN, th, di)).to.be.revertedWith("Warmup out of bounds");
      await expect(F.deploy(k, owner.address, WARMUP, 3600, th, di)).to.be.revertedWith("Cooldown out of bounds");
      await expect(F.deploy(k, owner.address, WARMUP, 31 * DAY, th, di)).to.be.revertedWith("Cooldown out of bounds");
      await expect(F.deploy(k, owner.address, WARMUP, COOLDOWN, [1n, K(2), K(3)], di)).to.be.revertedWith("Threshold too low");
      await expect(F.deploy(k, owner.address, WARMUP, COOLDOWN, [K(2), K(2), K(3)], di)).to.be.revertedWith("Thresholds not increasing");
      await expect(F.deploy(k, owner.address, WARMUP, COOLDOWN, [K(1), K(2), K(50_000_001)], di)).to.be.revertedWith("Threshold too high");
      await expect(F.deploy(k, owner.address, WARMUP, COOLDOWN, th, [1, 100, 200, 300])).to.be.revertedWith("Tier 0 has no discount");
      await expect(F.deploy(k, owner.address, WARMUP, COOLDOWN, th, [0, 300, 200, 400])).to.be.revertedWith("Discounts decreasing");
      await expect(F.deploy(k, owner.address, WARMUP, COOLDOWN, th, [0, 100, 200, 5001])).to.be.revertedWith("Discount too high");
    });
  });

  describe("tiers and warm-up", function () {
    it("a fresh stake counts for nothing until the warm-up has elapsed, then maps to the right tier", async function () {
      const t0 = await stakeAt(alice, K(5_000));
      expect(await staking.tierOf(alice.address)).to.equal(0n);
      expect(await staking.effectiveStake(alice.address)).to.equal(0n);

      await time.increaseTo(t0 + WARMUP - 20);
      expect(await staking.tierOf(alice.address)).to.equal(0n);

      await time.increaseTo(t0 + WARMUP + 5);
      expect(await staking.tierOf(alice.address)).to.equal(2n);
      expect(await staking.discountBps(alice.address)).to.equal(2500n);
    });

    it("maps every threshold boundary", async function () {
      const cases = [
        [K(999), 0n, 0n],
        [K(1_000), 1n, 1000n],
        [K(4_999), 1n, 1000n],
        [K(5_000), 2n, 2500n],
        [K(24_999), 2n, 2500n],
        [K(25_000), 3n, 5000n],
        [K(150_000), 3n, 5000n],
      ];
      for (const [amount, tier, disc] of cases) {
        const fresh = await deployTokenStack();
        const u = fresh.alice;
        await fresh.carb.connect(u).approve(await fresh.staking.getAddress(), ethers.MaxUint256);
        await fresh.staking.connect(u).stake(amount);
        await time.increase(WARMUP + 5);
        expect(await fresh.staking.tierOf(u.address), String(amount)).to.equal(tier);
        expect(await fresh.staking.discountBps(u.address)).to.equal(disc);
      }
    });

    it("an account that never staked is tier 0 / zero discount", async function () {
      expect(await staking.tierOf(bob.address)).to.equal(0n);
      expect(await staking.discountBps(bob.address)).to.equal(0n);
    });

    it("a top-up restarts only the PENDING bucket: matured stake keeps its tier, new stake waits", async function () {
      const t0 = await stakeAt(alice, K(1_000));
      await time.increaseTo(t0 + WARMUP + 5);
      expect(await staking.tierOf(alice.address)).to.equal(1n);

      const t1 = await stakeAt(alice, K(30_000)); // would be tier 3 once warm
      expect(await staking.tierOf(alice.address)).to.equal(1n); // no uplift yet

      await time.increaseTo(t1 + WARMUP - 20);
      expect(await staking.tierOf(alice.address)).to.equal(1n);
      await time.increaseTo(t1 + WARMUP + 5);
      expect(await staking.tierOf(alice.address)).to.equal(3n);
    });

    it("positionOf / balanceOf / totalStaked report consistent numbers", async function () {
      await stakeAt(alice, K(2_000));
      await stakeAt(bob, K(500));
      expect(await staking.totalStaked()).to.equal(K(2_500));
      const pos = await staking.positionOf(alice.address);
      expect(pos.matured).to.equal(0n);
      expect(pos.pending).to.equal(K(2_000));
      expect(await staking.balanceOf(alice.address)).to.equal(K(2_000));
      expect(await carb.balanceOf(await staking.getAddress())).to.equal(K(2_500));
    });
  });

  describe("flash-stake resistance", function () {
    let flash;
    beforeEach(async function () {
      flash = await (await ethers.getContractFactory("FlashStaker")).deploy();
      await carb.connect(attacker).approve(await flash.getAddress(), ethers.MaxUint256);
    });

    it("stake + tier read inside ONE transaction yields no uplift (tier and discount stay 0)", async function () {
      const res = await flash.connect(attacker).attack.staticCall(
        await carb.getAddress(),
        await staking.getAddress(),
        K(150_000)
      );
      expect(res.tierBefore).to.equal(0n);
      expect(res.tierAfter).to.equal(0n);
      expect(res.discountAfter).to.equal(0n);
    });

    it("borrowed capital cannot be a tier next block either, and unstaking locks it for the cooldown", async function () {
      await flash.connect(attacker).stakeOnly(await carb.getAddress(), await staking.getAddress(), K(150_000));
      expect(await staking.tierOf(await flash.getAddress())).to.equal(0n);
      await time.increase(60); // far below the warm-up
      expect(await staking.tierOf(await flash.getAddress())).to.equal(0n);

      // "Repaying" the flash loan means unstaking: tokens are stuck for COOLDOWN, so the loan cannot be repaid in-tx
      await flash.unstake(await staking.getAddress(), K(150_000));
      const pos = await staking.positionOf(await flash.getAddress());
      expect(pos.cooling).to.equal(K(150_000));
    });
  });

  describe("unstake / cooldown / withdraw", function () {
    it("unstake removes the tier immediately and withdraw is gated by the cooldown", async function () {
      const t0 = await stakeAt(alice, K(5_000));
      await time.increaseTo(t0 + WARMUP + 5);
      expect(await staking.tierOf(alice.address)).to.equal(2n);

      await staking.connect(alice).unstake(K(5_000));
      expect(await staking.tierOf(alice.address)).to.equal(0n);
      expect(await staking.totalStaked()).to.equal(0n);
      await expect(staking.connect(alice).withdraw()).to.be.revertedWith("Cooldown active");

      const unlockAt = (await staking.positionOf(alice.address)).unlockAt;
      await time.increaseTo(unlockAt - 10n);
      await expect(staking.connect(alice).withdraw()).to.be.revertedWith("Cooldown active");

      const before = await carb.balanceOf(alice.address);
      await time.increaseTo(unlockAt + 1n);
      await expect(staking.connect(alice).withdraw()).to.emit(staking, "Withdrawn").withArgs(alice.address, K(5_000));
      expect((await carb.balanceOf(alice.address)) - before).to.equal(K(5_000));
    });

    it("cannot unstake more than staked, and a second unstake of the same tokens fails", async function () {
      await stakeAt(alice, K(2_000));
      await expect(staking.connect(alice).unstake(K(2_001))).to.be.revertedWith("Insufficient stake");
      await expect(staking.connect(alice).unstake(0)).to.be.revertedWith("Invalid amount");
      await staking.connect(alice).unstake(K(2_000));
      await expect(staking.connect(alice).unstake(1n)).to.be.revertedWith("Insufficient stake");
    });

    it("cannot withdraw twice, or withdraw with nothing unstaked", async function () {
      await expect(staking.connect(bob).withdraw()).to.be.revertedWith("Nothing to withdraw");
      await stakeAt(alice, K(1_000));
      await expect(staking.connect(alice).withdraw()).to.be.revertedWith("Nothing to withdraw"); // staked, not unstaked
      await staking.connect(alice).unstake(K(1_000));
      await time.increase(COOLDOWN + 5);
      await staking.connect(alice).withdraw();
      await expect(staking.connect(alice).withdraw()).to.be.revertedWith("Nothing to withdraw");
    });

    it("unstake consumes the youngest (pending) stake first so matured stake keeps its tier", async function () {
      const t0 = await stakeAt(alice, K(1_000));
      await time.increaseTo(t0 + WARMUP + 5);
      await stakeAt(alice, K(4_000)); // pending
      await staking.connect(alice).unstake(K(4_000));
      const pos = await staking.positionOf(alice.address);
      expect(pos.pending).to.equal(0n);
      expect(pos.matured).to.equal(K(1_000));
      expect(await staking.tierOf(alice.address)).to.equal(1n);
    });

    it("a second unstake restarts the cooldown for the whole cooling amount", async function () {
      const t0 = await stakeAt(alice, K(3_000));
      await time.increaseTo(t0 + WARMUP + 5);
      await staking.connect(alice).unstake(K(1_000));
      const first = (await staking.positionOf(alice.address)).unlockAt;
      await time.increase(3 * DAY);
      await staking.connect(alice).unstake(K(1_000));
      const second = (await staking.positionOf(alice.address)).unlockAt;
      expect(second).to.be.gt(first + BigInt(2 * DAY));
      await time.increaseTo(first + 10n);
      await expect(staking.connect(alice).withdraw()).to.be.revertedWith("Cooldown active");
      await time.increaseTo(second + 1n);
      await expect(staking.connect(alice).withdraw()).to.emit(staking, "Withdrawn").withArgs(alice.address, K(2_000));
    });

    it("keeps token accounting exact: contract balance == staked + cooling", async function () {
      await stakeAt(alice, K(3_000));
      await stakeAt(bob, K(2_000));
      await staking.connect(alice).unstake(K(1_000));
      const cooling = (await staking.positionOf(alice.address)).cooling;
      expect(await carb.balanceOf(await staking.getAddress())).to.equal((await staking.totalStaked()) + cooling);
    });

    it("rejects zero and oversized stakes", async function () {
      await expect(staking.connect(alice).stake(0)).to.be.revertedWith("Invalid amount");
      await expect(staking.connect(alice).stake(2n ** 128n)).to.be.revertedWith("Amount too large");
    });
  });

  describe("parameters (PARAMETER_ROLE)", function () {
    it("only PARAMETER_ROLE can set thresholds / discounts; bounds hold", async function () {
      await expect(staking.connect(attacker).setTierThresholds([K(1), K(2), K(3)])).to.be.reverted;
      await expect(staking.connect(attacker).setTierDiscounts([0, 1, 2, 3])).to.be.reverted;

      await expect(staking.setTierThresholds([K(100), K(200), K(300)]))
        .to.emit(staking, "TierThresholdsUpdated");
      expect(await staking.tierThresholds(0)).to.equal(K(100));
      await expect(staking.setTierThresholds([K(300), K(200), K(100)])).to.be.revertedWith("Thresholds not increasing");
      await expect(staking.setTierThresholds([K(1), K(2), K(60_000_000)])).to.be.revertedWith("Threshold too high");
      await expect(staking.setTierDiscounts([0, 6000, 6000, 6000])).to.be.revertedWith("Discount too high");
      await staking.setTierDiscounts([0, 500, 1000, 2000]);
      expect(await staking.tierDiscountBps(3)).to.equal(2000n);
    });

    it("threshold changes re-tier existing stakers immediately", async function () {
      const t0 = await stakeAt(alice, K(5_000));
      await time.increaseTo(t0 + WARMUP + 5);
      expect(await staking.tierOf(alice.address)).to.equal(2n);
      await staking.setTierThresholds([K(1_000), K(6_000), K(7_000)]);
      expect(await staking.tierOf(alice.address)).to.equal(1n);
    });

    it("admin can hand PARAMETER_ROLE to a timelock and drop its own", async function () {
      await staking.grantRole(await staking.PARAMETER_ROLE(), bob.address);
      await staking.renounceRole(await staking.PARAMETER_ROLE(), owner.address);
      await expect(staking.setTierDiscounts([0, 0, 0, 0])).to.be.reverted;
      await staking.connect(bob).setTierDiscounts([0, 0, 0, 0]);
      expect(await staking.discountBps(alice.address)).to.equal(0n);
    });

    it("no function exists that lets an admin move staked tokens", async function () {
      for (const name of ["sweep", "rescue", "recoverERC20", "withdrawFor", "slash", "emergencyWithdraw"]) {
        expect(staking.interface.hasFunction(name), name).to.equal(false);
      }
    });
  });
});
