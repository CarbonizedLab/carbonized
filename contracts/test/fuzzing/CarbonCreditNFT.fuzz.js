const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("CarbonCreditNFT - Fuzzing Tests", function () {
  
  async function deployNFTFixture() {
    const [owner, issuer, user] = await ethers.getSigners();

    const CarbonCreditNFT = await ethers.getContractFactory("CarbonCreditNFT");
    const nft = await CarbonCreditNFT.deploy();
    await nft.waitForDeployment();

    const NATIVE_ISSUER_ROLE = await nft.NATIVE_ISSUER_ROLE();
    await nft.grantRole(NATIVE_ISSUER_ROLE, issuer.address);

    return { nft, owner, issuer, user };
  }

  // Effective per-transaction gas ceiling: min(block gas limit, EIP-7825 cap of 2^24 gas)
  async function txGasCap() {
    const blockLimit = (await ethers.provider.getBlock("latest")).gasLimit;
    const eip7825Cap = 2n ** 24n;
    return blockLimit < eip7825Cap ? blockLimit : eip7825Cap;
  }
  function buildCredits(prefix, count) {
    return Array(count).fill(0).map((_, i) => ({
      projectName: `Batch Credit ${i}`,
      serialNumber: `${prefix}-${i}`,
      methodology: "VERRA_VCS",
      co2Tonnes: ethers.parseUnits("100", 18),
      vintageYear: 2024,
      geography: "IN",
      oracleProofHash: ethers.keccak256(ethers.toUtf8Bytes(`${prefix}-proof${i}`)),
      satelliteDataCID: `cid${i}`,
      tokenURI: `ipfs://uri${i}`,
    }));
  }

  // ============ RANDOM INPUT FUZZING ============
  describe("Random Input Fuzzing", function () {
    it("Should handle random co2Tonnes values", async function () {
      const { nft, issuer, user } = await loadFixture(deployNFTFixture);

      const testCases = 100;
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < testCases; i++) {
        const randomTonnes = ethers.parseUnits(
          Math.floor(Math.random() * 100000).toString(),
          18
        );

        try {
          await nft.connect(issuer).mintCredit(
            user.address,
            `PROJECT_FUZZ_${i}`,
            "Fuzz Test",
            `FUZZ-${i}`,
            "VERRA_VCS",
            randomTonnes,
            2024,
            "IN",
            ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
            "cid",
            "ipfs://uri"
          );
          successCount++;
        } catch (error) {
          if (randomTonnes === BigInt(0)) {
            failCount++; // Expected to fail for 0 tonnes
          } else {
            throw error; // Unexpected failure
          }
        }
      }

      console.log(`      Success: ${successCount}/${testCases}`);
      console.log(`      Expected failures (0 tonnes): ${failCount}/${testCases}`);
      expect(successCount + failCount).to.equal(testCases);
    });

    it("Should handle random vintage years", async function () {
      const { nft, issuer, user } = await loadFixture(deployNFTFixture);

      const testCases = [
        { year: 2015, shouldPass: true },
        { year: 2020, shouldPass: true },
        { year: 2024, shouldPass: true },
        { year: 2030, shouldPass: true },
        { year: 2050, shouldPass: true },
        { year: 2000, shouldPass: false },
        { year: 2051, shouldPass: false },
        { year: 1990, shouldPass: false },
      ];

      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        
        if (testCase.shouldPass) {
          await expect(
            nft.connect(issuer).mintCredit(
              user.address,
              `PROJECT_YEAR_${i}`,
              "Test",
              `YEAR-${i}`,
              "VERRA_VCS",
              ethers.parseUnits("1000", 18),
              testCase.year,
              "IN",
              ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
              "cid",
              "ipfs://uri"
            )
          ).to.not.be.reverted;
        } else {
          await expect(
            nft.connect(issuer).mintCredit(
              user.address,
              `PROJECT_YEAR_${i}`,
              "Test",
              `YEAR-${i}`,
              "VERRA_VCS",
              ethers.parseUnits("1000", 18),
              testCase.year,
              "IN",
              ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
              "cid",
              "ipfs://uri"
            )
          ).to.be.revertedWith("Invalid vintage year");
        }
      }
    });

    it("Should handle random string inputs", async function () {
      const { nft, issuer, user } = await loadFixture(deployNFTFixture);

      const randomStrings = [
        "PROJECT_" + "A".repeat(100), // Long string
        "PROJECT_" + "🌍🔥💚", // Emoji
        "PROJECT_" + "\n\t", // Whitespace
        "PROJECT_" + "!@#$%^&*()", // Special chars
        "",
        "A",
      ];

      for (let i = 0; i < randomStrings.length; i++) {
        const projectId = randomStrings[i];
        
        if (projectId.length > 0) {
          await expect(
            nft.connect(issuer).mintCredit(
              user.address,
              projectId,
              "Test",
              `SERIAL-${i}`,
              "VERRA_VCS",
              ethers.parseUnits("1000", 18),
              2024,
              "IN",
              ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
              "cid",
              "ipfs://uri"
            )
          ).to.not.be.reverted;
        } else {
          // Empty string should fail validation
          await expect(
            nft.connect(issuer).mintCredit(
              user.address,
              projectId,
              "Test",
              `SERIAL-${i}`,
              "VERRA_VCS",
              ethers.parseUnits("1000", 18),
              2024,
              "IN",
              ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
              "cid",
              "ipfs://uri"
            )
          ).to.be.reverted;
        }
      }
    });
  });

  // ============ BATCH OPERATION STRESS TESTS ============
  describe("Batch Operation Stress Tests", function () {
    it("Should handle maximum batch size", async function () {
      this.timeout(300000);

      const { nft, issuer, user } = await loadFixture(deployNFTFixture);
      const blockGasLimit = await txGasCap();

      // batchMint costs ~0.49M gas per credit, so the contract cap (MAX_BATCH_MINT = 100) cannot fit in one transaction (EIP-7825 cap 2^24).
      // The realistic maximum is derived from the measured per-credit gas with 10% headroom.
      const probe = await (await nft.connect(issuer).batchMint(user.address, "PROJECT_PROBE", buildCredits("PROBE", 5))).wait();
      const perCredit = probe.gasUsed / 5n;
      const maxBatchSize = Number((blockGasLimit * 9n) / 10n / perCredit);
      expect(maxBatchSize).to.be.greaterThan(10);
      expect(maxBatchSize).to.be.lessThan(Number(await nft.MAX_BATCH_MINT()));

      const receipt = await (
        await nft.connect(issuer).batchMint(user.address, "PROJECT_MAX_BATCH", buildCredits("BATCH-MAX", maxBatchSize))
      ).wait();
      expect(receipt.gasUsed).to.be.lessThan(blockGasLimit);

      const stats = await nft.getGlobalStats();
      expect(stats.active).to.equal(maxBatchSize + 5);

      // The contract cap itself (100) passes validation but cannot be mined: it exceeds the per-tx gas cap (out of gas)
      const cap = Number(await nft.MAX_BATCH_MINT());
      let rejected = false;
      try {
        await nft.connect(issuer).batchMint(user.address, "PROJECT_CAP", buildCredits("BATCH-CAP", cap));
      } catch (error) {
        rejected = true;
      }
      expect(rejected).to.equal(true);
      expect((await nft.getGlobalStats()).active).to.equal(maxBatchSize + 5);
    });

    it("Should reject over-sized batches", async function () {
      const { nft, issuer, user } = await loadFixture(deployNFTFixture);

      const oversizedBatch = 101; // Over limit
      const credits = Array(oversizedBatch).fill(0).map((_, i) => ({
        projectName: `Batch Credit ${i}`,
        serialNumber: `BATCH-OVER-${i}`,
        methodology: "VERRA_VCS",
        co2Tonnes: ethers.parseUnits("100", 18),
        vintageYear: 2024,
        geography: "IN",
        oracleProofHash: ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
        satelliteDataCID: `cid${i}`,
        tokenURI: `ipfs://uri${i}`,
      }));

      await expect(
        nft.connect(issuer).batchMint(user.address, "PROJECT_OVERSIZED", credits)
      ).to.be.revertedWith("Invalid batch size");
    });
  });

  // ============ REENTRANCY ATTACK TESTS ============
  describe("Reentrancy Protection", function () {
    it("Should prevent reentrancy on retirement", async function () {
      const { nft, issuer } = await loadFixture(deployNFTFixture);

      // Receiver that tries to retire the token from inside onERC721Received (mid-mint)
      const Attacker = await ethers.getContractFactory("PocReentrantClaimer");
      const attacker = await Attacker.deploy(await nft.getAddress());
      await attacker.waitForDeployment();

      await nft.connect(issuer).mintCredit(
        await attacker.getAddress(),
        "PROJECT_ATTACK",
        "Test",
        "ATTACK-001",
        "VERRA_VCS",
        ethers.parseUnits("1000", 18),
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "cid",
        "ipfs://uri"
      );

      expect(await attacker.reentered()).to.equal(0);
      expect(await attacker.blocked()).to.equal(1);
      expect(await nft.ownerOf(1)).to.equal(await attacker.getAddress());
      expect((await nft.getGlobalStats()).retired).to.equal(0);
    });
  });

  // ============ GAS LIMIT TESTS ============
  describe("Gas Limit Tests", function () {
    it("Should handle large batch mints within gas limits", async function () {
      this.timeout(300000);

      const { nft, issuer, user } = await loadFixture(deployNFTFixture);
      const blockGasLimit = await txGasCap();

      // batchMint costs roughly 0.49M gas per credit (storage-heavy CreditData + ERC721 mint),
      // so the contract cap MAX_BATCH_MINT (100) is not reachable inside one transaction; measure instead.
      const sizes = [1, 5, 10, 25];
      let perCredit = 0n;
      for (const size of sizes) {
        const tx = await nft.connect(issuer).batchMint(user.address, `PROJECT_GAS_${size}`, buildCredits(`GAS-${size}`, size));
        const receipt = await tx.wait();
        perCredit = receipt.gasUsed / BigInt(size);
        console.log(`      Batch size ${size}: ${receipt.gasUsed} gas (${perCredit} gas/credit)`);
        expect(receipt.gasUsed).to.be.lessThan(blockGasLimit);
      }

      // per-credit cost must stay in the measured order of magnitude (guards against accidental blow-ups)
      expect(perCredit).to.be.lessThan(700000n);
      expect(perCredit).to.be.greaterThan(100000n);

      // The largest batch that realistically fits a block (90% headroom) is below the contract cap
      const fits = Number((blockGasLimit * 9n) / 10n / perCredit);
      expect(fits).to.be.lessThan(Number(await nft.MAX_BATCH_MINT()));
    });
  });

  // ============ EDGE CASE TESTS ============
  describe("Edge Cases", function () {
    it("Should handle zero address checks", async function () {
      const { nft, issuer } = await loadFixture(deployNFTFixture);

      await expect(
        nft.connect(issuer).mintCredit(
          ethers.ZeroAddress,
          "PROJECT_001",
          "Test",
          "ZERO-001",
          "VERRA_VCS",
          ethers.parseUnits("1000", 18),
          2024,
          "IN",
          ethers.keccak256(ethers.toUtf8Bytes("proof")),
          "cid",
          "ipfs://uri"
        )
      ).to.be.revertedWith("Invalid recipient");
    });

    it("Should reject out-of-range co2Tonnes (cap per credit)", async function () {
      const { nft, issuer, user } = await loadFixture(deployNFTFixture);

      for (const tonnes of [ethers.MaxUint256, (await nft.MAX_TONNES_PER_CREDIT()) + 1n]) {
        await expect(
          nft.connect(issuer).mintCredit(
            user.address,
            "PROJECT_MAX",
            "Test",
            "MAX-001",
            "VERRA_VCS",
            tonnes,
            2024,
            "IN",
            ethers.keccak256(ethers.toUtf8Bytes("proof")),
            "cid",
            "ipfs://uri"
          )
        ).to.be.revertedWith("Invalid CO2 amount");
      }

      // the cap itself is accepted
      await expect(
        nft.connect(issuer).mintCredit(
          user.address,
          "PROJECT_MAX",
          "Test",
          "MAX-002",
          "VERRA_VCS",
          await nft.MAX_TONNES_PER_CREDIT(),
          2024,
          "IN",
          ethers.keccak256(ethers.toUtf8Bytes("proof")),
          "cid",
          "ipfs://uri"
        )
      ).to.not.be.reverted;
    });

    it("Should handle sequential rapid minting", async function () {
      this.timeout(60000);

      const { nft, issuer, user } = await loadFixture(deployNFTFixture);

      const rapidMints = 50;
      const promises = [];

      for (let i = 0; i < rapidMints; i++) {
        const promise = nft.connect(issuer).mintCredit(
          user.address,
          `PROJECT_RAPID_${i}`,
          "Rapid Test",
          `RAPID-${i}`,
          "VERRA_VCS",
          ethers.parseUnits("100", 18),
          2024,
          "IN",
          ethers.keccak256(ethers.toUtf8Bytes(`proof${i}`)),
          `cid${i}`,
          `ipfs://uri${i}`
        );
        promises.push(promise);
      }

      await Promise.all(promises);

      const stats = await nft.getGlobalStats();
      expect(stats.active).to.equal(rapidMints);
    });
  });
});
