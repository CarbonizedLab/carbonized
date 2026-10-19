const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("CarbonCreditNFT - Unit Tests", function () {
  
  // ============ FIXTURES ============
  async function deployNFTFixture() {
    const [owner, issuer, verifier, user1, user2] = await ethers.getSigners();

    const CarbonCreditNFT = await ethers.getContractFactory("CarbonCreditNFT");
    const nft = await CarbonCreditNFT.deploy();
    await nft.waitForDeployment();

    // Grant roles
    const NATIVE_ISSUER_ROLE = await nft.NATIVE_ISSUER_ROLE();
    const VERIFIER_ROLE = await nft.VERIFIER_ROLE();
    await nft.grantRole(NATIVE_ISSUER_ROLE, issuer.address);
    await nft.grantRole(VERIFIER_ROLE, verifier.address);

    return { nft, owner, issuer, verifier, user1, user2, NATIVE_ISSUER_ROLE, VERIFIER_ROLE };
  }

  // ============ DEPLOYMENT TESTS ============
  describe("Deployment", function () {
    it("Should deploy with correct name and symbol", async function () {
      const { nft } = await loadFixture(deployNFTFixture);
      expect(await nft.name()).to.equal("Carbonized Credit");
      expect(await nft.symbol()).to.equal("CBZ");
    });

    it("Should grant DEFAULT_ADMIN_ROLE to deployer", async function () {
      const { nft, owner } = await loadFixture(deployNFTFixture);
      const DEFAULT_ADMIN_ROLE = await nft.DEFAULT_ADMIN_ROLE();
      expect(await nft.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("Should initialize with zero credits minted", async function () {
      const { nft } = await loadFixture(deployNFTFixture);
      const stats = await nft.getGlobalStats();
      expect(stats.minted).to.equal(0);
      expect(stats.retired).to.equal(0);
      expect(stats.active).to.equal(0);
    });
  });

  // ============ MINTING TESTS ============
  describe("Credit Minting", function () {
    it("Should mint a carbon credit with valid data", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      const tx = await nft.connect(issuer).mintCredit(
        user1.address,
        "PROJECT_001_SOLAR_RAJASTHAN",
        "Solar Energy Project",
        "VCS-12345",
        "VERRA_VCS",
        ethers.parseUnits("1000", 18), // 1000 tonnes
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("oracle_proof")),
        "QmSatelliteData123",
        "ipfs://QmMetadata123"
      );

      await expect(tx)
        .to.emit(nft, "CreditMinted")
        .withArgs(1, "PROJECT_001_SOLAR_RAJASTHAN", user1.address, ethers.parseUnits("1000", 18), "VERRA_VCS");

      expect(await nft.ownerOf(1)).to.equal(user1.address);
    });

    it("Should prevent non-issuer from minting", async function () {
      const { nft, user1 } = await loadFixture(deployNFTFixture);

      await expect(
        nft.connect(user1).mintCredit(
          user1.address,
          "PROJECT_001",
          "Test",
          "VCS-12345",
          "VERRA_VCS",
          ethers.parseUnits("1000", 18),
          2024,
          "IN",
          ethers.keccak256(ethers.toUtf8Bytes("proof")),
          "cid",
          "ipfs://uri"
        )
      ).to.be.reverted;
    });

    it("Should prevent double-counting (same serial number)", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      await nft.connect(issuer).mintCredit(
        user1.address,
        "PROJECT_001",
        "Test",
        "VCS-12345",
        "VERRA_VCS",
        ethers.parseUnits("1000", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "cid",
        "ipfs://uri"
      );

      await expect(
        nft.connect(issuer).mintCredit(
          user1.address,
          "PROJECT_002",
          "Test",
          "VCS-12345", // Same serial
          "VERRA_VCS",
          ethers.parseUnits("500", 18),
          2024,
          "IN",
          ethers.keccak256(ethers.toUtf8Bytes("proof")),
          "cid",
          "ipfs://uri2"
        )
      ).to.be.revertedWith("Credit already tokenized");
    });

    it("Should reject invalid vintage year", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      await expect(
        nft.connect(issuer).mintCredit(
          user1.address,
          "PROJECT_001",
          "Test",
          "VCS-12345",
          "VERRA_VCS",
          ethers.parseUnits("1000", 18),
          2010, // Too old
          "IN",
          ethers.keccak256(ethers.toUtf8Bytes("proof")),
          "cid",
          "ipfs://uri"
        )
      ).to.be.revertedWith("Invalid vintage year");
    });

    it("Should update global statistics after minting", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      await nft.connect(issuer).mintCredit(
        user1.address,
        "PROJECT_001",
        "Test",
        "VCS-12345",
        "VERRA_VCS",
        ethers.parseUnits("1000", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "cid",
        "ipfs://uri"
      );

      const stats = await nft.getGlobalStats();
      expect(stats.minted).to.equal(ethers.parseUnits("1000", 18));
      expect(stats.active).to.equal(1);
      expect(stats.totalTokens).to.equal(1);
    });
  });

  // ============ BATCH MINTING TESTS ============
  describe("Batch Minting", function () {
    it("Should batch mint multiple credits", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      const credits = [
        {
          projectName: "Credit 1",
          serialNumber: "VCS-001",
          methodology: "VERRA_VCS",
          co2Tonnes: ethers.parseUnits("100", 18),
          vintageYear: 2024,
          geography: "IN",
          oracleProofHash: ethers.keccak256(ethers.toUtf8Bytes("proof1")),
          satelliteDataCID: "cid1",
          tokenURI: "ipfs://uri1",
        },
        {
          projectName: "Credit 2",
          serialNumber: "VCS-002",
          methodology: "VERRA_VCS",
          co2Tonnes: ethers.parseUnits("200", 18),
          vintageYear: 2024,
          geography: "IN",
          oracleProofHash: ethers.keccak256(ethers.toUtf8Bytes("proof2")),
          satelliteDataCID: "cid2",
          tokenURI: "ipfs://uri2",
        },
      ];

      const tx = await nft.connect(issuer).batchMint(
        user1.address,
        "PROJECT_BATCH",
        credits
      );

      await expect(tx).to.emit(nft, "CreditBatchMinted");

      expect(await nft.ownerOf(1)).to.equal(user1.address);
      expect(await nft.ownerOf(2)).to.equal(user1.address);

      const stats = await nft.getGlobalStats();
      expect(stats.active).to.equal(2);
    });

    it("Should reject batch with duplicate serials", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      const credits = [
        {
          projectName: "Credit 1",
          serialNumber: "VCS-001",
          methodology: "VERRA_VCS",
          co2Tonnes: ethers.parseUnits("100", 18),
          vintageYear: 2024,
          geography: "IN",
          oracleProofHash: ethers.keccak256(ethers.toUtf8Bytes("proof1")),
          satelliteDataCID: "cid1",
          tokenURI: "ipfs://uri1",
        },
        {
          projectName: "Credit 2",
          serialNumber: "VCS-001", // Duplicate
          methodology: "VERRA_VCS",
          co2Tonnes: ethers.parseUnits("200", 18),
          vintageYear: 2024,
          geography: "IN",
          oracleProofHash: ethers.keccak256(ethers.toUtf8Bytes("proof2")),
          satelliteDataCID: "cid2",
          tokenURI: "ipfs://uri2",
        },
      ];

      await expect(
        nft.connect(issuer).batchMint(user1.address, "PROJECT_BATCH", credits)
      ).to.be.revertedWith("Credit already tokenized");
    });
  });

  // ============ RETIREMENT TESTS ============
  describe("Credit Retirement", function () {
    it("Should retire a credit and burn NFT", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      await nft.connect(issuer).mintCredit(
        user1.address,
        "PROJECT_001",
        "Test",
        "VCS-12345",
        "VERRA_VCS",
        ethers.parseUnits("1000", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "cid",
        "ipfs://uri"
      );

      const tx = await nft.connect(user1).retireCredit(1, "Q1 2026 Corporate Offset");

      await expect(tx)
        .to.emit(nft, "CreditRetired")
        .withArgs(1, user1.address, await ethers.provider.getBlock("latest").then(b => b.timestamp), ethers.parseUnits("1000", 18), "Q1 2026 Corporate Offset");

      // NFT should be burned
      await expect(nft.ownerOf(1)).to.be.reverted;

      const stats = await nft.getGlobalStats();
      expect(stats.retired).to.equal(ethers.parseUnits("1000", 18));
      expect(stats.active).to.equal(0);
    });

    it("Should prevent non-owner from retiring", async function () {
      const { nft, issuer, user1, user2 } = await loadFixture(deployNFTFixture);

      await nft.connect(issuer).mintCredit(
        user1.address,
        "PROJECT_001",
        "Test",
        "VCS-12345",
        "VERRA_VCS",
        ethers.parseUnits("1000", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "cid",
        "ipfs://uri"
      );

      await expect(
        nft.connect(user2).retireCredit(1, "Unauthorized retirement")
      ).to.be.revertedWith("Not credit owner");
    });

    it("Should create retirement certificate", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      await nft.connect(issuer).mintCredit(
        user1.address,
        "PROJECT_001",
        "Test",
        "VCS-12345",
        "VERRA_VCS",
        ethers.parseUnits("1000", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "cid",
        "ipfs://uri"
      );

      await nft.connect(user1).retireCredit(1, "Q1 2026 Corporate Offset");

      const certificate = await nft.getRetirementCertificate(1);
      expect(certificate.retiredBy).to.equal(user1.address);
      expect(certificate.co2Tonnes).to.equal(ethers.parseUnits("1000", 18));
      expect(certificate.retirementReason).to.equal("Q1 2026 Corporate Offset");
    });

    it("Should prevent double retirement", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      await nft.connect(issuer).mintCredit(
        user1.address,
        "PROJECT_001",
        "Test",
        "VCS-12345",
        "VERRA_VCS",
        ethers.parseUnits("1000", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "cid",
        "ipfs://uri"
      );

      await nft.connect(user1).retireCredit(1, "First retirement");

      // NFT is burned, so ownerOf will revert
      await expect(nft.ownerOf(1)).to.be.reverted;
    });
  });

  // ============ BATCH RETIREMENT TESTS ============
  describe("Batch Retirement", function () {
    it("Should batch retire multiple credits", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      // Mint 3 credits
      for (let i = 1; i <= 3; i++) {
        await nft.connect(issuer).mintCredit(
          user1.address,
          `PROJECT_00${i}`,
          "Test",
          `VCS-1234${i}`,
          "VERRA_VCS",
          ethers.parseUnits("100", 18),
          2024,
          "IN",
          ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
          "cid",
          "ipfs://uri"
        );
      }

      await nft.connect(user1).batchRetire([1, 2, 3], "Batch Q1 2026 Offset");

      const stats = await nft.getGlobalStats();
      expect(stats.retired).to.equal(ethers.parseUnits("300", 18));
      expect(stats.active).to.equal(0);
    });
  });

  // ============ VIEW FUNCTION TESTS ============
  describe("View Functions", function () {
    it("Should return credit details", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      await nft.connect(issuer).mintCredit(
        user1.address,
        "PROJECT_001",
        "Solar Project",
        "VCS-12345",
        "VERRA_VCS",
        ethers.parseUnits("1000", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "QmSat123",
        "ipfs://uri"
      );

      const credit = await nft.getCreditDetails(1);
      expect(credit.projectId).to.equal("PROJECT_001");
      expect(credit.projectName).to.equal("Solar Project");
      expect(credit.methodology).to.equal("VERRA_VCS");
      expect(credit.co2Tonnes).to.equal(ethers.parseUnits("1000", 18));
    });

    it("Should check if serial is tokenized", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      await nft.connect(issuer).mintCredit(
        user1.address,
        "PROJECT_001",
        "Test",
        "VCS-12345",
        "VERRA_VCS",
        ethers.parseUnits("1000", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "cid",
        "ipfs://uri"
      );

      expect(await nft.isSerialTokenized("VERRA_VCS", "VCS-12345")).to.be.true;
      expect(await nft.isSerialTokenized("VERRA_VCS", "VCS-99999")).to.be.false;
    });
  });

  // ============ PAUSABLE TESTS ============
  describe("Emergency Pause", function () {
    it("Should pause and prevent minting", async function () {
      const { nft, owner, issuer, user1 } = await loadFixture(deployNFTFixture);

      await nft.connect(owner).pause();

      await expect(
        nft.connect(issuer).mintCredit(
          user1.address,
          "PROJECT_001",
          "Test",
          "VCS-12345",
          "VERRA_VCS",
          ethers.parseUnits("1000", 18),
          2024,
          "IN",
          ethers.keccak256(ethers.toUtf8Bytes("proof")),
          "cid",
          "ipfs://uri"
        )
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should unpause and resume operations", async function () {
      const { nft, owner, issuer, user1 } = await loadFixture(deployNFTFixture);

      await nft.connect(owner).pause();
      await nft.connect(owner).unpause();

      await expect(
        nft.connect(issuer).mintCredit(
          user1.address,
          "PROJECT_001",
          "Test",
          "VCS-12345",
          "VERRA_VCS",
          ethers.parseUnits("1000", 18),
          2024,
          "IN",
          ethers.keccak256(ethers.toUtf8Bytes("proof")),
          "cid",
          "ipfs://uri"
        )
      ).to.not.be.reverted;
    });
  });

  // ============ ACCESS CONTROL TESTS ============
  describe("Access Control", function () {
    it("Should grant and revoke NATIVE_ISSUER_ROLE", async function () {
      const { nft, owner, user1, NATIVE_ISSUER_ROLE } = await loadFixture(deployNFTFixture);

      await nft.connect(owner).grantRole(NATIVE_ISSUER_ROLE, user1.address);
      expect(await nft.hasRole(NATIVE_ISSUER_ROLE, user1.address)).to.be.true;

      await nft.connect(owner).revokeRole(NATIVE_ISSUER_ROLE, user1.address);
      expect(await nft.hasRole(NATIVE_ISSUER_ROLE, user1.address)).to.be.false;
    });
  });

  // ============ HARDENING (audit nft) ============
  describe("Hardening", function () {
    const proof = ethers.keccak256(ethers.toUtf8Bytes("proof"));
    const mint = (nft, issuer, to, serial, over = {}) =>
      nft.connect(issuer).mintCredit(
        to.address, "PROJECT_H", "Test", serial, over.methodology ?? "VERRA_VCS",
        over.tonnes ?? ethers.parseUnits("1", 18), over.vintage ?? 2024, "IN",
        over.proof ?? proof, "cid", "ipfs://uri"
      );

    it("Should not expose any public/faucet minting function", async function () {
      const { nft } = await loadFixture(deployNFTFixture);
      for (const fn of ["registerAndClaimCredits", "mintSimpleCredits", "hasRegistered"]) {
        expect(nft.interface.getFunction(fn)).to.equal(null);
      }
    });

    it("Should reject empty serial, empty methodology, zero tonnes and oversize tonnes", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);
      await expect(mint(nft, issuer, user1, "")).to.be.revertedWith("Serial required");
      await expect(mint(nft, issuer, user1, "S1", { methodology: "" })).to.be.revertedWith("Methodology required");
      await expect(mint(nft, issuer, user1, "S1", { tonnes: 0 })).to.be.revertedWith("Invalid CO2 amount");
      await expect(
        mint(nft, issuer, user1, "S1", { tonnes: (await nft.MAX_TONNES_PER_CREDIT()) + 1n })
      ).to.be.revertedWith("Invalid CO2 amount");
    });

    it("Should treat serials as case/whitespace/methodology independent", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);
      await mint(nft, issuer, user1, "VCS-9");
      await expect(mint(nft, issuer, user1, " vcs-9 ", { methodology: "GOLD_STANDARD" })).to.be.revertedWith(
        "Credit already tokenized"
      );
      expect(await nft.isSerialTokenized("GOLD_STANDARD", "Vcs-9")).to.equal(true);
    });

    it("Should reject a zero oracle proof in updateVerification", async function () {
      const { nft, owner, issuer, user1 } = await loadFixture(deployNFTFixture);
      await mint(nft, issuer, user1, "VCS-10");
      await nft.grantRole(await nft.ORACLE_ROLE(), owner.address);
      await expect(nft.updateVerification(1, ethers.ZeroHash, "c")).to.be.revertedWith("Oracle proof required");
      await expect(nft.updateVerification(1, ethers.keccak256("0x02"), "c2")).to.emit(nft, "VerificationUpdated");
      expect((await nft.getCreditDetails(1)).satelliteDataCID).to.equal("c2");
    });

    it("Should keep minted == retired + active tonnes through retirements", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);
      await mint(nft, issuer, user1, "VCS-11");
      await mint(nft, issuer, user1, "VCS-12");
      await nft.connect(user1).retireCredit(1, "r");
      const s = await nft.getGlobalStats();
      expect(s.minted).to.equal(ethers.parseUnits("2", 18));
      expect(s.retired).to.equal(ethers.parseUnits("1", 18));
      expect(s.active).to.equal(1);
    });
  });

  // ============ GAS OPTIMIZATION TESTS ============
  describe("Gas Optimization", function () {
    it("Should compare single vs batch minting gas costs", async function () {
      const { nft, issuer, user1 } = await loadFixture(deployNFTFixture);

      // Single minting
      const singleTx = await nft.connect(issuer).mintCredit(
        user1.address,
        "PROJECT_SINGLE",
        "Test",
        "VCS-SINGLE",
        "VERRA_VCS",
        ethers.parseUnits("100", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "cid",
        "ipfs://uri"
      );
      const singleReceipt = await singleTx.wait();
      const singleGas = singleReceipt.gasUsed;

      // Batch minting (3 credits)
      const credits = Array(3).fill(0).map((_, i) => ({
        projectName: `Credit ${i}`,
        serialNumber: `VCS-BATCH-${i}`,
        methodology: "VERRA_VCS",
        co2Tonnes: ethers.parseUnits("100", 18),
        vintageYear: 2024,
        geography: "IN",
        oracleProofHash: ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
        satelliteDataCID: `cid${i}`,
        tokenURI: `ipfs://uri${i}`,
      }));

      const batchTx = await nft.connect(issuer).batchMint(
        user1.address,
        "PROJECT_BATCH",
        credits
      );
      const batchReceipt = await batchTx.wait();
      const batchGas = batchReceipt.gasUsed;

      console.log(`      Single mint gas: ${singleGas}`);
      console.log(`      Batch mint gas: ${batchGas}`);
      console.log(`      Gas per credit (batch): ${batchGas / BigInt(3)}`);
      console.log(`      Savings: ${((1 - Number(batchGas / BigInt(3)) / Number(singleGas)) * 100).toFixed(2)}%`);

      // Batch should be more efficient
      expect(batchGas / BigInt(3)).to.be.lessThan(singleGas);
    });
  });
});
