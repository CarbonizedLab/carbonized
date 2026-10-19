const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployTokenStack, K, DAY } = require("../poc/helpers/tokenFixture");
const {
  deployGovernance,
  governanceRolePlan,
  applyGovernanceSetup,
  handOverToGovernance,
  assertGovernanceBoundaries,
} = require("../../scripts/lib/governance-setup");

const STATE = { Pending: 0n, Active: 1n, Canceled: 2n, Defeated: 3n, Succeeded: 4n, Queued: 5n, Expired: 6n, Executed: 7n };
const GOV = {
  timelockDelay: 2 * DAY,
  votingDelay: 1 * DAY,
  votingPeriod: 5 * DAY,
  proposalThreshold: K(100_000),
  quorumPercent: 4,
};

describe("CarbGovernor + CarbTimelock (parameter governance)", function () {
  let s, owner, alice, bob, attacker, nft, carb, staking, bond, market, U;
  let governor, timelock, plan;

  beforeEach(async function () {
    s = await deployTokenStack({ paymentDecimals: 6 });
    ({ owner, alice, bob, attacker, nft, carb, staking, bond, market, U } = s);
    ({ governor, timelock } = await deployGovernance(ethers, {
      token: carb,
      deployer: owner,
      targets: [market, staking, bond],
      params: GOV,
    }));
    plan = governanceRolePlan({ market, staking, bond, nft });
    await applyGovernanceSetup(plan, await timelock.getAddress(), owner);

    // voting power: owner holds ~999M CARB, alice 200k; both delegate to themselves
    await carb.connect(owner).delegate(owner.address);
    await carb.connect(alice).delegate(alice.address);
    await time.increase(5);
  });

  const call = (contract, fn, args) => contract.interface.encodeFunctionData(fn, args);

  async function propose(proposer, targets, datas, description, values) {
    const addrs = await Promise.all(targets.map((t) => (typeof t === "string" ? t : t.getAddress())));
    const vals = values ?? addrs.map(() => 0n);
    await governor.connect(proposer).propose(addrs, vals, datas, description);
    const id = await governor.hashProposal(addrs, vals, datas, ethers.id(description));
    return { id, addrs, vals, datas, descHash: ethers.id(description) };
  }

  async function passAndExecute(p, voter = owner) {
    await time.increase(GOV.votingDelay + 5);
    await governor.connect(voter).castVote(p.id, 1);
    await time.increase(GOV.votingPeriod + 5);
    expect(await governor.state(p.id)).to.equal(STATE.Succeeded);
    await governor.queue(p.addrs, p.vals, p.datas, p.descHash);
    expect(await governor.state(p.id)).to.equal(STATE.Queued);
    await time.increase(GOV.timelockDelay + 5);
    return governor.execute(p.addrs, p.vals, p.datas, p.descHash);
  }

  describe("wiring and bounds", function () {
    it("uses the token timestamp clock; governor is the timelock's only proposer/canceller; timelock is self-administered", async function () {
      expect(await governor.CLOCK_MODE()).to.equal("mode=timestamp");
      expect(await governor.votingDelay()).to.equal(BigInt(GOV.votingDelay));
      expect(await governor.votingPeriod()).to.equal(BigInt(GOV.votingPeriod));
      expect(await governor.proposalThreshold()).to.equal(GOV.proposalThreshold);
      expect(await governor.quorumNumerator()).to.equal(4n);
      expect(await timelock.getMinDelay()).to.equal(BigInt(GOV.timelockDelay));

      const g = await governor.getAddress();
      expect(await timelock.hasRole(await timelock.PROPOSER_ROLE(), g)).to.equal(true);
      expect(await timelock.hasRole(await timelock.CANCELLER_ROLE(), g)).to.equal(true);
      expect(await timelock.hasRole(await timelock.PROPOSER_ROLE(), owner.address)).to.equal(false);
      expect(await timelock.hasRole(await timelock.TIMELOCK_ADMIN_ROLE(), owner.address)).to.equal(false);
      expect(await timelock.hasRole(await timelock.TIMELOCK_ADMIN_ROLE(), await timelock.getAddress())).to.equal(true);
      expect(await governor.allowedTargets(await market.getAddress())).to.equal(true);
      expect(await governor.allowedTargets(await nft.getAddress())).to.equal(false);
    });

    it("rejects out-of-bounds governor parameters at construction", async function () {
      const F = await ethers.getContractFactory("CarbGovernor");
      const t = await carb.getAddress();
      const tl = await timelock.getAddress();
      const ok = [t, tl, DAY, 5 * DAY, K(1), 4, []];
      const bad = (i, v) => ok.map((x, j) => (j === i ? v : x));
      await expect(F.deploy(...bad(2, 60))).to.be.revertedWith("Voting delay out of bounds");
      await expect(F.deploy(...bad(2, 8 * DAY))).to.be.revertedWith("Voting delay out of bounds");
      await expect(F.deploy(...bad(3, 3600))).to.be.revertedWith("Voting period out of bounds");
      await expect(F.deploy(...bad(3, 15 * DAY))).to.be.revertedWith("Voting period out of bounds");
      await expect(F.deploy(...bad(4, K(60_000_000)))).to.be.revertedWith("Threshold too high");
      await expect(F.deploy(...bad(5, 0))).to.be.revertedWith("Quorum out of bounds");
      await expect(F.deploy(...bad(5, 21))).to.be.revertedWith("Quorum out of bounds");
    });

    it("rejects out-of-bounds timelock delays", async function () {
      const F = await ethers.getContractFactory("CarbTimelock");
      await expect(F.deploy(60, [], [], owner.address)).to.be.revertedWith("Delay out of bounds");
      await expect(F.deploy(31 * DAY, [], [], owner.address)).to.be.revertedWith("Delay out of bounds");
    });

    it("the timelock holds only parameter/slasher roles and never an issuance, pause, KYC, fee or admin role", async function () {
      const verified = await assertGovernanceBoundaries(plan, await timelock.getAddress());
      expect(verified.length).to.be.greaterThan(8);
      const tl = await timelock.getAddress();
      expect(await market.hasRole(await market.PARAMETER_ROLE(), tl)).to.equal(true);
      expect(await staking.hasRole(await staking.PARAMETER_ROLE(), tl)).to.equal(true);
      expect(await bond.hasRole(await bond.PARAMETER_ROLE(), tl)).to.equal(true);
      expect(await bond.hasRole(await bond.SLASHER_ROLE(), tl)).to.equal(true);
      expect(await nft.hasRole(await nft.ISSUER_ADMIN_ROLE(), tl)).to.equal(false);
    });
  });

  describe("proposals", function () {
    it("a passed proposal changes the marketplace minimum price through the timelock", async function () {
      const data = call(market, "setMinPricePerTonne", [U(3)]);
      const p = await propose(alice, [market], [data], "Raise minimum price to 3 / tonne");
      expect(await governor.state(p.id)).to.equal(STATE.Pending);
      await passAndExecute(p);
      expect(await governor.state(p.id)).to.equal(STATE.Executed);
      expect(await market.minPricePerTonne()).to.equal(U(3));
    });

    it("governance can set fee, fee-discount provider and staking thresholds in one proposal", async function () {
      const provider = await staking.getAddress();
      const p = await propose(
        alice,
        [market, market, staking],
        [
          call(market, "setTradingFee", [40]),
          call(market, "setFeeDiscountProvider", [provider]),
          call(staking, "setTierThresholds", [[K(500), K(2_000), K(10_000)]]),
        ],
        "Fee 0.40%, enable staking discount, lower thresholds"
      );
      await passAndExecute(p);
      expect(await market.tradingFeePercent()).to.equal(40n);
      expect(await market.feeDiscountProvider()).to.equal(provider);
      expect(await staking.tierThresholds(0)).to.equal(K(500));
    });

    it("governance can change the bond minimum and slash a bonded issuer (burning CARB) via the timelock", async function () {
      await carb.connect(bob).approve(await bond.getAddress(), ethers.MaxUint256);
      await bond.connect(bob).bond(K(20_000));

      const setMin = await propose(alice, [bond], [call(bond, "setMinBond", [K(15_000)])], "Min bond 15k");
      await passAndExecute(setMin);
      expect(await bond.minBond()).to.equal(K(15_000));

      const slash = await propose(
        alice,
        [bond],
        [call(bond, "proposeSlash", [bob.address, K(8_000), "Serial VCS-X double counted"])],
        "Slash bob 8k"
      );
      await passAndExecute(slash);
      expect(await bond.hasActiveSlash(bob.address)).to.equal(true);

      await time.increase(7 * DAY + 10);
      const supply = await carb.totalSupply();
      await bond.executeSlash(1);
      expect(await carb.totalSupply()).to.equal(supply - K(8_000));
      expect(await nft.hasRole(await nft.NATIVE_ISSUER_ROLE(), bob.address)).to.equal(false); // 12k < 15k minimum
    });

    it("rejects proposals from accounts below the proposal threshold", async function () {
      const data = call(market, "setTradingFee", [10]);
      await expect(propose(attacker, [market], [data], "spam")).to.be.revertedWith(
        "Governor: proposer votes below proposal threshold"
      );
      await carb.connect(bob).delegate(bob.address); // 200k >= threshold, but delegated just now (snapshot is clock-1)
      await time.increase(5);
      await propose(bob, [market], [data], "ok now");
    });

    it("rejects proposals targeting contracts that are not allowlisted (e.g. the NFT) and ETH transfers", async function () {
      const nftData = call(nft, "grantRole", [await nft.NATIVE_ISSUER_ROLE(), attacker.address]);
      await expect(propose(alice, [nft], [nftData], "grant issuer")).to.be.revertedWith("Target not allowed");
      await expect(propose(alice, [attacker.address], ["0x"], "send eth", [1n])).to.be.revertedWith("Target not allowed");
      await expect(
        propose(alice, [market], [call(market, "setTradingFee", [10])], "with value", [1n])
      ).to.be.revertedWith("ETH value not allowed");
    });

    it("even if the NFT were allowlisted by a vote, the timelock has no role to grant issuance (hard wall)", async function () {
      const allow = await propose(
        alice,
        [governor],
        [call(governor, "setTargetAllowed", [await nft.getAddress(), true])],
        "Allowlist NFT"
      );
      await passAndExecute(allow);

      const grant = await propose(
        alice,
        [nft],
        [call(nft, "grantRole", [await nft.NATIVE_ISSUER_ROLE(), attacker.address])],
        "Grant issuer to attacker"
      );
      await time.increase(GOV.votingDelay + 5);
      await governor.connect(owner).castVote(grant.id, 1);
      await time.increase(GOV.votingPeriod + 5);
      await governor.queue(grant.addrs, grant.vals, grant.datas, grant.descHash);
      await time.increase(GOV.timelockDelay + 5);
      await expect(governor.execute(grant.addrs, grant.vals, grant.datas, grant.descHash)).to.be.reverted;
      expect(await nft.hasRole(await nft.NATIVE_ISSUER_ROLE(), attacker.address)).to.equal(false);
    });

    it("proposals fail without quorum / majority and cannot execute before the timelock delay", async function () {
      const data = call(market, "setTradingFee", [10]);
      const p = await propose(alice, [market], [data], "Low turnout");
      await time.increase(GOV.votingDelay + 5);
      await governor.connect(alice).castVote(p.id, 1); // 200k votes << 4% quorum
      await time.increase(GOV.votingPeriod + 5);
      expect(await governor.state(p.id)).to.equal(STATE.Defeated);
      await expect(governor.queue(p.addrs, p.vals, p.datas, p.descHash)).to.be.reverted;

      const q = await propose(alice, [market], [call(market, "setTradingFee", [11])], "Voted down");
      await time.increase(GOV.votingDelay + 5);
      await governor.connect(owner).castVote(q.id, 0); // against
      await time.increase(GOV.votingPeriod + 5);
      expect(await governor.state(q.id)).to.equal(STATE.Defeated);

      const r = await propose(alice, [market], [call(market, "setTradingFee", [12])], "Too early");
      await time.increase(GOV.votingDelay + 5);
      await governor.connect(owner).castVote(r.id, 1);
      await time.increase(GOV.votingPeriod + 5);
      await governor.queue(r.addrs, r.vals, r.datas, r.descHash);
      await expect(governor.execute(r.addrs, r.vals, r.datas, r.descHash)).to.be.reverted;
      expect(await market.tradingFeePercent()).to.equal(25n);
    });

    it("hard-bounded parameters stay bounded under governance: fee cap, voting period and timelock delay", async function () {
      const tooHighFee = await propose(alice, [market], [call(market, "setTradingFee", [500])], "5% fee");
      await time.increase(GOV.votingDelay + 5);
      await governor.connect(owner).castVote(tooHighFee.id, 1);
      await time.increase(GOV.votingPeriod + 5);
      await governor.queue(tooHighFee.addrs, tooHighFee.vals, tooHighFee.datas, tooHighFee.descHash);
      await time.increase(GOV.timelockDelay + 5);
      await expect(governor.execute(tooHighFee.addrs, tooHighFee.vals, tooHighFee.datas, tooHighFee.descHash)).to.be.reverted;
      expect(await market.tradingFeePercent()).to.equal(25n);

      const shortDelay = await propose(alice, [timelock], [call(timelock, "updateDelay", [3600])], "1h delay");
      await time.increase(GOV.votingDelay + 5);
      await governor.connect(owner).castVote(shortDelay.id, 1);
      await time.increase(GOV.votingPeriod + 5);
      await governor.queue(shortDelay.addrs, shortDelay.vals, shortDelay.datas, shortDelay.descHash);
      await time.increase(GOV.timelockDelay + 5);
      await expect(governor.execute(shortDelay.addrs, shortDelay.vals, shortDelay.datas, shortDelay.descHash)).to.be.reverted;
      expect(await timelock.getMinDelay()).to.equal(BigInt(GOV.timelockDelay));

      const okDelay = await propose(alice, [timelock], [call(timelock, "updateDelay", [3 * DAY])], "3d delay");
      await passAndExecute(okDelay);
      expect(await timelock.getMinDelay()).to.equal(BigInt(3 * DAY));
    });

    it("governor settings can only change through governance and stay in bounds", async function () {
      await expect(governor.setVotingPeriod(DAY)).to.be.reverted; // onlyGovernance
      const p = await propose(alice, [governor], [call(governor, "setVotingPeriod", [7 * DAY])], "7d voting");
      await passAndExecute(p);
      expect(await governor.votingPeriod()).to.equal(BigInt(7 * DAY));
    });
  });

  describe("staged decentralisation helpers", function () {
    it("handOverToGovernance: the multisig drops its PARAMETER/SLASHER copies but keeps guardian admin", async function () {
      await handOverToGovernance(plan, owner);
      await market.setTradingFee(30); // owner still DEFAULT_ADMIN on the marketplace (guardian)
      expect(await market.tradingFeePercent()).to.equal(30n);
      await expect(staking.setTierDiscounts([0, 1, 2, 3])).to.be.reverted;
      await expect(bond.setMinBond(K(20_000))).to.be.reverted;
      await expect(bond.proposeSlash(alice.address, 1, "x")).to.be.reverted;
      expect(await staking.hasRole(ethers.ZeroHash, owner.address)).to.equal(true);

      // guardian path: admin can re-grant itself the parameter role if governance misbehaves
      await staking.grantRole(await staking.PARAMETER_ROLE(), owner.address);
      await staking.setTierDiscounts([0, 1, 2, 3]);
    });

    it("assertGovernanceBoundaries fails loudly if a forbidden role is ever granted to the timelock", async function () {
      await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), await timelock.getAddress());
      let error;
      try {
        await assertGovernanceBoundaries(plan, await timelock.getAddress());
      } catch (e) {
        error = e;
      }
      expect(error, "should throw").to.not.equal(undefined);
      expect(error.message).to.match(/CarbonCreditNFT\.NATIVE_ISSUER_ROLE/);
    });
  });
});
