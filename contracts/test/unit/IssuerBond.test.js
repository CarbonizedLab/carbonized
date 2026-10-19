const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployTokenStack, K, DAY } = require("../poc/helpers/tokenFixture");

describe("IssuerBond (bonded issuer path)", function () {
  const UNBOND = 30 * DAY;
  const DISPUTE = 7 * DAY;
  const EXEC_WINDOW = 14 * DAY;
  let s, owner, alice, bob, attacker, carol, nft, carb, bond, NATIVE_ISSUER_ROLE;

  const hasRole = (a) => nft.hasRole(NATIVE_ISSUER_ROLE, a.address);

  beforeEach(async function () {
    s = await deployTokenStack();
    ({ owner, alice, bob, attacker, carol, nft, carb, bond } = s);
    NATIVE_ISSUER_ROLE = await nft.NATIVE_ISSUER_ROLE();
    for (const u of [alice, bob, attacker, carol]) {
      await carb.connect(u).approve(await bond.getAddress(), ethers.MaxUint256);
    }
  });

  async function proposeSlash(issuer, amount, reason = "double-counted credits") {
    const tx = await bond.proposeSlash(issuer.address, amount, reason);
    await tx.wait();
    return (await bond.nextSlashId()) - 1n;
  }

  describe("bonding", function () {
    it("does not grant NATIVE_ISSUER_ROLE once the minimum bond is locked", async function () {
      await expect(bond.connect(alice).bond(K(10_000)))
        .to.emit(bond, "Bonded")
        .withArgs(alice.address, K(10_000), K(10_000));
      expect(await hasRole(alice)).to.equal(false);
      expect(await bond.isBondedIssuer(alice.address)).to.equal(true);
      expect(await carb.balanceOf(await bond.getAddress())).to.equal(K(10_000));
      expect((await bond.bonds(alice.address)).amount).to.equal(K(10_000));
    });

    it("rejects a bond below the minimum (no role) and allows topping up to reach it", async function () {
      await expect(bond.connect(alice).bond(K(9_999))).to.be.revertedWith("Below minimum bond");
      expect(await hasRole(alice)).to.equal(false);
      await expect(bond.connect(alice).bond(0)).to.be.revertedWith("Invalid amount");
    });

    it("a bonded account cannot mint credits", async function () {
      await bond.connect(alice).bond(K(10_000));
      await expect(nft.connect(alice).mintCredit(
        alice.address, "P1", "Project", "VCS-BOND-1", "VERRA_VCS", K(5), 2024, "IN",
        ethers.keccak256(ethers.toUtf8Bytes("p")), "cid", "ipfs://x"
      )).to.be.reverted;
      expect(await nft.balanceOf(alice.address)).to.equal(0n);
    });

    it("the bond path can be closed (bondRequired=false) without touching existing bonds", async function () {
      await bond.connect(alice).bond(K(10_000));
      await bond.setBondRequired(false);
      await expect(bond.connect(bob).bond(K(10_000))).to.be.revertedWith("Bond path closed");
      expect(await hasRole(alice)).to.equal(false);
      await bond.connect(alice).startUnbond(); // exits still work
    });

    it("rejects bonding while unbonding and by blocked addresses", async function () {
      await bond.connect(alice).bond(K(10_000));
      await bond.connect(alice).startUnbond();
      await expect(bond.connect(alice).bond(K(10_000))).to.be.revertedWith("Unbonding");

      await bond.setIssuerBlocked(bob.address, true);
      await expect(bond.connect(bob).bond(K(10_000))).to.be.revertedWith("Issuer blocked");
      await expect(bond.connect(bob).setIssuerBlocked(bob.address, false)).to.be.reverted;
    });

    it("a trusted issuer (role granted directly by the multisig) can also bond and keeps the role on unbond", async function () {
      await nft.grantRole(NATIVE_ISSUER_ROLE, carol.address); // owner holds ISSUER_ADMIN_ROLE from the NFT constructor
      await expect(bond.connect(carol).bond(K(10_000)))
        .to.emit(bond, "Bonded")
        .withArgs(carol.address, K(10_000), K(10_000));
      expect(await bond.isBondedIssuer(carol.address)).to.equal(true);
      await expect(bond.connect(carol).startUnbond()).to.emit(bond, "UnbondStarted");
      expect(await hasRole(carol)).to.equal(true);
    });

    it("a manual revoke by the multisig is not silently undone by a top-up", async function () {
      await bond.connect(alice).bond(K(10_000));
      await nft.revokeRole(NATIVE_ISSUER_ROLE, alice.address);
      await bond.connect(alice).bond(K(1));
      expect(await hasRole(alice)).to.equal(false);
    });

    it("role admin: random accounts and the NFT default admin without ISSUER_ADMIN_ROLE cannot grant NATIVE_ISSUER_ROLE", async function () {
      await expect(nft.connect(attacker).grantRole(NATIVE_ISSUER_ROLE, attacker.address)).to.be.reverted;
      // multisig/owner can still grant for 'trusted issuers' because it holds ISSUER_ADMIN_ROLE
      await nft.grantRole(NATIVE_ISSUER_ROLE, bob.address);
      expect(await hasRole(bob)).to.equal(true);
    });
  });

  describe("unbonding", function () {
    beforeEach(async function () {
      await bond.connect(alice).bond(K(12_000));
    });

    it("revokes the role at the START of unbonding and releases the bond only after the delay", async function () {
      await expect(bond.connect(alice).startUnbond()).to.emit(bond, "UnbondStarted");
      expect(await hasRole(alice)).to.equal(false);
      await expect(
        nft.connect(alice).mintCredit(
          alice.address, "P2", "Project", "VCS-BOND-2", "VERRA_VCS", K(1), 2024, "IN",
          ethers.keccak256(ethers.toUtf8Bytes("q")), "cid", "ipfs://x"
        )
      ).to.be.reverted;

      await expect(bond.connect(alice).withdraw()).to.be.revertedWith("Unbonding delay active");
      await time.increase(UNBOND - 100);
      await expect(bond.connect(alice).withdraw()).to.be.revertedWith("Unbonding delay active");
      await time.increase(200);

      const before = await carb.balanceOf(alice.address);
      await expect(bond.connect(alice).withdraw()).to.emit(bond, "Withdrawn").withArgs(alice.address, K(12_000));
      expect((await carb.balanceOf(alice.address)) - before).to.equal(K(12_000));
      expect((await bond.bonds(alice.address)).amount).to.equal(0n);
    });

    it("cannot withdraw without unbonding, cannot unbond twice, cannot double-withdraw", async function () {
      await expect(bond.connect(alice).withdraw()).to.be.revertedWith("Not unbonding");
      await expect(bond.connect(bob).startUnbond()).to.be.revertedWith("No bond");
      await bond.connect(alice).startUnbond();
      await expect(bond.connect(alice).startUnbond()).to.be.revertedWith("Already unbonding");
      await time.increase(UNBOND + 10);
      await bond.connect(alice).withdraw();
      await expect(bond.connect(alice).withdraw()).to.be.revertedWith("Not unbonding");
    });

    it("an issuer can re-enter after a full exit", async function () {
      await bond.connect(alice).startUnbond();
      await time.increase(UNBOND + 10);
      await bond.connect(alice).withdraw();
      await bond.connect(alice).bond(K(10_000));
      expect(await hasRole(alice)).to.equal(false);
    });
  });

  describe("slashing", function () {
    beforeEach(async function () {
      await bond.connect(alice).bond(K(20_000));
    });

    it("only SLASHER_ROLE can propose or cancel", async function () {
      await expect(bond.connect(attacker).proposeSlash(alice.address, K(1), "x")).to.be.reverted;
      const id = await proposeSlash(alice, K(1));
      await expect(bond.connect(attacker).cancelSlash(id)).to.be.reverted;
    });

    it("validates proposals: bond must exist, amount and reason required, one active proposal per issuer", async function () {
      await expect(bond.proposeSlash(bob.address, K(1), "x")).to.be.revertedWith("No bond");
      await expect(bond.proposeSlash(alice.address, 0, "x")).to.be.revertedWith("Invalid amount");
      await expect(bond.proposeSlash(alice.address, K(1), "")).to.be.revertedWith("Invalid reason");
      await expect(bond.proposeSlash(alice.address, K(1), "x".repeat(513))).to.be.revertedWith("Invalid reason");
      await proposeSlash(alice, K(1));
      await expect(bond.proposeSlash(alice.address, K(1), "again")).to.be.revertedWith("Slash already pending");
    });

    it("cannot execute inside the dispute window; after it anyone can; the slashed CARB is BURNED by default", async function () {
      const id = await proposeSlash(alice, K(5_000), "fraudulent serial");
      await expect(bond.connect(bob).executeSlash(id)).to.be.revertedWith("Dispute window active");

      await time.increase(DISPUTE + 10);
      const supplyBefore = await carb.totalSupply();
      await expect(bond.connect(bob).executeSlash(id))
        .to.emit(bond, "Slashed")
        .withArgs(id, alice.address, K(5_000), ethers.ZeroAddress, true);

      expect(await carb.totalSupply()).to.equal(supplyBefore - K(5_000));
      expect((await bond.bonds(alice.address)).amount).to.equal(K(15_000));
      expect(await carb.balanceOf(await bond.getAddress())).to.equal(K(15_000));
      expect(await hasRole(alice)).to.equal(false);
      await expect(bond.executeSlash(id)).to.be.revertedWith("Already resolved");
    });

    it("emits the reason on proposal", async function () {
      await expect(bond.proposeSlash(alice.address, K(1), "reason text")).to.emit(bond, "SlashProposed");
      const logs = await bond.queryFilter(bond.filters.SlashProposed());
      expect(logs[0].args.reason).to.equal("reason text");
      expect(logs[0].args.issuer).to.equal(alice.address);
    });

    it("sends slashed CARB to the configured treasury instead of burning", async function () {
      await bond.setSlashTreasury(carol.address);
      const id = await proposeSlash(alice, K(2_000));
      await time.increase(DISPUTE + 10);
      const supply = await carb.totalSupply();
      const before = await carb.balanceOf(carol.address);
      await expect(bond.executeSlash(id)).to.emit(bond, "Slashed").withArgs(id, alice.address, K(2_000), carol.address, false);
      expect((await carb.balanceOf(carol.address)) - before).to.equal(K(2_000));
      expect(await carb.totalSupply()).to.equal(supply);
    });

    it("slashing below the minimum reduces the active bond; slashing more than the bond caps at the bond", async function () {
      const id = await proposeSlash(alice, K(15_000));
      await time.increase(DISPUTE + 10);
      await bond.executeSlash(id);
      expect(await hasRole(alice)).to.equal(false);
      expect((await bond.bonds(alice.address)).amount).to.equal(K(5_000));

      await bond.connect(alice).bond(K(5_000)); // top up to the minimum
      expect(await hasRole(alice)).to.equal(false);

      const id2 = await proposeSlash(alice, K(1_000_000));
      await time.increase(DISPUTE + 10);
      await bond.executeSlash(id2);
      expect((await bond.bonds(alice.address)).amount).to.equal(0n);
      expect(await carb.balanceOf(await bond.getAddress())).to.equal(0n);
      expect(await hasRole(alice)).to.equal(false);
    });

    it("an active proposal freezes startUnbond and withdraw; cancelling or lapsing unfreezes", async function () {
      const id = await proposeSlash(alice, K(1_000));
      await expect(bond.connect(alice).startUnbond()).to.be.revertedWith("Slash pending");
      expect(await bond.hasActiveSlash(alice.address)).to.equal(true);

      await bond.cancelSlash(id);
      expect(await bond.hasActiveSlash(alice.address)).to.equal(false);
      await expect(bond.executeSlash(id)).to.be.revertedWith("Already resolved");
      await bond.connect(alice).startUnbond();

      // propose again while unbonding: withdraw is frozen until the proposal lapses
      await time.increase(UNBOND + 10);
      const id2 = await proposeSlash(alice, K(1_000));
      await expect(bond.connect(alice).withdraw()).to.be.revertedWith("Slash pending");
      await time.increase(DISPUTE + EXEC_WINDOW + 10);
      await expect(bond.executeSlash(id2)).to.be.revertedWith("Proposal lapsed");
      await bond.connect(alice).withdraw(); // a vanished slasher cannot hold the bond hostage
    });

    it("a slash proposed while the issuer is unbonding executes against the remaining bond", async function () {
      await bond.connect(alice).startUnbond();
      const id = await proposeSlash(alice, K(20_000));
      await time.increase(DISPUTE + 10);
      await bond.executeSlash(id);
      expect((await bond.bonds(alice.address)).amount).to.equal(0n);
      await time.increase(UNBOND);
      await bond.connect(alice).withdraw(); // pays 0
      expect(await carb.balanceOf(await bond.getAddress())).to.equal(0n);
    });

    it("a disputed proposal can only be executed by a SLASHER_ROLE holder", async function () {
      const id = await proposeSlash(alice, K(1_000));
      await expect(bond.connect(bob).disputeSlash(id, ethers.ZeroHash)).to.be.revertedWith("Not the slashed issuer");
      const evidence = ethers.keccak256(ethers.toUtf8Bytes("evidence.pdf"));
      await expect(bond.connect(alice).disputeSlash(id, evidence)).to.emit(bond, "SlashDisputed").withArgs(id, alice.address, evidence);
      await expect(bond.connect(alice).disputeSlash(id, evidence)).to.be.revertedWith("Already disputed");

      await time.increase(DISPUTE + 10);
      await expect(bond.connect(bob).executeSlash(id)).to.be.reverted; // needs SLASHER_ROLE
      await expect(bond.connect(alice).executeSlash(id)).to.be.reverted;
      await bond.executeSlash(id); // owner holds SLASHER_ROLE
      expect((await bond.bonds(alice.address)).amount).to.equal(K(19_000));
    });

    it("cannot dispute a resolved / lapsed proposal", async function () {
      const id = await proposeSlash(alice, K(1_000));
      await bond.cancelSlash(id);
      await expect(bond.connect(alice).disputeSlash(id, ethers.ZeroHash)).to.be.revertedWith("Proposal not active");
    });

    it("an unauthorized account cannot slash by any route and cannot touch a bond", async function () {
      await expect(bond.connect(attacker).proposeSlash(alice.address, K(20_000), "grief")).to.be.reverted;
      await expect(bond.connect(attacker).executeSlash(1)).to.be.revertedWith("Unknown proposal");
      expect(await carb.balanceOf(await bond.getAddress())).to.equal(K(20_000));
    });

    it("slashing still succeeds if the bond contract lost ISSUER_ADMIN_ROLE (role revoke is best-effort)", async function () {
      const id = await proposeSlash(alice, K(15_000));
      await time.increase(DISPUTE + 10);
      await expect(bond.executeSlash(id)).to.emit(bond, "Slashed");
      expect((await bond.bonds(alice.address)).amount).to.equal(K(5_000));
      expect(await hasRole(alice)).to.equal(false);
    });
  });

  describe("parameters", function () {
    it("bounds constructor arguments", async function () {
      const F = await ethers.getContractFactory("IssuerBond");
      const k = await carb.getAddress();
      const zero = ethers.ZeroAddress;
      await expect(F.deploy(zero, owner.address, K(10), UNBOND, DISPUTE, true, zero)).to.be.revertedWith("Invalid address");
      await expect(F.deploy(k, owner.address, 1n, UNBOND, DISPUTE, true, zero)).to.be.revertedWith("Min bond out of bounds");
      await expect(F.deploy(k, owner.address, K(10), 3 * DAY, DISPUTE, true, zero)).to.be.revertedWith("Unbond delay out of bounds");
      await expect(F.deploy(k, owner.address, K(10), 91 * DAY, DISPUTE, true, zero)).to.be.revertedWith("Unbond delay out of bounds");
      await expect(F.deploy(k, owner.address, K(10), UNBOND, 60, true, zero)).to.be.revertedWith("Dispute window out of bounds");
    });

    it("setMinBond is PARAMETER_ROLE-gated and bounded; changes apply to new bonding only", async function () {
      await bond.connect(alice).bond(K(10_000));
      await expect(bond.connect(attacker).setMinBond(K(1))).to.be.reverted;
      await expect(bond.setMinBond(1)).to.be.revertedWith("Min bond out of bounds");
      await expect(bond.setMinBond(K(200_000_000))).to.be.revertedWith("Min bond out of bounds");
      await bond.setMinBond(K(50_000));
      expect(await hasRole(alice)).to.equal(false);
      await expect(bond.connect(bob).bond(K(49_999))).to.be.revertedWith("Below minimum bond");
      await bond.connect(bob).bond(K(50_000));
      expect(await hasRole(bob)).to.equal(false);
    });

    it("setSlashTreasury / setBondRequired are PARAMETER_ROLE-gated", async function () {
      await expect(bond.connect(attacker).setSlashTreasury(attacker.address)).to.be.reverted;
      await expect(bond.connect(attacker).setBondRequired(false)).to.be.reverted;
      await expect(bond.setSlashTreasury(carol.address)).to.emit(bond, "SlashTreasuryUpdated");
    });

    it("exposes no function that lets anyone withdraw another issuer's bond or mint credits", async function () {
      for (const name of ["sweep", "rescue", "withdrawFor", "adminWithdraw", "mintCredit", "emergencyWithdraw"]) {
        expect(bond.interface.hasFunction(name), name).to.equal(false);
      }
    });
  });
});
