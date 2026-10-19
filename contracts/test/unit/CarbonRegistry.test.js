const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("CarbonRegistry - Unit Tests", function () {
  const t = (n) => ethers.parseUnits(String(n), 18);
  const coder = ethers.AbiCoder.defaultAbiCoder();
  /** Off-chain contact commitment: keccak256(abi.encode(email, phone, salt)). */
  const contactHash = (email, phone, salt = ethers.id("salt")) =>
    ethers.keccak256(coder.encode(["string", "string", "bytes32"], [email, phone, salt]));
  const CONTACT = contactHash("ops@acme.test", "+62 811 0000");

  async function deployFixture() {
    const [admin, company, company2, trader, verifier, stranger] = await ethers.getSigners();

    const registry = await (await ethers.getContractFactory("CarbonRegistry")).deploy(admin.address);
    await registry.waitForDeployment();
    await registry.grantRole(await registry.VERIFIER_ROLE(), verifier.address);

    return { registry, admin, company, company2, trader, verifier, stranger };
  }

  const registerCompany = (registry, signer, overrides = {}) =>
    registry
      .connect(signer)
      .registerCompany(
        overrides.name ?? "Acme Corp",
        overrides.legalId ?? "NIB-123",
        overrides.scope1 ?? t(500),
        overrides.scope2 ?? t(300),
        overrides.scope3 ?? t(200),
        overrides.contactHash ?? CONTACT
      );

  const registerTrader = (registry, signer, overrides = {}) =>
    registry
      .connect(signer)
      .registerTrader(overrides.name ?? "Tina", overrides.contactHash ?? contactHash("t@x.test", "123"), overrides.country ?? "ID");

  /** Verifier approves exactly what is currently on chain. */
  const verify = async (registry, verifier, company) =>
    registry.connect(verifier).setCompanyVerified(company.address, true, await registry.profileHashOf(company.address));

  describe("Deployment", function () {
    it("grants admin, pauser and verifier roles to the admin", async function () {
      const { registry, admin } = await loadFixture(deployFixture);
      expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await registry.hasRole(await registry.PAUSER_ROLE(), admin.address)).to.equal(true);
      expect(await registry.hasRole(await registry.VERIFIER_ROLE(), admin.address)).to.equal(true);
    });

    it("rejects the zero admin", async function () {
      const Registry = await ethers.getContractFactory("CarbonRegistry");
      await expect(Registry.deploy(ethers.ZeroAddress)).to.be.revertedWith("Invalid admin");
    });

    it("has no faucet / mint surface (AUD-REGISTRY-01)", async function () {
      const { registry } = await loadFixture(deployFixture);
      expect(registry.interface.getFunction("registerAndClaimCredits")).to.equal(null);
      expect(registry.interface.getFunction("claimStarterCredits")).to.equal(null);
      expect(registry.interface.getFunction("starterCreditsClaimed")).to.equal(null);
      expect(registry.interface.getFunction("creditNft")).to.equal(null);
    });

    it("admin can hand every role to a multisig and renounce", async function () {
      const { registry, admin, stranger } = await loadFixture(deployFixture);
      for (const role of [
        await registry.DEFAULT_ADMIN_ROLE(),
        await registry.PAUSER_ROLE(),
        await registry.VERIFIER_ROLE(),
      ]) {
        await registry.connect(admin).grantRole(role, stranger.address);
      }
      await registry.connect(admin).renounceRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address);
      expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(false);
      expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), stranger.address)).to.equal(true);
    });
  });

  describe("Company registration", function () {
    it("stores the profile, emits CompanyRegistered and counts the company", async function () {
      const { registry, company } = await loadFixture(deployFixture);
      await expect(registerCompany(registry, company))
        .to.emit(registry, "CompanyRegistered")
        .withArgs(company.address, "Acme Corp", "NIB-123", t(500), t(300), t(200));

      const data = await registry.getCompanyData(company.address);
      expect(data.name).to.equal("Acme Corp");
      expect(data.legalId).to.equal("NIB-123");
      expect(data.contactHash).to.equal(CONTACT);
      expect(data.scope1).to.equal(t(500));
      expect(data.verified).to.equal(false);
      expect(data.registeredAt).to.be.gt(0);

      const emissions = await registry.getCompanyEmissions(company.address);
      expect(emissions.scope2).to.equal(t(300));
      expect(emissions.target).to.equal(0);

      expect(await registry.isCompany(company.address)).to.equal(true);
      expect(await registry.totalCompanies()).to.equal(1);
      expect(await registry.registrationTypeOf(company.address)).to.equal(1);
    });

    it("never exposes raw e-mail / phone: no such fields in the ABI, none in logs (AUD-WEBAPP-06)", async function () {
      const { registry, company, trader } = await loadFixture(deployFixture);
      await registerCompany(registry, company);
      await registerTrader(registry, trader);

      const names = (fn) => registry.interface.getFunction(fn).outputs.map((o) => o.name);
      expect(names("getCompanyData")).to.not.include.members(["email"]);
      expect(names("getCompanyData")).to.not.include.members(["phone"]);
      expect(names("getTraderData")).to.not.include.members(["email"]);
      expect(names("getTraderData")).to.not.include.members(["phone"]);

      // raw bytes of every log must not contain the plaintext
      const address = await registry.getAddress();
      const logs = await ethers.provider.getLogs({ address, fromBlock: 0 });
      const blob = logs.map((l) => l.data).join("");
      expect(blob).to.not.include(ethers.hexlify(ethers.toUtf8Bytes("ops@acme.test")).slice(2));
      expect(blob).to.not.include(ethers.hexlify(ethers.toUtf8Bytes("t@x.test")).slice(2));
    });

    it("reverts on duplicate registration", async function () {
      const { registry, company } = await loadFixture(deployFixture);
      await registerCompany(registry, company);
      await expect(registerCompany(registry, company)).to.be.revertedWith("Already registered");
    });

    it("reverts when the wallet is already a trader (and vice versa)", async function () {
      const { registry, company, trader } = await loadFixture(deployFixture);
      await registerTrader(registry, trader);
      await expect(registerCompany(registry, trader)).to.be.revertedWith("Already registered");
      await registerCompany(registry, company);
      await expect(registerTrader(registry, company)).to.be.revertedWith("Already registered");
    });

    it("enforces non-empty fields and length caps", async function () {
      const { registry, company } = await loadFixture(deployFixture);
      await expect(registerCompany(registry, company, { name: "" })).to.be.revertedWith("Invalid name");
      await expect(registerCompany(registry, company, { name: "x".repeat(101) })).to.be.revertedWith("Invalid name");
      await expect(registerCompany(registry, company, { legalId: "x".repeat(65) })).to.be.revertedWith(
        "Invalid legal ID"
      );
      await expect(registerCompany(registry, company, { legalId: "- . /" })).to.be.revertedWith("Invalid legal ID");
      await expect(registerCompany(registry, company, { contactHash: ethers.ZeroHash })).to.be.revertedWith(
        "Invalid contact hash"
      );
    });

    it("caps emission figures", async function () {
      const { registry, company } = await loadFixture(deployFixture);
      const tooBig = (await registry.MAX_EMISSION()) + 1n;
      await expect(registerCompany(registry, company, { scope3: tooBig })).to.be.revertedWith("Emissions too large");
      await registerCompany(registry, company, { scope3: await registry.MAX_EMISSION() });
    });

    it("updates the profile; any name / legal ID / contact change resets verification", async function () {
      const { registry, company, verifier } = await loadFixture(deployFixture);
      await registerCompany(registry, company);

      // identical values: nothing changed, badge survives
      await verify(registry, verifier, company);
      await registry.connect(company).updateCompanyProfile("Acme Corp", "NIB-123", CONTACT);
      expect((await registry.getCompanyKyb(company.address)).verified).to.equal(true);

      // name change
      await expect(registry.connect(company).updateCompanyProfile("Acme Inc", "NIB-123", CONTACT))
        .to.emit(registry, "CompanyProfileUpdated")
        .withArgs(company.address, "Acme Inc", "NIB-123", true);
      expect((await registry.getCompanyKyb(company.address)).verified).to.equal(false);

      // contact change
      await verify(registry, verifier, company);
      await registry.connect(company).updateCompanyProfile("Acme Inc", "NIB-123", contactHash("new@acme.test", "+62 1"));
      expect((await registry.getCompanyKyb(company.address)).verified).to.equal(false);

      // legal ID change
      await verify(registry, verifier, company);
      await expect(
        registry.connect(company).updateCompanyProfile("Acme Inc", "NIB-999", contactHash("new@acme.test", "+62 1"))
      )
        .to.emit(registry, "CompanyProfileUpdated")
        .withArgs(company.address, "Acme Inc", "NIB-999", true);
      expect((await registry.getCompanyKyb(company.address)).verified).to.equal(false);
    });

    it("rejects profile updates from non-companies", async function () {
      const { registry, stranger } = await loadFixture(deployFixture);
      await expect(registry.connect(stranger).updateCompanyProfile("A", "B", CONTACT)).to.be.revertedWith(
        "Not a company"
      );
    });
  });

  describe("Emissions", function () {
    it("lets the company update its emissions and emits EmissionsUpdated", async function () {
      const { registry, company } = await loadFixture(deployFixture);
      await registerCompany(registry, company);

      await expect(registry.connect(company).updateEmissions(t(10), t(20), t(30)))
        .to.emit(registry, "EmissionsUpdated")
        .withArgs(company.address, t(10), t(20), t(30), t(60), (v) => v > 0n);

      const e = await registry.getCompanyEmissions(company.address);
      expect([e.scope1, e.scope2, e.scope3]).to.deep.equal([t(10), t(20), t(30)]);
    });

    it("only affects the caller's own record", async function () {
      const { registry, company, company2 } = await loadFixture(deployFixture);
      await registerCompany(registry, company);
      await registerCompany(registry, company2, { name: "Beta", legalId: "B-1" });
      await registry.connect(company2).updateEmissions(t(1), t(2), t(3));
      expect((await registry.getCompanyEmissions(company.address)).scope1).to.equal(t(500));
    });

    it("reverts for non-companies, including traders", async function () {
      const { registry, trader, stranger } = await loadFixture(deployFixture);
      await registerTrader(registry, trader);
      await expect(registry.connect(trader).updateEmissions(1, 1, 1)).to.be.revertedWith("Not a company");
      await expect(registry.connect(stranger).updateEmissions(1, 1, 1)).to.be.revertedWith("Not a company");
    });

    it("rejects oversized figures", async function () {
      const { registry, company } = await loadFixture(deployFixture);
      await registerCompany(registry, company);
      const tooBig = (await registry.MAX_EMISSION()) + 1n;
      await expect(registry.connect(company).updateEmissions(tooBig, 0, 0)).to.be.revertedWith("Emissions too large");
    });

    it("sets an emission target for companies only (does not touch KYB)", async function () {
      const { registry, company, stranger, verifier } = await loadFixture(deployFixture);
      await registerCompany(registry, company);
      await verify(registry, verifier, company);
      await expect(registry.connect(company).setEmissionTarget(t(900)))
        .to.emit(registry, "EmissionTargetSet")
        .withArgs(company.address, t(900));
      expect((await registry.getCompanyEmissions(company.address)).target).to.equal(t(900));
      expect((await registry.getCompanyKyb(company.address)).verified).to.equal(true);
      await expect(registry.connect(stranger).setEmissionTarget(1)).to.be.revertedWith("Not a company");
    });
  });

  describe("Trader registration", function () {
    it("stores the trader profile and emits TraderRegistered", async function () {
      const { registry, trader } = await loadFixture(deployFixture);
      const h = contactHash("t@x.test", "123");
      await expect(registry.connect(trader).registerTrader("Tina", h, "ID"))
        .to.emit(registry, "TraderRegistered")
        .withArgs(trader.address, "Tina", "ID");

      const data = await registry.getTraderData(trader.address);
      expect(data.name).to.equal("Tina");
      expect(data.contactHash).to.equal(h);
      expect(data.country).to.equal("ID");
      expect(data.isActive).to.equal(true);
      expect(data.registrationDate).to.be.gt(0);
      expect(await registry.totalTraders()).to.equal(1);
      expect(await registry.registrationTypeOf(trader.address)).to.equal(2);
    });

    it("reverts on duplicates and invalid input", async function () {
      const { registry, trader } = await loadFixture(deployFixture);
      const h = contactHash("t@x.test", "1");
      await expect(registry.connect(trader).registerTrader("", h, "ID")).to.be.revertedWith("Invalid name");
      await expect(registry.connect(trader).registerTrader("T", ethers.ZeroHash, "ID")).to.be.revertedWith(
        "Invalid contact hash"
      );
      await expect(registry.connect(trader).registerTrader("T", h, "c".repeat(65))).to.be.revertedWith(
        "Invalid country"
      );
      await registry.connect(trader).registerTrader("T", h, "ID");
      await expect(registry.connect(trader).registerTrader("T", h, "ID")).to.be.revertedWith("Already registered");
    });
  });

  describe("KYB verification", function () {
    it("lets a verifier verify and unverify a company", async function () {
      const { registry, company, verifier } = await loadFixture(deployFixture);
      await registerCompany(registry, company);

      await expect(verify(registry, verifier, company))
        .to.emit(registry, "CompanyVerified")
        .withArgs(company.address, true, verifier.address);
      const kyb = await registry.getCompanyKyb(company.address);
      expect(kyb.verified).to.equal(true);
      expect(kyb.registeredAt).to.be.gt(0);

      await registry.connect(verifier).setCompanyVerified(company.address, false, ethers.ZeroHash);
      expect((await registry.getCompanyKyb(company.address)).verified).to.equal(false);
    });

    it("rejects callers without VERIFIER_ROLE, including the company itself", async function () {
      const { registry, company, stranger } = await loadFixture(deployFixture);
      await registerCompany(registry, company);
      const verifierRole = await registry.VERIFIER_ROLE();
      const missingRole = (account) =>
        `AccessControl: account ${account.address.toLowerCase()} is missing role ${verifierRole}`;
      const h = await registry.profileHashOf(company.address);
      await expect(registry.connect(company).setCompanyVerified(company.address, true, h)).to.be.revertedWith(
        missingRole(company)
      );
      await expect(registry.connect(stranger).setCompanyVerified(company.address, true, h)).to.be.revertedWith(
        missingRole(stranger)
      );
      expect((await registry.getCompanyKyb(company.address)).verified).to.equal(false);
    });

    it("rejects verifying an address that is not a company", async function () {
      const { registry, verifier, stranger } = await loadFixture(deployFixture);
      await expect(
        registry.connect(verifier).setCompanyVerified(stranger.address, true, ethers.ZeroHash)
      ).to.be.revertedWith("Not a company");
    });

    it("[AUD-REGISTRY-02] verified resets on name, contact, legal ID and emissions changes", async function () {
      const { registry, company, verifier } = await loadFixture(deployFixture);
      await registerCompany(registry, company);

      const changes = {
        name: () => registry.connect(company).updateCompanyProfile("Tesla Inc", "NIB-123", CONTACT),
        contact: () => registry.connect(company).updateCompanyProfile("Acme Corp", "NIB-123", contactHash("evil@x", "0")),
        legalId: () => registry.connect(company).updateCompanyProfile("Acme Corp", "OTHER-1", CONTACT),
        emissions: () => registry.connect(company).updateEmissions(0, 0, 0),
      };
      for (const [label, change] of Object.entries(changes)) {
        await registry.connect(company).updateCompanyProfile("Acme Corp", "NIB-123", CONTACT);
        await registry.connect(company).updateEmissions(t(500), t(300), t(200));
        await verify(registry, verifier, company);
        expect((await registry.getCompanyKyb(company.address)).verified, `${label} pre`).to.equal(true);
        await change();
        expect((await registry.getCompanyKyb(company.address)).verified, `${label} post`).to.equal(false);
      }
    });

    it("[AUD-REGISTRY-02] a verifier approval is bound to the reviewed profile (no verify-after-edit race)", async function () {
      const { registry, company, verifier } = await loadFixture(deployFixture);
      await registerCompany(registry, company);
      const reviewed = await registry.profileHashOf(company.address);
      // company front-runs the verifier's tx with a rename
      await registry.connect(company).updateCompanyProfile("Tesla Inc", "NIB-123", CONTACT);
      await expect(
        registry.connect(verifier).setCompanyVerified(company.address, true, reviewed)
      ).to.be.revertedWith("Profile changed");
      expect((await registry.getCompanyKyb(company.address)).verified).to.equal(false);
    });

    it("[AUD-REGISTRY-03] a legal ID can be verified for one wallet only (case/format-insensitive, first verified wins)", async function () {
      const { registry, company, company2, verifier } = await loadFixture(deployFixture);
      await registerCompany(registry, company);
      // impostor registers the same legal ID in another format: registration is allowed...
      await registerCompany(registry, company2, { name: "Acme Corp", legalId: "nib 123" });
      await verify(registry, verifier, company);
      expect(await registry.verifiedOwnerOfLegalId("NIB-123")).to.equal(company.address);
      expect(await registry.verifiedOwnerOfLegalId("nib123")).to.equal(company.address);
      // ... but cannot be verified while the first holder keeps the verification
      await expect(verify(registry, verifier, company2)).to.be.revertedWith("Legal ID already verified");
      expect((await registry.getCompanyKyb(company2.address)).verified).to.equal(false);

      // verifier revokes the first holder: the id is released and can move to the other wallet
      await registry.connect(verifier).setCompanyVerified(company.address, false, ethers.ZeroHash);
      expect(await registry.verifiedOwnerOfLegalId("NIB-123")).to.equal(ethers.ZeroAddress);
      await verify(registry, verifier, company2);
      expect(await registry.verifiedOwnerOfLegalId("NIB-123")).to.equal(company2.address);
    });

    it("an automatic reset (profile edit) releases the legal ID", async function () {
      const { registry, company, company2, verifier } = await loadFixture(deployFixture);
      await registerCompany(registry, company);
      await registerCompany(registry, company2, { name: "Acme Corp", legalId: "NIB-123" });
      await verify(registry, verifier, company);
      await registry.connect(company).updateEmissions(1, 1, 1);
      expect(await registry.verifiedOwnerOfLegalId("NIB-123")).to.equal(ethers.ZeroAddress);
      await verify(registry, verifier, company2);
      expect(await registry.verifiedOwnerOfLegalId("NIB-123")).to.equal(company2.address);
    });
  });

  describe("Pause", function () {
    it("only PAUSER_ROLE can pause and unpause", async function () {
      const { registry, stranger, admin } = await loadFixture(deployFixture);
      await expect(registry.connect(stranger).pause()).to.be.reverted;
      await registry.connect(admin).pause();
      expect(await registry.paused()).to.equal(true);
      await expect(registry.connect(stranger).unpause()).to.be.reverted;
      await registry.connect(admin).unpause();
      expect(await registry.paused()).to.equal(false);
    });

    it("blocks every state-changing entry point while paused", async function () {
      const { registry, admin, company, company2, trader, verifier } = await loadFixture(deployFixture);
      await registerCompany(registry, company);
      const h = await registry.profileHashOf(company.address);
      await registry.connect(admin).pause();

      await expect(registerCompany(registry, company2, { name: "B", legalId: "B" })).to.be.revertedWith(
        "Pausable: paused"
      );
      await expect(registerTrader(registry, trader)).to.be.revertedWith("Pausable: paused");
      await expect(registry.connect(company).updateEmissions(1, 1, 1)).to.be.revertedWith("Pausable: paused");
      await expect(registry.connect(company).setEmissionTarget(1)).to.be.revertedWith("Pausable: paused");
      await expect(registry.connect(company).updateCompanyProfile("A", "B", CONTACT)).to.be.revertedWith(
        "Pausable: paused"
      );
      await expect(registry.connect(verifier).setCompanyVerified(company.address, true, h)).to.be.revertedWith(
        "Pausable: paused"
      );

      await registry.connect(admin).unpause();
      await registry.connect(company).updateEmissions(1, 1, 1);
    });
  });
});
