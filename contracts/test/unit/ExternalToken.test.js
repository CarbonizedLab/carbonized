const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployMarket } = require("../poc/helpers/marketFixture");
const { deployGovernance, governanceRolePlan, applyGovernanceSetup } = require("../../scripts/lib/governance-setup");

// An external (launchpad) token: 9 decimals, NO burn, NO votes, NO permit. Everything the protocol does with CARB
// must work with it, and anything that would make the protocol's accounting wrong (a transfer tax) must revert.
const DAY = 24 * 60 * 60;
const DEAD = "0x000000000000000000000000000000000000dEaD";
const TAX_ERROR = "Received amount differs (fee-on-transfer unsupported)";
const K9 = (n) => ethers.parseUnits(n.toString(), 9);
const STATE = { Pending: 0n, Active: 1n, Canceled: 2n, Defeated: 3n, Succeeded: 4n, Queued: 5n, Expired: 6n, Executed: 7n };

const STAKING = {
  warmup: 3 * DAY,
  cooldown: 7 * DAY,
  thresholds: [K9(1_000), K9(5_000), K9(25_000)],
  discountsBps: [0, 1000, 2500, 5000],
};
const BOND = { minBond: K9(10_000), unbondDelay: 30 * DAY, disputeWindow: 7 * DAY };
const GOV = { timelockDelay: 2 * DAY, votingDelay: DAY, votingPeriod: 5 * DAY, proposalThreshold: K9(100_000), quorumPercent: 4 };

async function deployToken(contract = "PlainERC20", decimals = 9, ...extra) {
  const t = await (await ethers.getContractFactory(contract)).deploy("Launchpad CARB", "CARB", decimals, ...extra);
  await t.waitForDeployment();
  return t;
}

async function deployStaking(token, admin, thresholds = STAKING.thresholds) {
  return (await ethers.getContractFactory("CarbStaking")).deploy(
    await token.getAddress(),
    admin.address,
    STAKING.warmup,
    STAKING.cooldown,
    thresholds,
    STAKING.discountsBps
  );
}

async function deployBond(token, nft, admin, { minBond = BOND.minBond, treasury = ethers.ZeroAddress } = {}) {
  const bond = await (await ethers.getContractFactory("IssuerBond")).deploy(
    await token.getAddress(),
    admin.address,
    minBond,
    BOND.unbondDelay,
    BOND.disputeWindow,
    true,
    treasury
  );
  return bond;
}

describe("External (launchpad) CARB token: 9 decimals, no burn, no votes", function () {
  let ctx, owner, alice, bob, carol, nft, market, carb;

  beforeEach(async function () {
    ctx = await deployMarket({ paymentDecimals: 6 });
    ({ owner, alice, bob, carol, nft, market } = ctx);
    carb = await deployToken();
    for (const u of [alice, bob, carol]) await carb.mint(u.address, K9(1_000_000));
    await carb.mint(owner.address, K9(900_000_000));
  });

  describe("PlainERC20 fixture sanity", function () {
    it("really has 9 decimals, no burn and no votes", async function () {
      expect(await carb.decimals()).to.equal(9n);
      expect(carb.interface.getFunction("burn")).to.equal(null);
      expect(carb.interface.getFunction("getVotes")).to.equal(null);
    });
  });

  describe("CarbStaking", function () {
    let staking;
    beforeEach(async function () {
      staking = await deployStaking(carb, owner);
      for (const u of [alice, bob, carol]) await carb.connect(u).approve(await staking.getAddress(), ethers.MaxUint256);
    });

    it("reads the token decimals and scales its bounds", async function () {
      expect(await staking.tokenDecimals()).to.equal(9n);
      expect(await staking.MIN_THRESHOLD()).to.equal(K9(1));
      expect(await staking.MAX_THRESHOLD()).to.equal(K9(50_000_000));
    });

    it("enforces the threshold bounds in the token's own base units", async function () {
      const F = await ethers.getContractFactory("CarbStaking");
      const t = await carb.getAddress();
      const mk = (th) => F.deploy(t, owner.address, STAKING.warmup, STAKING.cooldown, th, STAKING.discountsBps);
      await expect(mk([K9(1) - 1n, K9(5), K9(10)])).to.be.revertedWith("Threshold too low");
      await expect(mk([K9(1), K9(5), K9(50_000_001)])).to.be.revertedWith("Threshold too high");
      // an 18-decimal style amount (1e18 base units = 1e9 whole tokens) is far above the 9-decimals bound
      await expect(mk([K9(1), K9(5), 10n ** 18n])).to.be.revertedWith("Threshold too high");
      await mk([K9(1), K9(5), K9(50_000_000)]);
      await expect(staking.setTierThresholds([K9(1) - 1n, K9(5), K9(10)])).to.be.revertedWith("Threshold too low");
      await expect(staking.setTierThresholds([K9(1), K9(5), K9(50_000_001)])).to.be.revertedWith("Threshold too high");
    });

    it("tiers follow the 9-decimals thresholds after the warm-up (no burn needed)", async function () {
      await staking.connect(alice).stake(K9(999));
      await time.increase(STAKING.warmup + 1);
      expect(await staking.tierOf(alice.address)).to.equal(0n);

      await staking.connect(alice).stake(K9(1));
      await staking.connect(bob).stake(K9(5_000));
      await staking.connect(carol).stake(K9(30_000));
      expect(await staking.tierOf(alice.address)).to.equal(0n); // warm-up of the new bucket
      await time.increase(STAKING.warmup + 1);
      expect(await staking.tierOf(alice.address)).to.equal(1n);
      expect(await staking.tierOf(bob.address)).to.equal(2n);
      expect(await staking.tierOf(carol.address)).to.equal(3n);
      expect(await staking.discountBps(carol.address)).to.equal(5000n);
      expect(await carb.balanceOf(await staking.getAddress())).to.equal(K9(36_000));

      await staking.connect(carol).unstake(K9(30_000));
      expect(await staking.tierOf(carol.address)).to.equal(0n);
      await time.increase(STAKING.cooldown + 1);
      await expect(staking.connect(carol).withdraw()).to.emit(staking, "Withdrawn").withArgs(carol.address, K9(30_000));
      expect(await carb.balanceOf(carol.address)).to.equal(K9(1_000_000));
    });

    it("rejects a fee-on-transfer token at stake time", async function () {
      const taxed = await deployToken("FeeOnTransferERC20", 9, 100); // 1 % tax
      await taxed.mint(alice.address, K9(1_000_000));
      const st = await deployStaking(taxed, owner);
      await taxed.connect(alice).approve(await st.getAddress(), ethers.MaxUint256);
      await expect(st.connect(alice).stake(K9(1_000))).to.be.revertedWith(TAX_ERROR);
      expect(await st.totalStaked()).to.equal(0n);

      // the same token with the tax switched off works; a tax enabled later blocks NEW stakes only
      await taxed.setFeeBps(0);
      await st.connect(alice).stake(K9(1_000));
      expect(await st.totalStaked()).to.equal(K9(1_000));
      await taxed.setFeeBps(100);
      await expect(st.connect(alice).stake(K9(1_000))).to.be.revertedWith(TAX_ERROR);
    });

    it("rejects an unusable token at construction (no decimals(), absurd decimals)", async function () {
      const F = await ethers.getContractFactory("CarbStaking");
      const args = [STAKING.warmup, STAKING.cooldown, STAKING.thresholds, STAKING.discountsBps];
      await expect(F.deploy(owner.address, owner.address, ...args)).to.be.revertedWith("Token has no decimals()"); // EOA
      await expect(F.deploy(await market.getAddress(), owner.address, ...args)).to.be.revertedWith("Token has no decimals()");
      const huge = await deployToken("PlainERC20", 25);
      await expect(F.deploy(await huge.getAddress(), owner.address, ...args)).to.be.revertedWith("Token decimals unsupported");
    });

    it("works with other decimals too (0 and 6) with scaled bounds", async function () {
      for (const d of [0, 6]) {
        const t = await deployToken("PlainERC20", d);
        const unit = 10n ** BigInt(d);
        const st = await (await ethers.getContractFactory("CarbStaking")).deploy(
          await t.getAddress(),
          owner.address,
          STAKING.warmup,
          STAKING.cooldown,
          [10n * unit, 50n * unit, 250n * unit],
          STAKING.discountsBps
        );
        expect(await st.tokenDecimals()).to.equal(BigInt(d));
        expect(await st.MIN_THRESHOLD()).to.equal(unit);
        await t.mint(alice.address, 100n * unit);
        await t.connect(alice).approve(await st.getAddress(), ethers.MaxUint256);
        await st.connect(alice).stake(60n * unit);
        await time.increase(STAKING.warmup + 1);
        expect(await st.tierOf(alice.address)).to.equal(2n);
      }
    });
  });

  describe("IssuerBond", function () {
    let bond, NATIVE_ISSUER_ROLE;
    beforeEach(async function () {
      bond = await deployBond(carb, nft, owner);
      NATIVE_ISSUER_ROLE = await nft.NATIVE_ISSUER_ROLE();
      for (const u of [alice, bob, carol]) await carb.connect(u).approve(await bond.getAddress(), ethers.MaxUint256);
    });

    async function propose(issuer, amount) {
      await bond.proposeSlash(issuer.address, amount, "double-counted credits");
      return (await bond.nextSlashId()) - 1n;
    }

    it("reads decimals, scales the bounds, defaults the sink to 0x...dEaD", async function () {
      expect(await bond.tokenDecimals()).to.equal(9n);
      expect(await bond.MIN_BOND_FLOOR()).to.equal(K9(1));
      expect(await bond.MAX_MIN_BOND()).to.equal(K9(100_000_000));
      expect(await bond.slashSink()).to.equal(DEAD);
      await expect(bond.setMinBond(K9(1) - 1n)).to.be.revertedWith("Min bond out of bounds");
      await expect(bond.setMinBond(K9(100_000_001))).to.be.revertedWith("Min bond out of bounds");
      await bond.setMinBond(K9(5_000));
      const F = await ethers.getContractFactory("IssuerBond");
      await expect(
        F.deploy(
          await carb.getAddress(),
          owner.address,
          10n ** 18n * 1000n,
          BOND.unbondDelay,
          BOND.disputeWindow,
          true,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Min bond out of bounds");
    });

    it("bond grants no role at the 9-decimals minimum; unbond + withdraw return exactly the bond", async function () {
      await expect(bond.connect(alice).bond(K9(9_999))).to.be.revertedWith("Below minimum bond");
      await expect(bond.connect(alice).bond(K9(10_000)))
        .to.emit(bond, "Bonded")
        .withArgs(alice.address, K9(10_000), K9(10_000));
      expect(await nft.hasRole(NATIVE_ISSUER_ROLE, alice.address)).to.equal(false);
      await bond.connect(alice).startUnbond();
      await time.increase(BOND.unbondDelay + 1);
      await bond.connect(alice).withdraw();
      expect(await carb.balanceOf(alice.address)).to.equal(K9(1_000_000));
      expect(await nft.hasRole(NATIVE_ISSUER_ROLE, alice.address)).to.equal(false);
    });

    it("rejects a fee-on-transfer token when bonding (no role, no state change)", async function () {
      const taxed = await deployToken("FeeOnTransferERC20", 9, 250);
      await taxed.mint(alice.address, K9(1_000_000));
      const b2 = await deployBond(taxed, nft, owner);
      await taxed.connect(alice).approve(await b2.getAddress(), ethers.MaxUint256);
      await expect(b2.connect(alice).bond(K9(10_000))).to.be.revertedWith(TAX_ERROR);
      expect((await b2.bonds(alice.address)).amount).to.equal(0n);
      expect(await nft.hasRole(NATIVE_ISSUER_ROLE, alice.address)).to.equal(false);
    });

    it("slash without a burn() sends the tokens to the sink (default 0x...dEaD) and reports it", async function () {
      await bond.connect(alice).bond(K9(20_000));
      const id = await propose(alice, K9(7_000));
      await time.increase(BOND.disputeWindow + 1);
      await expect(bond.executeSlash(id)).to.emit(bond, "Slashed").withArgs(id, alice.address, K9(7_000), DEAD, false);
      expect(await carb.balanceOf(DEAD)).to.equal(K9(7_000));
      expect((await bond.bonds(alice.address)).amount).to.equal(K9(13_000));
      expect(await carb.totalSupply()).to.equal(K9(903_000_000)); // nothing burned
    });

    it("the slash sink is configurable (never zero); a treasury still wins over burn and sink", async function () {
      await expect(bond.setSlashSink(ethers.ZeroAddress)).to.be.revertedWith("Invalid sink");
      await expect(bond.setSlashSink(await bond.getAddress())).to.be.revertedWith("Invalid sink");
      await expect(bond.connect(alice).setSlashSink(carol.address)).to.be.reverted;
      await expect(bond.setSlashSink(carol.address)).to.emit(bond, "SlashSinkUpdated").withArgs(DEAD, carol.address);

      await bond.connect(alice).bond(K9(30_000));
      let id = await propose(alice, K9(1_000));
      await time.increase(BOND.disputeWindow + 1);
      await expect(bond.executeSlash(id)).to.emit(bond, "Slashed").withArgs(id, alice.address, K9(1_000), carol.address, false);
      expect(await carb.balanceOf(carol.address)).to.equal(K9(1_001_000));

      await bond.setSlashTreasury(bob.address);
      id = await propose(alice, K9(2_000));
      await time.increase(BOND.disputeWindow + 1);
      await expect(bond.executeSlash(id)).to.emit(bond, "Slashed").withArgs(id, alice.address, K9(2_000), bob.address, false);
      expect(await carb.balanceOf(bob.address)).to.equal(K9(1_002_000));
    });

    it("a burn() that does nothing (non-reverting stub) is detected and falls back to the sink", async function () {
      const stub = await deployToken("NoopBurnERC20", 9);
      await stub.mint(alice.address, K9(1_000_000));
      const b2 = await deployBond(stub, nft, owner);
      await stub.connect(alice).approve(await b2.getAddress(), ethers.MaxUint256);
      await b2.connect(alice).bond(K9(10_000));
      await b2.proposeSlash(alice.address, K9(4_000), "stub burn");
      await time.increase(BOND.disputeWindow + 1);
      await expect(b2.executeSlash(1)).to.emit(b2, "Slashed").withArgs(1, alice.address, K9(4_000), DEAD, false);
      expect(await stub.balanceOf(DEAD)).to.equal(K9(4_000));
    });

    it("a token with a real burn() is burned (sink = address(0), burned = true) at 9 decimals", async function () {
      const burnable = await deployToken("BurnableDecimalsERC20", 9);
      await burnable.mint(alice.address, K9(1_000_000));
      const b2 = await deployBond(burnable, nft, owner);
      await burnable.connect(alice).approve(await b2.getAddress(), ethers.MaxUint256);
      await b2.connect(alice).bond(K9(10_000));
      await b2.proposeSlash(alice.address, K9(4_000), "real burn");
      await time.increase(BOND.disputeWindow + 1);
      await expect(b2.executeSlash(1)).to.emit(b2, "Slashed").withArgs(1, alice.address, K9(4_000), ethers.ZeroAddress, true);
      expect(await burnable.totalSupply()).to.equal(K9(1_000_000) - K9(4_000));
      expect(await burnable.balanceOf(DEAD)).to.equal(0n);
    });

    it("a slash that leaves the bond under the minimum revokes the role (and does not need a burn)", async function () {
      await bond.connect(alice).bond(K9(10_000));
      const id = await propose(alice, K9(5_000));
      await time.increase(BOND.disputeWindow + 1);
      await bond.connect(bob).executeSlash(id); // anyone may execute an undisputed proposal
      expect(await nft.hasRole(NATIVE_ISSUER_ROLE, alice.address)).to.equal(false);
      expect(await bond.isBondedIssuer(alice.address)).to.equal(false);
    });
  });

  describe("CarbVotes (voting wrapper)", function () {
    let votes, votesAddr;
    beforeEach(async function () {
      votes = await (await ethers.getContractFactory("CarbVotes")).deploy(await carb.getAddress());
      await votes.waitForDeployment();
      votesAddr = await votes.getAddress();
      for (const u of [alice, bob, carol]) await carb.connect(u).approve(votesAddr, ethers.MaxUint256);
    });

    it("mirrors the wrapped token: decimals, underlying, timestamp clock", async function () {
      expect(await votes.decimals()).to.equal(9n);
      expect(await votes.underlying()).to.equal(await carb.getAddress());
      expect(await votes.symbol()).to.equal("vCARB");
      expect(await votes.CLOCK_MODE()).to.equal("mode=timestamp");
      expect(await votes.clock()).to.equal(BigInt(await time.latest()));
    });

    it("refuses a token without decimals() at deployment", async function () {
      const F = await ethers.getContractFactory("CarbVotes");
      await expect(F.deploy(owner.address)).to.be.revertedWith("Token has no decimals()");
    });

    it("deposits 1:1 and withdraws 1:1 (also to another account)", async function () {
      await expect(votes.connect(alice).depositFor(alice.address, K9(500))).to.emit(votes, "Transfer");
      expect(await votes.balanceOf(alice.address)).to.equal(K9(500));
      expect(await carb.balanceOf(votesAddr)).to.equal(K9(500));
      expect(await carb.balanceOf(alice.address)).to.equal(K9(999_500));

      await votes.connect(bob).depositFor(carol.address, K9(200)); // bob pays, carol gets the votes token
      expect(await votes.balanceOf(carol.address)).to.equal(K9(200));
      expect(await carb.balanceOf(bob.address)).to.equal(K9(999_800));

      await votes.connect(alice).withdrawTo(bob.address, K9(100));
      expect(await carb.balanceOf(bob.address)).to.equal(K9(999_900));
      expect(await votes.balanceOf(alice.address)).to.equal(K9(400));
      expect(await votes.totalSupply()).to.equal(K9(600));
      expect(await carb.balanceOf(votesAddr)).to.equal(K9(600));
      await expect(votes.connect(alice).withdrawTo(alice.address, K9(401))).to.be.reverted;
      await expect(votes.connect(alice).depositFor(votesAddr, K9(1))).to.be.revertedWith(
        "ERC20Wrapper: cannot mint to wrapper"
      );
    });

    it("rejects a fee-on-transfer token: no vCARB is minted against CARB the wrapper did not receive", async function () {
      const taxed = await deployToken("FeeOnTransferERC20", 9, 100);
      await taxed.mint(alice.address, K9(1_000));
      const w = await (await ethers.getContractFactory("CarbVotes")).deploy(await taxed.getAddress());
      await taxed.connect(alice).approve(await w.getAddress(), ethers.MaxUint256);
      await expect(w.connect(alice).depositFor(alice.address, K9(100))).to.be.revertedWith(TAX_ERROR);
      expect(await w.totalSupply()).to.equal(0n);

      // a tax enabled later, after a clean deposit: the wrapper stays solvent, the withdrawing user pays the fee
      await taxed.setFeeBps(0);
      await w.connect(alice).depositFor(alice.address, K9(100));
      await taxed.setFeeBps(100);
      await w.connect(alice).withdrawTo(alice.address, K9(100));
      expect(await w.totalSupply()).to.equal(0n);
      expect(await taxed.balanceOf(await w.getAddress())).to.equal(0n);
      expect(await taxed.balanceOf(alice.address)).to.equal(K9(1_000) - K9(1)); // 1 % of the withdrawal
    });

    it("voting power needs delegation, follows transfers and withdrawals, and is checkpointed by timestamp", async function () {
      await votes.connect(alice).depositFor(alice.address, K9(1_000));
      expect(await votes.getVotes(alice.address)).to.equal(0n); // not delegated yet
      await votes.connect(alice).delegate(alice.address);
      expect(await votes.getVotes(alice.address)).to.equal(K9(1_000));
      expect(await votes.delegates(alice.address)).to.equal(alice.address);

      await time.increase(10);
      const t0 = BigInt(await time.latest());
      await time.increase(10);

      await votes.connect(bob).depositFor(bob.address, K9(300));
      await votes.connect(bob).delegate(carol.address); // bob delegates to carol
      expect(await votes.getVotes(carol.address)).to.equal(K9(300));

      await votes.connect(alice).transfer(bob.address, K9(250)); // moves votes alice -> carol (bob's delegate)
      expect(await votes.getVotes(alice.address)).to.equal(K9(750));
      expect(await votes.getVotes(carol.address)).to.equal(K9(550));

      await votes.connect(bob).withdrawTo(bob.address, K9(50)); // burning vCARB removes votes
      expect(await votes.getVotes(carol.address)).to.equal(K9(500));
      expect(await votes.totalSupply()).to.equal(K9(1_250));

      await time.increase(5);
      // checkpoints: what alice had at t0 is untouched by everything after
      expect(await votes.getPastVotes(alice.address, t0)).to.equal(K9(1_000));
      expect(await votes.getPastVotes(carol.address, t0)).to.equal(0n);
      expect(await votes.getPastTotalSupply(t0)).to.equal(K9(1_000));
      const now = BigInt(await time.latest());
      expect(await votes.getPastVotes(carol.address, now - 1n)).to.equal(K9(500));
      expect(await votes.getPastTotalSupply(now - 1n)).to.equal(K9(1_250));
      await expect(votes.getPastVotes(alice.address, now + 100n)).to.be.reverted; // future lookup
    });
  });

  describe("CarbGovernor over CarbVotes", function () {
    let votes, staking, bond, governor, timelock, plan;

    beforeEach(async function () {
      votes = await (await ethers.getContractFactory("CarbVotes")).deploy(await carb.getAddress());
      staking = await deployStaking(carb, owner);
      bond = await deployBond(carb, nft, owner);
      ({ governor, timelock } = await deployGovernance(ethers, {
        token: votes,
        deployer: owner,
        targets: [market, staking, bond],
        params: GOV,
      }));
      plan = governanceRolePlan({ market, staking, bond, nft });
      await applyGovernanceSetup(plan, await timelock.getAddress(), owner);

      // owner and alice wrap + delegate; bob keeps plain CARB; carol only stakes
      const vAddr = await votes.getAddress();
      await carb.connect(owner).approve(vAddr, ethers.MaxUint256);
      await carb.connect(alice).approve(vAddr, ethers.MaxUint256);
      await votes.connect(owner).depositFor(owner.address, K9(100_000_000));
      await votes.connect(alice).depositFor(alice.address, K9(500_000));
      await votes.connect(owner).delegate(owner.address);
      await votes.connect(alice).delegate(alice.address);
      await carb.connect(carol).approve(await staking.getAddress(), ethers.MaxUint256);
      await staking.connect(carol).stake(K9(500_000));
      await time.increase(5);
    });

    it("is wired to the wrapper, in seconds, with 9-decimals bounds", async function () {
      expect(await governor.token()).to.equal(await votes.getAddress());
      expect(await governor.CLOCK_MODE()).to.equal("mode=timestamp");
      expect(await governor.proposalThreshold()).to.equal(K9(100_000));
      expect(await governor.MAX_PROPOSAL_THRESHOLD()).to.equal(K9(50_000_000));
      const F = await ethers.getContractFactory("CarbGovernor");
      const votesAddr = await votes.getAddress();
      const timelockAddr = await timelock.getAddress();
      const args = (threshold) => [votesAddr, timelockAddr, DAY, 5 * DAY, threshold, 4, []];
      await F.deploy(...args(K9(50_000_000)));
      await expect(F.deploy(...args(K9(50_000_001)))).to.be.revertedWith("Threshold too high");
      await expect(F.deploy(...args(10n ** 18n))).to.be.revertedWith("Threshold too high"); // 1e9 whole tokens
    });

    it("only wrapped + delegated CARB votes: plain and staked tokens carry nothing", async function () {
      const snapshotTime = (await time.latest()) - 1;
      expect(await governor.getVotes(bob.address, snapshotTime)).to.equal(0n); // holds CARB, never wrapped
      expect(await governor.getVotes(carol.address, snapshotTime)).to.equal(0n); // staked
      const data = [staking.interface.encodeFunctionData("setTierThresholds", [[K9(2), K9(3), K9(4)]])];
      const targets = [await staking.getAddress()];
      await expect(governor.connect(bob).propose(targets, [0], data, "bob")).to.be.revertedWith(
        "Governor: proposer votes below proposal threshold"
      );
      await expect(governor.connect(carol).propose(targets, [0], data, "carol")).to.be.revertedWith(
        "Governor: proposer votes below proposal threshold"
      );
    });

    it("runs a full proposal: propose -> vote -> queue -> execute changes the staking thresholds", async function () {
      const newThresholds = [K9(2_000), K9(6_000), K9(26_000)];
      const targets = [await staking.getAddress()];
      const datas = [staking.interface.encodeFunctionData("setTierThresholds", [newThresholds])];
      const description = "raise thresholds (9-decimals token)";
      await governor.connect(alice).propose(targets, [0], datas, description);
      const id = await governor.hashProposal(targets, [0], datas, ethers.id(description));
      expect(await governor.state(id)).to.equal(STATE.Pending);

      await time.increase(GOV.votingDelay + 5);
      await governor.connect(owner).castVote(id, 1);
      await governor.connect(alice).castVote(id, 1);
      await time.increase(GOV.votingPeriod + 5);
      expect(await governor.state(id)).to.equal(STATE.Succeeded);
      // quorum is 4 % of the WRAPPED supply (100.5M vCARB), not of the 1B CARB supply
      expect(await governor.quorum((await time.latest()) - 1)).to.equal((K9(100_500_000) * 4n) / 100n);

      await governor.queue(targets, [0], datas, ethers.id(description));
      await time.increase(GOV.timelockDelay + 5);
      await governor.execute(targets, [0], datas, ethers.id(description));
      expect(await governor.state(id)).to.equal(STATE.Executed);
      expect(await staking.tierThresholds(0)).to.equal(newThresholds[0]);
      expect(await staking.tierThresholds(2)).to.equal(newThresholds[2]);
    });

    it("a voter who unwraps after voting keeps the snapshot weight; one who wraps after the snapshot has none", async function () {
      const targets = [await staking.getAddress()];
      const datas = [staking.interface.encodeFunctionData("setTierThresholds", [[K9(2_000), K9(6_000), K9(26_000)]])];
      await governor.connect(alice).propose(targets, [0], datas, "snapshot");
      const id = await governor.hashProposal(targets, [0], datas, ethers.id("snapshot"));
      const snapshot = await governor.proposalSnapshot(id);

      await time.increase(GOV.votingDelay + 5);
      // bob wraps AFTER the snapshot: no weight
      await carb.connect(bob).approve(await votes.getAddress(), ethers.MaxUint256);
      await votes.connect(bob).depositFor(bob.address, K9(900_000));
      await votes.connect(bob).delegate(bob.address);
      await time.increase(5);
      await governor.connect(bob).castVote(id, 1);
      expect(await votes.getPastVotes(bob.address, snapshot)).to.equal(0n);
      expect((await governor.proposalVotes(id)).forVotes).to.equal(0n);

      // alice votes, then unwraps everything: her recorded weight stays
      await governor.connect(alice).castVote(id, 1);
      await votes.connect(alice).withdrawTo(alice.address, K9(500_000));
      expect((await governor.proposalVotes(id)).forVotes).to.equal(K9(500_000));
    });
  });
});
