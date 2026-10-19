const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { configure } = require("../helpers/oracle");

describe("EmissionVerifier - Unit Tests", function () {
  
  async function deployVerifierFixture() {
    const [owner, registrar, projectOwner, automationRegistry] = await ethers.getSigners();

    // Deploy NFT
    const CarbonCreditNFT = await ethers.getContractFactory("CarbonCreditNFT");
    const nft = await CarbonCreditNFT.deploy();
    await nft.waitForDeployment();

    // Deploy Mock Functions Router
    const MockFunctionsRouter = await ethers.getContractFactory("MockFunctionsRouter");
    const functionsRouter = await MockFunctionsRouter.deploy();
    await functionsRouter.waitForDeployment();

    // Deploy EmissionVerifier
    const EmissionVerifier = await ethers.getContractFactory("EmissionVerifier");
    const verifier = await EmissionVerifier.deploy(
      await functionsRouter.getAddress(),
      await nft.getAddress()
    );
    await verifier.waitForDeployment();
    await configure(verifier, "emission"); // DON id + subscription + reference source

    // Grant roles
    const NATIVE_ISSUER_ROLE = await nft.NATIVE_ISSUER_ROLE();
    await nft.grantRole(NATIVE_ISSUER_ROLE, await verifier.getAddress());

    const PROJECT_REGISTRAR_ROLE = await verifier.PROJECT_REGISTRAR_ROLE();
    await verifier.grantRole(PROJECT_REGISTRAR_ROLE, registrar.address);
    // deactivateProject / requestVerification are VERIFIER_ROLE operations (registrar doubles as ops account)
    await verifier.grantRole(await verifier.VERIFIER_ROLE(), registrar.address);

    const AUTOMATION_ROLE = await verifier.AUTOMATION_ROLE();
    await verifier.grantRole(AUTOMATION_ROLE, automationRegistry.address);

    return { verifier, nft, functionsRouter, owner, registrar, projectOwner, automationRegistry };
  }

  // ============ PROJECT REGISTRATION TESTS ============
  describe("Project Registration", function () {
    it("Should register a new project", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);

      const tx = await verifier.connect(registrar).registerProject(
        "PROJECT_SOLAR_001",
        projectOwner.address,
        "VERRA_VCS",
        ethers.parseUnits("10000", 18), // 10,000 tonnes baseline
        30, // 30% reduction target
        30 * 24 * 60 * 60, // 30 days interval
        "https://iot-api.carb.example/sensors",
        "https://sat-api.carb.example/{projectId}", // optional cross-check URL template
        ethers.keccak256(ethers.toUtf8Bytes("ACVA_SIGNATURE"))
      );

      await expect(tx)
        .to.emit(verifier, "ProjectRegistered")
        .withArgs("PROJECT_SOLAR_001", projectOwner.address, ethers.parseUnits("10000", 18), 30);

      const project = await verifier.getProject("PROJECT_SOLAR_001");
      expect(project.projectId).to.equal("PROJECT_SOLAR_001");
      expect(project.owner).to.equal(projectOwner.address);
      expect(project.methodology).to.equal("VERRA_VCS");
      expect(project.isActive).to.be.true;
    });

    it("Should reject registration without PROJECT_REGISTRAR_ROLE", async function () {
      const { verifier, projectOwner } = await loadFixture(deployVerifierFixture);

      await expect(
        verifier.connect(projectOwner).registerProject(
          "PROJECT_001",
          projectOwner.address,
          "VERRA_VCS",
          ethers.parseUnits("10000", 18),
          30,
          30 * 24 * 60 * 60,
          "https://iot-api.carb.example",
          "https://sat-api.carb.example/{projectId}",
          ethers.keccak256(ethers.toUtf8Bytes("sig"))
        )
      ).to.be.reverted;
    });

    it("Should reject invalid baseline emissions", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);

      await expect(
        verifier.connect(registrar).registerProject(
          "PROJECT_001",
          projectOwner.address,
          "VERRA_VCS",
          0, // Invalid
          30,
          30 * 24 * 60 * 60,
          "https://iot-api.carb.example",
          "https://sat-api.carb.example/{projectId}",
          ethers.keccak256(ethers.toUtf8Bytes("sig"))
        )
      ).to.be.revertedWith("Invalid baseline");
    });

    it("Should reject invalid target reduction", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);

      await expect(
        verifier.connect(registrar).registerProject(
          "PROJECT_001",
          projectOwner.address,
          "VERRA_VCS",
          ethers.parseUnits("10000", 18),
          150, // >100%
          30 * 24 * 60 * 60,
          "https://iot-api.carb.example",
          "https://sat-api.carb.example/{projectId}",
          ethers.keccak256(ethers.toUtf8Bytes("sig"))
        )
      ).to.be.revertedWith("Invalid target");
    });

    it("Should prevent duplicate project registration", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);

      await verifier.connect(registrar).registerProject(
        "PROJECT_001",
        projectOwner.address,
        "VERRA_VCS",
        ethers.parseUnits("10000", 18),
        30,
        30 * 24 * 60 * 60,
        "https://iot-api.carb.example",
        "https://sat-api.carb.example/{projectId}",
        ethers.keccak256(ethers.toUtf8Bytes("sig"))
      );

      await expect(
        verifier.connect(registrar).registerProject(
          "PROJECT_001",
          projectOwner.address,
          "VERRA_VCS",
          ethers.parseUnits("5000", 18),
          20,
          30 * 24 * 60 * 60,
          "https://iot-api.carb.example",
          "https://sat-api.carb.example/{projectId}",
          ethers.keccak256(ethers.toUtf8Bytes("sig"))
        )
      ).to.be.revertedWith("Project already registered");
    });
  });

  // ============ CHAINLINK AUTOMATION TESTS ============
  describe("Chainlink Automation", function () {
    it("Should detect project needing verification", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);

      await verifier.connect(registrar).registerProject(
        "PROJECT_001",
        projectOwner.address,
        "VERRA_VCS",
        ethers.parseUnits("10000", 18),
        30,
        30 * 24 * 60 * 60,
        "https://iot-api.carb.example",
        "https://sat-api.carb.example/{projectId}",
        ethers.keccak256(ethers.toUtf8Bytes("sig"))
      );

      // Fast forward past verification interval
      await time.increase(31 * 24 * 60 * 60);

      const [upkeepNeeded, performData] = await verifier.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.true;
      
      const projectsToVerify = ethers.AbiCoder.defaultAbiCoder().decode(["string[]"], performData);
      expect(projectsToVerify[0][0]).to.equal("PROJECT_001");
    });

    it("Should not trigger upkeep before interval", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);

      await verifier.connect(registrar).registerProject(
        "PROJECT_001",
        projectOwner.address,
        "VERRA_VCS",
        ethers.parseUnits("10000", 18),
        30,
        30 * 24 * 60 * 60,
        "https://iot-api.carb.example",
        "https://sat-api.carb.example/{projectId}",
        ethers.keccak256(ethers.toUtf8Bytes("sig"))
      );

      const [upkeepNeeded] = await verifier.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.false;
    });

    it("Should perform upkeep and trigger verification", async function () {
      const { verifier, registrar, projectOwner, automationRegistry } = await loadFixture(deployVerifierFixture);

      await verifier.connect(registrar).registerProject(
        "PROJECT_001",
        projectOwner.address,
        "VERRA_VCS",
        ethers.parseUnits("10000", 18),
        30,
        30 * 24 * 60 * 60,
        "https://iot-api.carb.example",
        "https://sat-api.carb.example/{projectId}",
        ethers.keccak256(ethers.toUtf8Bytes("sig"))
      );

      await time.increase(31 * 24 * 60 * 60);

      const [, performData] = await verifier.checkUpkeep("0x");
      
      const tx = await verifier.connect(automationRegistry).performUpkeep(performData);
      await expect(tx).to.emit(verifier, "VerificationRequested");
    });
  });

  // ============ PROJECT DEACTIVATION TESTS ============
  describe("Project Management", function () {
    it("Should deactivate a project", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);

      await verifier.connect(registrar).registerProject(
        "PROJECT_001",
        projectOwner.address,
        "VERRA_VCS",
        ethers.parseUnits("10000", 18),
        30,
        30 * 24 * 60 * 60,
        "https://iot-api.carb.example",
        "https://sat-api.carb.example/{projectId}",
        ethers.keccak256(ethers.toUtf8Bytes("sig"))
      );

      const tx = await verifier.connect(registrar).deactivateProject("PROJECT_001", "Fraud detected");
      await expect(tx).to.emit(verifier, "ProjectDeactivated").withArgs("PROJECT_001", "Fraud detected");

      const project = await verifier.getProject("PROJECT_001");
      expect(project.isActive).to.be.false;
    });

    it("Should not include deactivated projects in upkeep", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);

      await verifier.connect(registrar).registerProject(
        "PROJECT_001",
        projectOwner.address,
        "VERRA_VCS",
        ethers.parseUnits("10000", 18),
        30,
        30 * 24 * 60 * 60,
        "https://iot-api.carb.example",
        "https://sat-api.carb.example/{projectId}",
        ethers.keccak256(ethers.toUtf8Bytes("sig"))
      );

      await verifier.connect(registrar).deactivateProject("PROJECT_001", "Completed");
      await time.increase(31 * 24 * 60 * 60);

      const [upkeepNeeded] = await verifier.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.false;
    });
  });

  // ============ VIEW FUNCTION TESTS ============
  describe("View Functions", function () {
    it("Should return project details", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);

      await verifier.connect(registrar).registerProject(
        "PROJECT_SOLAR_DELHI",
        projectOwner.address,
        "VERRA_VCS",
        ethers.parseUnits("10000", 18),
        30,
        30 * 24 * 60 * 60,
        "https://iot-api.carb.example/sensors",
        "https://sat-api.carb.example/{projectId}",
        ethers.keccak256(ethers.toUtf8Bytes("ACVA_SIG"))
      );

      const project = await verifier.getProject("PROJECT_SOLAR_DELHI");
      expect(project.methodology).to.equal("VERRA_VCS");
      expect(project.iotEndpoint).to.equal("https://iot-api.carb.example/sensors");
      expect(project.satelliteRegion).to.equal("https://sat-api.carb.example/{projectId}");
    });

    it("Should count active projects", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);

      await verifier.connect(registrar).registerProject(
        "PROJECT_001",
        projectOwner.address,
        "VERRA_VCS",
        ethers.parseUnits("10000", 18),
        30,
        30 * 24 * 60 * 60,
        "https://iot-api.carb.example",
        "https://sat-api.carb.example/{projectId}",
        ethers.keccak256(ethers.toUtf8Bytes("sig"))
      );

      await verifier.connect(registrar).registerProject(
        "PROJECT_002",
        projectOwner.address,
        "GOLD_STANDARD",
        ethers.parseUnits("5000", 18),
        25,
        30 * 24 * 60 * 60,
        "https://iot-api.carb.example",
        "https://sat-api.carb.example/{projectId}",
        ethers.keccak256(ethers.toUtf8Bytes("sig2"))
      );

      const count = await verifier.getActiveProjectCount();
      expect(count).to.equal(2);
    });
  });

  // ============ CONFIGURATION TESTS ============
  describe("Chainlink Configuration", function () {
    it("Should update Functions config", async function () {
      const { verifier, owner } = await loadFixture(deployVerifierFixture);

      const donId = ethers.encodeBytes32String("fun-polygon-mumbai-1");
      const subscriptionId = 123;
      const gasLimit = 300000;

      await verifier.connect(owner).setFunctionsConfig(donId, subscriptionId, gasLimit);

      expect(await verifier.donId()).to.equal(donId);
      expect(await verifier.subscriptionId()).to.equal(subscriptionId);
      expect(await verifier.gasLimit()).to.equal(gasLimit);
    });

    it("Should update the source code (setSource) and expose its hash", async function () {
      const { verifier, owner } = await loadFixture(deployVerifierFixture);

      const newSource = "return Functions.encodeUint256(1n);";
      const hash = ethers.keccak256(ethers.toUtf8Bytes(newSource));
      await expect(verifier.connect(owner).setSource(newSource))
        .to.emit(verifier, "SourceUpdated")
        .withArgs(hash, newSource.length);
      expect(await verifier.source()).to.equal(newSource);
      expect(await verifier.sourceHash()).to.equal(hash);
    });
    it("Should enforce gas limit bounds and emit FunctionsConfigUpdated", async function () {
      const { verifier, owner } = await loadFixture(deployVerifierFixture);
      const donId = ethers.encodeBytes32String("don");

      await expect(verifier.connect(owner).setFunctionsConfig(donId, 1, 199999)).to.be.revertedWith("Gas limit out of bounds");
      await expect(verifier.connect(owner).setFunctionsConfig(donId, 1, 1000001)).to.be.revertedWith("Gas limit out of bounds");
      await expect(verifier.connect(owner).setFunctionsConfig(donId, 1, 500000))
        .to.emit(verifier, "FunctionsConfigUpdated")
        .withArgs(donId, 1, 500000);
    });
  });

  describe("Project validation", function () {
    const args = (over = {}) => [
      over.id ?? "PROJECT_X",
      over.owner,
      over.methodology ?? "VERRA_VCS",
      over.baseline ?? ethers.parseUnits("1000", 18),
      over.target ?? 30,
      over.interval ?? 30 * 24 * 60 * 60,
      "https://iot-api.carb.example",
      "https://sat-api.carb.example/{projectId}",
      ethers.keccak256(ethers.toUtf8Bytes("sig")),
    ];

    it("Should bound baseline, interval and methodology", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);
      const o = projectOwner.address;
      const max = await verifier.MAX_BASELINE();
      await expect(verifier.connect(registrar).registerProject(...args({ owner: o, baseline: max + 1n }))).to.be.revertedWith("Invalid baseline");
      await expect(verifier.connect(registrar).registerProject(...args({ owner: o, interval: 3600 }))).to.be.revertedWith("Invalid interval");
      await expect(verifier.connect(registrar).registerProject(...args({ owner: o, interval: 366 * 24 * 3600 }))).to.be.revertedWith("Invalid interval");
      await expect(verifier.connect(registrar).registerProject(...args({ owner: o, methodology: "" }))).to.be.revertedWith("Invalid methodology");
      await verifier.connect(registrar).registerProject(...args({ owner: o, baseline: max, interval: 0 }));
      expect((await verifier.getProject("PROJECT_X")).verificationInterval).to.equal(30 * 24 * 3600);
    });

    it("Should never allow re-registering a project id, even after deactivation", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);
      await verifier.connect(registrar).registerProject(...args({ owner: projectOwner.address }));
      await verifier.connect(registrar).deactivateProject("PROJECT_X", "done");
      await expect(
        verifier.connect(registrar).registerProject(...args({ owner: projectOwner.address }))
      ).to.be.revertedWith("Project already registered");
    });

    it("Should reject manual verification before the interval elapsed", async function () {
      const { verifier, registrar, projectOwner } = await loadFixture(deployVerifierFixture);
      await verifier.connect(registrar).registerProject(...args({ owner: projectOwner.address }));
      await expect(verifier.connect(registrar).requestVerification("PROJECT_X")).to.be.revertedWith(
        "Verification interval not elapsed"
      );
    });
  });
});
