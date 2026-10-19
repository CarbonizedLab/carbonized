// Runs the real deploy scripts (scripts/deploy/10_deploy_all.js and 20_deploy_mainnet.js) against the
// in-process Hardhat network and asserts every address, role and launch parameter, then drives an
// end-to-end flow on the deployed set: issue -> wrap -> order (6-decimal USDC) -> fill -> unwrap -> retire.
// No live network, no keys. Deployment files go to a temp dir, never to ./deployments.

const { expect } = require("chai");
const hre = require("hardhat");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { ethers } = hre;
const { deployAll } = require("../../scripts/deploy/10_deploy_all.js");
const { deployMainnet, handOver, verifyFinalState } = require("../../scripts/deploy/20_deploy_mainnet.js");
const { deployTokenMainnet } = require("../../scripts/deploy/21_deploy_token_mainnet.js");
const { attachTokenCheck } = require("../../scripts/deploy/22_attach_token_check.js");
const {
  openState,
  deployOnce,
  POOLS,
  ROLE_NAMES,
  CONSTRUCTOR_ROLES,
  roleId,
  TEST_ONLY_PRICE_SOURCES,
  assertDeployerHoldsNothing,
  NO_ORACLE_ROUTER_PLACEHOLDER,
} = require("../../scripts/lib/deploy-core.js");
const { loadSource, sourceHashOf, SOURCE_FOR_CONTRACT } = require("../../scripts/functions/sources.js");
const { buildValues, buildVercelText, applyToEnvText, mismatchWarnings } = require("../../scripts/update-carb-env.js");
const { assertReleaseManifest } = require("../../scripts/deploy/release-manifest.js");

const ZERO_ROLE = `0x${"00".repeat(32)}`;
const E18 = 10n ** 18n;
const U = (n) => ethers.parseUnits(n.toString(), 6);

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "carb-deploy-"));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const roleOf = async (contract, name) => (name === "DEFAULT_ADMIN_ROLE" ? ZERO_ROLE : contract[name]());

describe("Deploy scripts (in-process network)", function () {
  const dirs = [];
  const newDir = () => {
    const d = tmpDir();
    dirs.push(d);
    return d;
  };
  after(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  describe("mainnet release manifest gate", function () {
    const releaseCommit = "a".repeat(40);
    const buildManifest = (dir) => {
      const auditFile = path.join(dir, "final-audit.pdf");
      fs.writeFileSync(auditFile, "independent audit evidence");
      const auditSha256 = require("node:crypto").createHash("sha256").update(fs.readFileSync(auditFile)).digest("hex");
      const base = {
        schemaVersion: 1,
        status: "approved",
        chainId: 4663,
        releaseCommit,
        audit: { report: auditFile, sha256: auditSha256, approvedAt: "2026-10-17T00:00:00.000Z" },
      };
      const approvers = [ethers.Wallet.createRandom(), ethers.Wallet.createRandom()];
      return {
        ...base,
        approvedBy: approvers.map((wallet) => ({
          address: wallet.address,
          signature: wallet.signingKey.sign(ethers.hashMessage(require("../../scripts/deploy/release-manifest.js").approvalMessage(base))).serialized,
        })),
      };
    };

    it("fails closed for a missing, unsigned, mismatched or tampered release manifest", function () {
      expect(() => assertReleaseManifest({ env: {}, manifestPath: path.join(newDir(), "missing.json"), expectedCommit: releaseCommit })).to.throw(/release manifest/i);
      const dir = newDir();
      const file = path.join(dir, "manifest.json");
      const manifest = buildManifest(dir);
      fs.writeFileSync(file, JSON.stringify({ ...manifest, status: "draft" }));
      expect(() => assertReleaseManifest({ env: { RELEASE_MANIFEST: file }, expectedCommit: releaseCommit })).to.throw(/approved/i);
      fs.writeFileSync(file, JSON.stringify({ ...manifest, approvedBy: [] }));
      expect(() => assertReleaseManifest({ env: { RELEASE_MANIFEST: file }, expectedCommit: releaseCommit })).to.throw(/approval/i);
      fs.writeFileSync(file, JSON.stringify(manifest));
      fs.writeFileSync(manifest.audit.report, "tampered audit evidence");
      expect(() => assertReleaseManifest({ env: { RELEASE_MANIFEST: file }, expectedCommit: releaseCommit })).to.throw(/SHA-256/i);
    });

    it("accepts an approved manifest only when audit bytes, release commit and two signatures match", function () {
      const dir = newDir();
      const file = path.join(dir, "manifest.json");
      fs.writeFileSync(file, JSON.stringify(buildManifest(dir)));
      expect(assertReleaseManifest({ env: { RELEASE_MANIFEST: file }, expectedCommit: releaseCommit })).to.deep.include({ chainId: 4663, status: "approved" });
    });

    it("rejects a manifest whose approvals reuse a single signer address", function () {
      const dir = newDir();
      const file = path.join(dir, "manifest.json");
      const manifest = buildManifest(dir);
      const wallet = ethers.Wallet.createRandom();
      const { approvalMessage } = require("../../scripts/deploy/release-manifest.js");
      const signature = wallet.signingKey.sign(ethers.hashMessage(approvalMessage(manifest))).serialized;
      fs.writeFileSync(file, JSON.stringify({ ...manifest, approvedBy: [{ address: wallet.address, signature }, { address: wallet.address, signature }] }));

      expect(() => assertReleaseManifest({ env: { RELEASE_MANIFEST: file }, expectedCommit: releaseCommit })).to.throw(/unique/i);
    });
  });

  // ------------------------------------------------------------------------------------------
  describe("10_deploy_all.js (testnet)", function () {
    let outDir;
    let result;
    let signers;

    before(async function () {
      signers = await ethers.getSigners();
      outDir = newDir();
      result = await deployAll({ hre, outDir, quiet: true, env: { USDC_MINT_TO: signers[2].address } });
    });

    it("deploys every contract and records addresses, decimals, block and metadata", async function () {
      const { deployment } = result;
      const c = deployment.contracts;
      const flat = [
        c.CarbonCreditNFT,
        ...Object.values(c.CarbonCreditTokens),
        c.USDC,
        c.CarbonMarketplace,
        c.CarbonRegistry,
        c.FunctionsRouter,
        c.EmissionVerifier,
        c.RegistrySync,
        c.CarbonPriceOracle,
      ];
      expect(new Set(flat).size).to.equal(flat.length);
      for (const address of flat) expect(await ethers.provider.getCode(address)).to.not.equal("0x");

      expect(deployment.chainId).to.equal(31337);
      expect(deployment.usesMocks).to.equal(true);
      expect(deployment.deployer).to.equal(signers[0].address);
      expect(deployment.decimals).to.deep.equal({ payment: 6, carbon: 18 });
      expect(deployment.paymentToken).to.deep.include({ address: c.USDC, symbol: "USDC", decimals: 6, isMock: true });
      expect(deployment.deployBlock).to.be.greaterThan(0);
      expect(deployment.deployBlock).to.be.at.most(await ethers.provider.getBlockNumber());
      expect(deployment.deployBlock).to.equal(Math.min(...Object.values(deployment.deployBlocks)));
      expect(deployment.build.solc).to.equal("0.8.20");
      expect(deployment.constructorArgs.CarbonMarketplace).to.deep.equal([
        c.USDC,
        c.CarbonCreditTokens.VERRA_VCS,
        c.CarbonCreditNFT,
      ]);

      const file = path.join(outDir, "hardhat.json");
      expect(readJson(file)).to.deep.equal(deployment);
      expect(fs.existsSync(path.join(outDir, "hardhat.partial.json"))).to.equal(false);
    });

    it("builds the three pools, marketplace, registry and oracles with the right wiring", async function () {
      const { contracts, deployment } = result;
      const c = deployment.contracts;

      expect(await contracts.USDC.decimals()).to.equal(6n);
      expect(await contracts.USDC.symbol()).to.equal("USDC");

      for (const pool of POOLS) {
        const token = contracts[`CCT_${pool.type}`];
        expect(await token.getAddress()).to.equal(c.CarbonCreditTokens[pool.type]);
        expect(await token.name()).to.equal(pool.name);
        expect(await token.symbol()).to.equal(pool.symbol);
        expect(await token.methodology()).to.equal(pool.type);
        expect(await token.nftContract()).to.equal(c.CarbonCreditNFT);
        expect(await token.decimals()).to.equal(18n);
      }
      expect(POOLS.map((p) => p.symbol)).to.deep.equal(["CCT-ICM", "CCT-VCS", "CCT-GS"]);
      expect(POOLS.map((p) => p.name)).to.deep.equal([
        "Carbonized Credit - ICM",
        "Carbonized Credit - Verra",
        "Carbonized Credit - Gold Standard",
      ]);

      const market = contracts.CarbonMarketplace;
      expect(await market.paymentToken()).to.equal(c.USDC);
      expect(await market.paymentDecimals()).to.equal(6n);
      expect(await market.carbonToken()).to.equal(c.CarbonCreditTokens.VERRA_VCS);
      expect(await market.nftContract()).to.equal(c.CarbonCreditNFT);
      expect(await market.tradingFeePercent()).to.equal(25n);
      expect(await market.minPricePerTonne()).to.equal(10_000n); // 0.01 USDC
      expect(await market.kycGateEnabled()).to.equal(false);

      for (const name of ["EmissionVerifier", "RegistrySync", "CarbonPriceOracle"]) {
        const contract = contracts[name];
        expect(await contract.functionsRouter()).to.equal(c.FunctionsRouter);
        expect(await contract.subscriptionId()).to.equal(1n);
        expect(await contract.gasLimit()).to.equal(300_000n);
        expect(await contract.donId()).to.equal(ethers.encodeBytes32String("fun-testnet-mock"));
      }
      expect(await contracts.EmissionVerifier.nftContract()).to.equal(c.CarbonCreditNFT);
      expect(await contracts.RegistrySync.nftContract()).to.equal(c.CarbonCreditNFT);
    });

    it("grants exactly the intended roles (deployer = every constructor role + testnet ISSUER)", async function () {
      const { contracts, deployment } = result;
      const deployer = signers[0].address;
      const nft = contracts.CarbonCreditNFT;

      for (const [key, contract] of Object.entries(contracts)) {
        if (key === "USDC" || key === "FunctionsRouter") continue;
        const table = key.startsWith("CCT_") ? "CarbonCreditToken" : key;
        for (const roleName of CONSTRUCTOR_ROLES[table]) {
          expect(await contract.hasRole(await roleOf(contract, roleName), deployer), `${key}.${roleName}`).to.equal(true);
        }
      }
      const issuer = await nft.NATIVE_ISSUER_ROLE();
      expect(await nft.hasRole(issuer, deployment.contracts.EmissionVerifier)).to.equal(true);
      expect(await nft.hasRole(issuer, deployer)).to.equal(true);
      expect(await nft.hasRole(issuer, signers[1].address)).to.equal(false);
      expect(await nft.hasRole(await nft.ORACLE_ROLE(), deployer)).to.equal(false);
      expect(await nft.hasRole(await nft.VERIFIER_ROLE(), deployer)).to.equal(false);
      expect(await nft.hasRole(await nft.ISSUER_ADMIN_ROLE(), deployer)).to.equal(true);
      expect(await contracts.CarbonPriceOracle.hasRole(await contracts.CarbonPriceOracle.ORACLE_REPORTER_ROLE(), deployer)).to.equal(true);

      const market = contracts.CarbonMarketplace;
      expect(await market.hasRole(await market.KYC_ROLE(), deployer)).to.equal(true);
      expect(await market.hasRole(await market.FEE_MANAGER_ROLE(), deployer)).to.equal(true);
      expect(await contracts.CarbonRegistry.hasRole(ZERO_ROLE, deployer)).to.equal(true);

      for (const key of ["CarbonCreditNFT", "CarbonMarketplace", "CarbonRegistry"]) {
        expect(await contracts[key].paused()).to.equal(false);
      }
    });

    it("mints test USDC (6 decimals) to the deployer and the extra wallets", async function () {
      const { contracts } = result;
      expect(await contracts.USDC.balanceOf(signers[0].address)).to.equal(U(1_000_000));
      expect(await contracts.USDC.balanceOf(signers[2].address)).to.equal(U(1_000_000));
      expect(await contracts.USDC.balanceOf(signers[1].address)).to.equal(0n);
    });

    it("configures the oracle on the mock router: Functions config, reference sources, TEST-ONLY price sources", async function () {
      const { contracts, deployment } = result;
      for (const name of ["EmissionVerifier", "RegistrySync", "CarbonPriceOracle"]) {
        const c = contracts[name];
        expect(await c.sourceHash(), name).to.equal(sourceHashOf(loadSource(SOURCE_FOR_CONTRACT[name])));
        expect(await c.source(), name).to.equal(loadSource(SOURCE_FOR_CONTRACT[name]));
      }
      expect(await contracts.CarbonPriceOracle.getPriceSources()).to.deep.equal(TEST_ONLY_PRICE_SOURCES);
      for (const url of TEST_ONLY_PRICE_SOURCES) expect(url).to.match(/^https:\/\/example\.invalid\/carb-test-only\//);
      expect(deployment.config.oracle.enabled).to.equal(true);
      expect(deployment.config.oracle.note).to.match(/TESTNET ONLY/);
    });

    it("deploys and wires the CARB stack (treasury = deployer, links to marketplace and NFT)", async function () {
      const { tokens, deployment, contracts } = result;
      const deployer = signers[0].address;
      const c = deployment.contracts;
      for (const key of ["CarbToken", "CarbStaking", "IssuerBond", "CarbTimelock", "CarbGovernor"]) {
        expect(await ethers.provider.getCode(c[key]), key).to.not.equal("0x");
        expect(deployment.deployBlocks[key], key).to.be.greaterThan(0);
        expect(deployment.constructorArgs[key], key).to.be.an("array");
      }
      const { CarbToken: carb, CarbStaking: staking, IssuerBond: bond, CarbTimelock: timelock, CarbGovernor: governor } = tokens;
      expect(await carb.balanceOf(deployer)).to.equal(await carb.totalSupply());
      expect(await carb.totalSupply()).to.equal(1_000_000_000n * E18);
      expect(await staking.carb()).to.equal(c.CarbToken);
      expect(await governor.token()).to.equal(c.CarbToken);
      expect(await governor.timelock()).to.equal(c.CarbTimelock);

      expect(await contracts.CarbonMarketplace.feeDiscountProvider()).to.equal(c.CarbStaking);
      const nft = contracts.CarbonCreditNFT;
      expect(await nft.hasRole(await nft.ISSUER_ADMIN_ROLE(), c.IssuerBond)).to.equal(false);

      expect(await timelock.getMinDelay()).to.equal(2n * 86400n);
      for (const role of ["PROPOSER_ROLE", "CANCELLER_ROLE"]) {
        expect(await timelock.hasRole(await timelock[role](), c.CarbGovernor)).to.equal(true);
      }
      expect(await timelock.hasRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress)).to.equal(true);
      expect(await timelock.hasRole(await timelock.TIMELOCK_ADMIN_ROLE(), deployer)).to.equal(false);
      expect(await timelock.hasRole(await timelock.TIMELOCK_ADMIN_ROLE(), c.CarbTimelock)).to.equal(true);
      // dual stage: PARAMETER-grade roles only, never admin / pause / issuance
      expect(await staking.hasRole(await staking.PARAMETER_ROLE(), c.CarbTimelock)).to.equal(true);
      expect(await bond.hasRole(await bond.SLASHER_ROLE(), c.CarbTimelock)).to.equal(true);
      expect(await contracts.CarbonMarketplace.hasRole(await contracts.CarbonMarketplace.PARAMETER_ROLE(), c.CarbTimelock)).to.equal(true);
      expect(await staking.hasRole(ZERO_ROLE, c.CarbTimelock)).to.equal(false);
      expect(await contracts.CarbonMarketplace.hasRole(ZERO_ROLE, c.CarbTimelock)).to.equal(false);
      expect(await nft.hasRole(ZERO_ROLE, c.CarbTimelock)).to.equal(false);
      expect(deployment.config.token).to.deep.include({ treasury: deployer, stage: "dual", timelockMinDelay: 172800 });
    });

    it("a re-run with a bad CARB parameter fails before anything is sent", async function () {
      const nonce = await ethers.provider.getTransactionCount(signers[0].address);
      await expect(deployAll({ hre, outDir: newDir(), quiet: true, env: { GOV_QUORUM_PERCENT: "50" } })).to.be.rejectedWith(/GOV_QUORUM_PERCENT/);
      expect(await ethers.provider.getTransactionCount(signers[0].address)).to.equal(nonce);
    });

    it("end to end: issue, wrap, create order with 6-decimal USDC, fill, unwrap, retire, withdraw fees", async function () {
      const { contracts, deployment } = result;
      const [issuer, alice, bob] = signers;
      const { CarbonCreditNFT: nft, CCT_VERRA_VCS: token, CarbonMarketplace: market, USDC: usdc } = contracts;

      await nft.connect(issuer).mintCredit(
        alice.address,
        "PROJECT-DEPLOY-E2E",
        "Deploy e2e project",
        "VCS-DEPLOY-E2E-1",
        "VERRA_VCS",
        10n * E18,
        2024,
        "IN",
        ethers.keccak256(ethers.toUtf8Bytes("proof-e2e")),
        "cid",
        "ipfs://e2e",
      );
      const tokenId = await nft.totalSupply();
      expect(await nft.ownerOf(tokenId)).to.equal(alice.address);

      await nft.connect(alice).approve(deployment.contracts.CarbonCreditTokens.VERRA_VCS, tokenId);
      await token.connect(alice).wrapCredit(tokenId);
      expect(await token.balanceOf(alice.address)).to.equal(10n * E18);
      expect(await token.isFullyBacked()).to.equal(true);

      // 5 USDC per tonne, 6 decimals
      await token.connect(alice).approve(await market.getAddress(), ethers.MaxUint256);
      await market.connect(alice).createSellOrder(10n * E18, U(5), 0, false);
      const orderId = (await market.nextOrderId()) - 1n;

      await usdc.mint(bob.address, U(1_000));
      const bobBefore = await usdc.balanceOf(bob.address);
      await usdc.connect(bob).approve(await market.getAddress(), ethers.MaxUint256);
      await market.connect(bob).fillOrder(orderId, 10n * E18);

      const cost = U(50);
      const fee = (cost * 25n) / 10_000n; // 0.125 USDC
      expect(fee).to.equal(125_000n);
      expect(await token.balanceOf(bob.address)).to.equal(10n * E18);
      expect(await usdc.balanceOf(bob.address)).to.equal(bobBefore - cost);
      expect(await usdc.balanceOf(alice.address)).to.equal(cost - fee);
      expect(await market.accruedFees()).to.equal(fee);

      await token.connect(bob).unwrapAny(10n * E18);
      expect(await nft.ownerOf(tokenId)).to.equal(bob.address);
      await nft.connect(bob).retireCredit(tokenId, "Deploy script e2e");
      expect(await nft.totalRetiredTonnes()).to.equal(10n * E18);
      const cert = await nft.retirementCertificates(tokenId); // the NFT itself is burned on retirement
      expect(cert.retiredBy).to.equal(bob.address);
      expect(cert.co2Tonnes).to.equal(10n * E18);
      await expect(nft.ownerOf(tokenId)).to.be.reverted;

      // FEE_MANAGER (deployer on testnet) can withdraw only the tracked fees
      const before = await usdc.balanceOf(issuer.address);
      await market.connect(issuer).withdrawFees(issuer.address);
      expect((await usdc.balanceOf(issuer.address)) - before).to.equal(fee);
      expect(await market.accruedFees()).to.equal(0n);
    });

    it("keeps the previous deployment file and deploys a fresh set on re-run", async function () {
      const first = readJson(path.join(outDir, "hardhat.json"));
      const second = await deployAll({ hre, outDir, quiet: true });
      const prev = readJson(path.join(outDir, "hardhat.previous.json"));
      expect(prev).to.deep.equal(first);
      expect(second.deployment.contracts.CarbonCreditNFT).to.not.equal(first.contracts.CarbonCreditNFT);
      expect(readJson(path.join(outDir, "hardhat.json")).contracts.CarbonCreditNFT).to.equal(
        second.deployment.contracts.CarbonCreditNFT,
      );
    });

    it("resumes an interrupted run from the partial state file instead of redeploying", async function () {
      const dir = newDir();
      const log = () => {};
      // Simulate a run that died after the mock USDC and the NFT were mined.
      const store = openState({ dir, network: "hardhat", chainId: 31337, deployer: signers[0].address, log });
      const usdc = await deployOnce({ hre, store, key: "USDC", factoryName: "MockERC20", args: ["USD Coin", "USDC", 6], log });
      const nft = await deployOnce({ hre, store, key: "CarbonCreditNFT", factoryName: "CarbonCreditNFT", args: [], log });
      expect(fs.existsSync(path.join(dir, "hardhat.partial.json"))).to.equal(true);

      const resumed = await deployAll({ hre, outDir: dir, quiet: true });
      expect(resumed.deployment.contracts.USDC).to.equal(usdc.address);
      expect(resumed.deployment.contracts.CarbonCreditNFT).to.equal(nft.address);
      expect(resumed.deployment.deployBlocks.CarbonCreditNFT).to.equal(nft.block);
      expect(fs.existsSync(path.join(dir, "hardhat.partial.json"))).to.equal(false);
      expect(fs.existsSync(path.join(dir, "hardhat.previous.json"))).to.equal(false);
    });

    it("refuses to run (mocks!) on a non-testnet chain id", async function () {
      const fake = Object.create(hre, {
        network: { value: { name: "robinhoodMainnet" } },
        ethers: {
          value: { provider: { getNetwork: async () => ({ chainId: 4663n }) } },
        },
      });
      await expect(deployAll({ hre: fake, outDir: newDir(), quiet: true })).to.be.rejectedWith(/testnet-only/);
    });

    it("writes env lines for the web app without touching REOWN / RPC / NETWORK", async function () {
      const values = buildValues(result.deployment);
      expect(Object.keys(values)).to.include.members([
        "NEXT_PUBLIC_CARBON_CREDIT_NFT",
        "NEXT_PUBLIC_CARBON_CREDIT_TOKEN",
        "NEXT_PUBLIC_CARBON_CREDIT_TOKEN_ICM_COMPLIANCE",
        "NEXT_PUBLIC_CARBON_CREDIT_TOKEN_GOLD_STANDARD",
        "NEXT_PUBLIC_CARBON_MARKETPLACE",
        "NEXT_PUBLIC_CARBON_REGISTRY",
        "NEXT_PUBLIC_USDC_ADDRESS",
        "NEXT_PUBLIC_DEPLOY_BLOCK",
      ]);
      expect(values.NEXT_PUBLIC_USDC_ADDRESS).to.equal(result.deployment.contracts.USDC);
      expect(values.NEXT_PUBLIC_DEPLOY_BLOCK).to.equal(String(result.deployment.deployBlock));
      const tokenAddresses = result.deployment.contracts;
      expect(values).to.deep.include({
        NEXT_PUBLIC_CARB_TOKEN: tokenAddresses.CarbToken,
        NEXT_PUBLIC_CARB_STAKING: tokenAddresses.CarbStaking,
        NEXT_PUBLIC_ISSUER_BOND: tokenAddresses.IssuerBond,
        NEXT_PUBLIC_GOVERNOR: tokenAddresses.CarbGovernor,
        NEXT_PUBLIC_TIMELOCK: tokenAddresses.CarbTimelock,
        NEXT_PUBLIC_REGISTRY_SYNC: tokenAddresses.RegistrySync,
      });
      // a deployment without the token drops the token keys (and a stale token line from an older block)
      const { CarbToken: _a, CarbStaking: _b, IssuerBond: _c, CarbGovernor: _d, CarbTimelock: _e, ...protocolOnly } = tokenAddresses;
      const noToken = buildValues({ ...result.deployment, contracts: protocolOnly });
      expect(Object.keys(noToken)).to.not.include("NEXT_PUBLIC_CARB_TOKEN");
      const cleaned = applyToEnvText("NEXT_PUBLIC_CARB_TOKEN=0x0000000000000000000000000000000000000009\n", {
        values: noToken,
        networkName: "robinhood",
        deployment: result.deployment,
      });
      expect(cleaned).to.not.include("NEXT_PUBLIC_CARB_TOKEN");

      const before = [
        "SKIP_ENV_VALIDATION=1",
        "NEXT_PUBLIC_NETWORK=robinhood",
        "NEXT_PUBLIC_CHAIN_ID=46630",
        "NEXT_PUBLIC_RPC_URL=https://example.invalid/rpc",
        "NEXT_PUBLIC_REOWN_PROJECT_ID=abc123",
        "NEXT_PUBLIC_CARBON_CREDIT_NFT=0x0000000000000000000000000000000000000001",
        "NEXT_PUBLIC_CCT_ICM_COMPLIANCE=0x0000000000000000000000000000000000000002",
        "",
      ].join("\r\n");
      const after = applyToEnvText(before, { values, networkName: "robinhood", deployment: result.deployment });
      for (const keep of [
        "SKIP_ENV_VALIDATION=1",
        "NEXT_PUBLIC_NETWORK=robinhood",
        "NEXT_PUBLIC_CHAIN_ID=46630",
        "NEXT_PUBLIC_RPC_URL=https://example.invalid/rpc",
        "NEXT_PUBLIC_REOWN_PROJECT_ID=abc123",
      ]) {
        expect(after).to.include(keep);
      }
      expect(after).to.include(`NEXT_PUBLIC_CARBON_CREDIT_NFT=${result.deployment.contracts.CarbonCreditNFT}`);
      expect(after).to.not.include("0x0000000000000000000000000000000000000001");
      expect(after).to.not.include("NEXT_PUBLIC_CCT_ICM_COMPLIANCE");
      expect(after).to.include("6 decimals");
      expect(after).to.include("\r\n");
      // idempotent
      expect(applyToEnvText(after, { values, networkName: "robinhood", deployment: result.deployment })).to.equal(after);
      expect(mismatchWarnings(after, "robinhood")).to.deep.equal([]);
      expect(mismatchWarnings(after, "robinhoodMainnet")).to.have.length(2);

      // Vercel list: public values only, placeholders for the operator's choices, every managed key present
      const vercel = buildVercelText(values, "robinhood", result.deployment);
      for (const key of Object.keys(values)) expect(vercel).to.include(`${key}=${values[key]}`);
      expect(vercel).to.include("NEXT_PUBLIC_RPC_URL=<set your RPC URL");
      expect(vercel).to.include("NEXT_PUBLIC_REOWN_PROJECT_ID=<your Reown");
      expect(vercel).to.not.match(/PRIVATE_KEY|0x[0-9a-fA-F]{64}\b/);
    });
  });

  // ------------------------------------------------------------------------------------------
  describe("20_deploy_mainnet.js (dry-run on the in-process network, chain-id override)", function () {
    let signers;
    let usdc;
    let router;
    let multisig; // any contract address: only code presence + hasRole reads are needed
    let treasury; // second contract standing in for the treasury multisig
    let baseEnv;

    before(async function () {
      signers = await ethers.getSigners();
      // TEST FIXTURES standing in for canonical USDG / Functions router / Safe of chain 4663.
      usdc = await (await ethers.getContractFactory("MockERC20")).deploy("Global Dollar", "USDG", 6);
      router = await (await ethers.getContractFactory("MockFunctionsRouter")).deploy();
      multisig = await (await ethers.getContractFactory("MockERC20")).deploy("Safe stand-in", "SAFE", 6);
      treasury = await (await ethers.getContractFactory("MockERC20")).deploy("Treasury stand-in", "TSAFE", 6);
      baseEnv = {
        MAINNET_USDG: await usdc.getAddress(),
        ENABLE_ORACLE: "yes",
        FUNCTIONS_ROUTER: await router.getAddress(),
        DON_ID: "fun-robinhood-test-1",
        SUBSCRIPTION_ID: "42",
        PRICE_SOURCE_URLS: "https://prices-a.example/{methodology}, https://prices-b.example/{methodology}",
        ADMIN_MULTISIG: await multisig.getAddress(),
        TREASURY_MULTISIG: await treasury.getAddress(),
        ISSUER_ADDRESS: `${signers[3].address}, ${signers[4].address}`,
        ORACLE_REPORTERS: signers[7].address,
        ALLOW_CHAINID_OVERRIDE_HARDHAT: "1",
      };
    });

    it("requires USDG as the named mainnet payment token", async function () {
      const usdg = await (await ethers.getContractFactory("MockERC20")).deploy("Global Dollar", "USDG", 6);
      const env = { ...baseEnv, MAINNET_USDG: await usdg.getAddress() };

      const out = await deployMainnet({ hre, outDir: newDir(), env, quiet: true });
      expect(out.dryRun).to.equal(true);
    });

    it("asserts chain id 4663: refuses the in-process chain without the hardhat-only override", async function () {
      const env = { ...baseEnv };
      delete env.ALLOW_CHAINID_OVERRIDE_HARDHAT;
      await expect(deployMainnet({ hre, outDir: newDir(), env, quiet: true })).to.be.rejectedWith(/expected 4663/);
    });

    it("never honours the chain-id override on a non-hardhat network", async function () {
      const fake = Object.create(hre, { network: { value: { name: "robinhoodMainnet" } } });
      await expect(deployMainnet({ hre: fake, outDir: newDir(), env: baseEnv, quiet: true })).to.be.rejectedWith(
        /only honoured on the in-process hardhat network/,
      );
    });

    it("rejects missing env, bad USDG decimals / symbol, EOA admin and the deployer as admin", async function () {
      const run = (env) => deployMainnet({ hre, outDir: newDir(), env: { ...env, CONFIRM_MAINNET: "yes" }, quiet: true });

      const noSub = { ...baseEnv };
      delete noSub.SUBSCRIPTION_ID;
      await expect(run(noSub)).to.be.rejectedWith(/Missing required env: SUBSCRIPTION_ID/);

      const usdc18 = await (await ethers.getContractFactory("MockERC20")).deploy("Global Dollar", "USDG", 18);
      await expect(run({ ...baseEnv, MAINNET_USDG: await usdc18.getAddress() })).to.be.rejectedWith(/decimals\(\) is 18/);

      const fake = await (await ethers.getContractFactory("MockERC20")).deploy("Tether", "USDT", 6);
      await expect(run({ ...baseEnv, MAINNET_USDG: await fake.getAddress() })).to.be.rejectedWith(/symbol\(\) is "USDT"/);

      await expect(run({ ...baseEnv, MAINNET_USDG: signers[7].address })).to.be.rejectedWith(/no code/);
      await expect(run({ ...baseEnv, ADMIN_MULTISIG: signers[5].address })).to.be.rejectedWith(/must be a deployed multisig/);
      await expect(run({ ...baseEnv, ADMIN_MULTISIG: signers[0].address })).to.be.rejectedWith(/must not be the deployer/);
      await expect(run({ ...baseEnv, ISSUER_ADDRESS: signers[0].address })).to.be.rejectedWith(/must not include the deployer/);
      await expect(run({ ...baseEnv, EXTERNAL_ISSUER_ADDRESS: signers[0].address })).to.be.rejectedWith(/must not include the deployer/);
      await expect(
        run({ ...baseEnv, ISSUER_ADDRESS: signers[3].address, EXTERNAL_ISSUER_ADDRESS: signers[3].address })
      ).to.be.rejectedWith(/ISSUER_ADDRESS and EXTERNAL_ISSUER_ADDRESS must not overlap/);
      await expect(run({ ...baseEnv, DON_ID: "0x1234" })).to.be.rejectedWith(/32 bytes/);
      await expect(run({ ...baseEnv, TRADING_FEE_BPS: "101" })).to.be.rejectedWith(/TRADING_FEE_BPS/);
    });

    it("without CONFIRM_MAINNET=yes it prints a dry-run summary and broadcasts nothing", async function () {
      const dir = newDir();
      const nonce = await ethers.provider.getTransactionCount(signers[0].address);
      const out = await deployMainnet({ hre, outDir: dir, env: baseEnv, quiet: true });
      expect(out.dryRun).to.equal(true);
      expect(await ethers.provider.getTransactionCount(signers[0].address)).to.equal(nonce);
      expect(fs.readdirSync(dir)).to.have.length(0);
    });

    it("rejects out-of-bounds CARB parameters before sending anything (timelock >= 2 days, governance and staking bounds)", async function () {
      const nonce = await ethers.provider.getTransactionCount(signers[0].address);
      const run = (extra) =>
        deployMainnet({ hre, outDir: newDir(), env: { ...baseEnv, CONFIRM_MAINNET: "yes", ...extra }, quiet: true });
      const cases = [
        [{ TIMELOCK_MIN_DELAY: "172799" }, /TIMELOCK_MIN_DELAY/],
        [{ TIMELOCK_MIN_DELAY: "86400" }, /TIMELOCK_MIN_DELAY/],
        [{ TIMELOCK_MIN_DELAY: "2592001" }, /TIMELOCK_MIN_DELAY/],
        [{ TIMELOCK_EXECUTORS: "not-an-address" }, /TIMELOCK_EXECUTORS/],
        [{ TIMELOCK_PROPOSERS: "0x1234" }, /TIMELOCK_PROPOSERS/],
        [{ GOVERNANCE_STAGE: "governed" }, /GOVERNANCE_STAGE/],
        [{ GOV_VOTING_DELAY: "60" }, /GOV_VOTING_DELAY/],
        [{ GOV_VOTING_PERIOD: "3600" }, /GOV_VOTING_PERIOD/],
        [{ GOV_VOTING_PERIOD: String(15 * 86400) }, /GOV_VOTING_PERIOD/],
        [{ GOV_QUORUM_PERCENT: "0" }, /GOV_QUORUM_PERCENT/],
        [{ GOV_QUORUM_PERCENT: "21" }, /GOV_QUORUM_PERCENT/],
        [{ GOV_PROPOSAL_THRESHOLD_CARB: "50000001" }, /GOV_PROPOSAL_THRESHOLD_CARB/],
        [{ GOV_PROPOSAL_THRESHOLD_CARB: "0" }, /GOV_PROPOSAL_THRESHOLD_CARB/],
        [{ STAKING_THRESHOLDS_CARB: "5000,1000,25000" }, /strictly increasing/],
        [{ STAKING_THRESHOLDS_CARB: "1000,5000" }, /exactly 3/],
        [{ STAKING_THRESHOLDS_CARB: "1000,5000,50000001" }, /STAKING_THRESHOLDS_CARB/],
        [{ STAKING_DISCOUNTS_BPS: "0,1000,2500,5001" }, /STAKING_DISCOUNTS_BPS/],
        [{ STAKING_DISCOUNTS_BPS: "100,1000,2500,5000" }, /STAKING_DISCOUNTS_BPS/],
        [{ STAKING_DISCOUNTS_BPS: "0,2000,1000,5000" }, /STAKING_DISCOUNTS_BPS/],
        [{ STAKING_WARMUP: "60" }, /STAKING_WARMUP/],
        [{ STAKING_COOLDOWN: "3600" }, /STAKING_COOLDOWN/],
        [{ BOND_MIN_CARB: "0.5" }, /BOND_MIN_CARB/],
        [{ BOND_UNBOND_DELAY: "86400" }, /BOND_UNBOND_DELAY/],
        [{ BOND_DISPUTE_WINDOW: String(31 * 86400) }, /BOND_DISPUTE_WINDOW/],
        [{ TREASURY_MULTISIG: "" }, /Missing required env: TREASURY_MULTISIG/],
        [{ TREASURY_MULTISIG: signers[5].address }, /TREASURY_MULTISIG .* no code/],
        [{ TREASURY_MULTISIG: signers[0].address }, /TREASURY_MULTISIG must not be the deployer/],
        [{ ORACLE_REPORTERS: signers[0].address }, /must not include the deployer/],
        [{ PRICE_SOURCE_URLS: "http://insecure.example/x" }, /not an https URL/],
      ];
      for (const [extra, pattern] of cases) {
        await expect(run(extra), JSON.stringify(extra)).to.be.rejectedWith(pattern);
      }
      expect(await ethers.provider.getTransactionCount(signers[0].address)).to.equal(nonce);
    });

    it("accepts the documented bounds exactly (2-day timelock, extra proposers, explicit executors, governance stage bootstrap)", async function () {
      const res = await deployMainnet({
        hre,
        outDir: newDir(),
        env: {
          ...baseEnv,
          CONFIRM_MAINNET: "yes",
          TIMELOCK_MIN_DELAY: "172800",
          TIMELOCK_PROPOSERS: signers[8].address,
          TIMELOCK_EXECUTORS: `${signers[9].address}`,
          GOVERNANCE_STAGE: "bootstrap",
          BOND_REQUIRED: "on",
          GOV_QUORUM_PERCENT: "20",
        },
        quiet: true,
      });
      const { CarbTimelock: timelock, CarbStaking: staking, IssuerBond: bond, CarbGovernor: governor } = res.tokens;
      const tl = await timelock.getAddress();
      expect(await timelock.hasRole(await timelock.PROPOSER_ROLE(), signers[8].address)).to.equal(true);
      expect(await timelock.hasRole(await timelock.CANCELLER_ROLE(), signers[8].address)).to.equal(true);
      expect(await timelock.hasRole(await timelock.EXECUTOR_ROLE(), signers[9].address)).to.equal(true);
      expect(await timelock.hasRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress)).to.equal(false);
      expect(await governor.quorumNumerator()).to.equal(20n);
      expect(await bond.bondRequired()).to.equal(true);
      // bootstrap: the timelock holds nothing; the multisig holds everything
      expect(await staking.hasRole(await staking.PARAMETER_ROLE(), tl)).to.equal(false);
      expect(await bond.hasRole(await bond.SLASHER_ROLE(), tl)).to.equal(false);
      const market = res.contracts.CarbonMarketplace;
      expect(await market.hasRole(await market.PARAMETER_ROLE(), tl)).to.equal(false);
      expect(await staking.hasRole(await staking.PARAMETER_ROLE(), await multisig.getAddress())).to.equal(true);
      expect(res.deployment.config.token.stage).to.equal("bootstrap");
    });

    describe("oracle disabled (the default): consumers unconfigured, reportPrice is the only source", function () {
      let res;
      let env;

      before(async function () {
        env = {
          MAINNET_USDG: await usdc.getAddress(),
          ADMIN_MULTISIG: await multisig.getAddress(),
          TREASURY_MULTISIG: await treasury.getAddress(),
          ORACLE_REPORTERS: signers[7].address,
          ALLOW_CHAINID_OVERRIDE_HARDHAT: "1",
          CONFIRM_MAINNET: "yes",
        };
        res = await deployMainnet({ hre, outDir: newDir(), env, quiet: true });
      });

      it("needs no router / DON / subscription and stores a code-less placeholder router", async function () {
        expect(res.deployment.functions).to.deep.include({
          enabled: false,
          routerIsPlaceholder: true,
          donId: null,
          subscriptionId: null,
        });
        for (const name of ["EmissionVerifier", "RegistrySync", "CarbonPriceOracle"]) {
          expect((await res.contracts[name].functionsRouter()).toLowerCase(), name).to.equal(NO_ORACLE_ROUTER_PLACEHOLDER.toLowerCase());
        }
        expect(await ethers.provider.getCode(NO_ORACLE_ROUTER_PLACEHOLDER)).to.equal("0x");
      });

      it("leaves the three consumers without source, DON and subscription, and with no NATIVE_ISSUER_ROLE for the verifier", async function () {
        for (const name of ["EmissionVerifier", "RegistrySync", "CarbonPriceOracle"]) {
          const c = res.contracts[name];
          expect(await c.sourceHash(), name).to.equal(ethers.ZeroHash);
          expect(await c.source(), name).to.equal("");
          expect(await c.subscriptionId(), name).to.equal(0n);
          expect(await c.donId(), name).to.equal(ethers.ZeroHash);
        }
        expect(await res.contracts.CarbonPriceOracle.getPriceSources()).to.deep.equal([]);
        const nft = res.contracts.CarbonCreditNFT;
        expect(await nft.hasRole(await nft.NATIVE_ISSUER_ROLE(), await res.contracts.EmissionVerifier.getAddress())).to.equal(false);
      });

      it("cannot send a Functions request, while the reporter fallback works", async function () {
        const oracle = res.contracts.CarbonPriceOracle;
        const safe = await multisig.getAddress();
        await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [safe] });
        await hre.network.provider.request({ method: "hardhat_setBalance", params: [safe, "0xde0b6b3a7640000"] });
        const asSafe = await ethers.getSigner(safe);
        await expect(oracle.connect(asSafe).updatePrice("VERRA_VCS")).to.be.reverted;

        const now = (await ethers.provider.getBlock("latest")).timestamp;
        await oracle.connect(signers[7]).reportPrice("VERRA_VCS", 12n * 10n ** 8n, 0, now);
        expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(12n * 10n ** 8n);
        await hre.network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [safe] });
      });

      it("still hands everything over: deployer holds no role anywhere, token stack included", async function () {
        const { CarbStaking, IssuerBond, CarbTimelock } = res.tokens;
        const held = await assertDeployerHoldsNothing({
          roleContracts: { ...res.contracts, CarbStaking, IssuerBond },
          timelock: CarbTimelock,
          deployerAddress: signers[0].address,
        });
        expect(held).to.deep.equal([]);
      });

      it("rejects inconsistent oracle env", async function () {
        const run = (extra) => deployMainnet({ hre, outDir: newDir(), env: { ...env, ...extra }, quiet: true });
        await expect(run({ ENABLE_ORACLE_ISSUANCE: "yes" })).to.be.rejectedWith(/requires ENABLE_ORACLE=yes/);
        await expect(run({ PRICE_SOURCE_URLS: "https://x.example/{methodology}" })).to.be.rejectedWith(/needs ENABLE_ORACLE=yes/);
        await expect(run({ ENABLE_ORACLE: "yes" })).to.be.rejectedWith(
          /Missing required env: FUNCTIONS_ROUTER, DON_ID, SUBSCRIPTION_ID/,
        );
        await expect(run({ ENABLE_ORACLE: "yes", FUNCTIONS_ROUTER: signers[7].address, DON_ID: "fun-x", SUBSCRIPTION_ID: "1" })).to.be.rejectedWith(
          /FUNCTIONS_ROUTER .* has no code/,
        );
      });
    });

    describe("DEPLOY_TOKEN=no, then 21_deploy_token_mainnet.js", function () {
      let dir;
      let env;
      let protocolOnly;

      before(async function () {
        dir = newDir();
        env = {
          MAINNET_USDG: await usdc.getAddress(),
          ADMIN_MULTISIG: await multisig.getAddress(),
          DEPLOY_TOKEN: "no",
          ALLOW_CHAINID_OVERRIDE_HARDHAT: "1",
          CONFIRM_MAINNET: "yes",
        };
        protocolOnly = await deployMainnet({ hre, outDir: dir, env, quiet: true });
      });

      it("the first run deploys the protocol only (no treasury needed, no token addresses)", async function () {
        const d = readJson(path.join(dir, "robinhoodMainnet.json"));
        expect(d.config.token).to.deep.equal({ deployed: false });
        expect(d.contracts).to.not.have.any.keys("CarbToken", "CarbStaking", "IssuerBond", "CarbTimelock", "CarbGovernor");
        expect(protocolOnly.tokens).to.deep.equal({});
        expect(await protocolOnly.contracts.CarbonMarketplace.feeDiscountProvider()).to.equal(ethers.ZeroAddress);
      });

      it("the later script dry-runs without sending, then deploys, hands over and lists the multisig transactions", async function () {
        const base = { ...env, TREASURY_MULTISIG: await treasury.getAddress() };
        delete base.DEPLOY_TOKEN;
        const nonce = await ethers.provider.getTransactionCount(signers[0].address);
        const dry = await deployTokenMainnet({ hre, outDir: dir, env: { ...base, CONFIRM_MAINNET: "no" }, quiet: true });
        expect(dry.dryRun).to.equal(true);
        expect(await ethers.provider.getTransactionCount(signers[0].address)).to.equal(nonce);

        await expect(deployTokenMainnet({ hre, outDir: dir, env: { ...base, TIMELOCK_MIN_DELAY: "3600" }, quiet: true })).to.be.rejectedWith(
          /TIMELOCK_MIN_DELAY/,
        );

        const out = await deployTokenMainnet({ hre, outDir: dir, env: base, quiet: true });
        expect(out.deployed).to.equal(true);
        const d = readJson(path.join(dir, "robinhoodMainnet.json"));
        expect(readJson(path.join(dir, "robinhoodMainnet.previous.json")).contracts).to.not.have.property("CarbToken");
        expect(d.contracts.CarbToken).to.match(/^0x[0-9a-fA-F]{40}$/);
        expect(d.config.token).to.deep.include({ deployed: true, stage: "dual" });
        expect(d.contracts.CarbonMarketplace).to.equal(readJson(path.join(dir, "robinhoodMainnet.previous.json")).contracts.CarbonMarketplace);
        expect(fs.existsSync(path.join(dir, "robinhoodMainnet.token.partial.json"))).to.equal(false);

        const { CarbToken: carb, CarbStaking: staking, IssuerBond: bond, CarbTimelock: timelock } = out.tokens;
        const safe = await multisig.getAddress();
        expect(await carb.balanceOf(await treasury.getAddress())).to.equal(1_000_000_000n * E18);
        for (const roleName of CONSTRUCTOR_ROLES.CarbStaking) {
          expect(await staking.hasRole(await roleOf(staking, roleName), safe)).to.equal(true);
        }
        const held = await assertDeployerHoldsNothing({
          roleContracts: { CarbStaking: staking, IssuerBond: bond },
          timelock,
          deployerAddress: signers[0].address,
        });
        expect(held).to.deep.equal([]);

        // three multisig transactions are open: the deployer holds no role on the NFT / marketplace any more
        expect(out.pending.map((p) => p.label)).to.deep.equal([
          "CarbonMarketplace.setFeeDiscountProvider(CarbStaking)",
          "CarbonMarketplace.grantRole(PARAMETER_ROLE, CarbTimelock)",
        ]);
        const txs = readJson(path.join(dir, "robinhoodMainnet.token-multisig-txs.json"));
        expect(txs.from).to.equal(safe);
        expect(txs.transactions).to.have.length(2);

        // already deployed: a second run only re-verifies (and reports the same open transactions)
        const check = await deployTokenMainnet({ hre, outDir: dir, env: base, quiet: true });
        expect(check.deployed).to.equal(false);
        expect(check.pending).to.have.length(2);

        // the multisig executes them, the next check is clean
        await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [safe] });
        await hre.network.provider.request({ method: "hardhat_setBalance", params: [safe, "0xde0b6b3a7640000"] });
        const asSafe = await ethers.getSigner(safe);
        for (const tx of txs.transactions) {
          await (await asSafe.sendTransaction({ to: tx.to, data: tx.data })).wait();
        }
        await hre.network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [safe] });
        const clean = await deployTokenMainnet({ hre, outDir: dir, env: base, quiet: true });
        expect(clean.pending).to.have.length(0);
        const market = protocolOnly.contracts.CarbonMarketplace;
        expect(await market.feeDiscountProvider()).to.equal(await staking.getAddress());
        expect(await market.hasRole(await market.PARAMETER_ROLE(), await timelock.getAddress())).to.equal(true);
      });
    });

    describe("full run with CONFIRM_MAINNET=yes", function () {
      let dir;
      let out;
      let contracts;
      let deployer;

      before(async function () {
        dir = newDir();
        deployer = signers[0].address;
        out = await deployMainnet({ hre, outDir: dir, env: { ...baseEnv, CONFIRM_MAINNET: "yes" }, quiet: true });
        contracts = out.contracts;
      });

      it("deploys no mocks and writes deployments/robinhoodMainnet.json", async function () {
        expect(out.dryRun).to.equal(false);
        const d = readJson(path.join(dir, "robinhoodMainnet.json"));
        expect(d).to.deep.equal(out.deployment);
        expect(d.usesMocks).to.equal(false);
        expect(d.isTestnet).to.equal(false);
        expect(d.admin).to.equal(await multisig.getAddress());
        expect(d.paymentToken).to.deep.include({ address: await usdc.getAddress(), symbol: "USDG", decimals: 6, isMock: false });
        expect(d.contracts.USDG).to.equal(await usdc.getAddress());
        expect(d.contracts).to.not.have.property("USDC");
        const exported = buildValues(d);
        expect(exported.NEXT_PUBLIC_USDG_ADDRESS).to.equal(await usdc.getAddress());
        expect(exported).to.not.have.property("NEXT_PUBLIC_USDC_ADDRESS");
        expect(d.contracts.FunctionsRouter).to.equal(await router.getAddress());
        expect(d.constructorArgs).to.not.have.any.keys("USDC", "FunctionsRouter");
        expect(d.contracts.CarbonCreditTokens).to.have.all.keys("ICM_COMPLIANCE", "VERRA_VCS", "GOLD_STANDARD");
        expect(fs.existsSync(path.join(dir, "robinhoodMainnet.partial.json"))).to.equal(false);
      });

      it("hands every role to the multisig and leaves the deployer with none", async function () {
        const safe = await multisig.getAddress();
        for (const [key, c] of Object.entries(contracts)) {
          const table = key.startsWith("CCT_") ? "CarbonCreditToken" : key;
          for (const roleName of ROLE_NAMES[table]) {
            const role = await roleOf(c, roleName);
            expect(await c.hasRole(role, deployer), `${key}.${roleName} deployer`).to.equal(false);
          }
          for (const roleName of CONSTRUCTOR_ROLES[table]) {
            const role = await roleOf(c, roleName);
            expect(await c.hasRole(role, safe), `${key}.${roleName} multisig`).to.equal(true);
          }
        }
        const market = contracts.CarbonMarketplace;
        expect(await market.hasRole(await market.FEE_MANAGER_ROLE(), safe)).to.equal(true);
        expect(await market.hasRole(await market.FEE_MANAGER_ROLE(), deployer)).to.equal(false);
        expect(await contracts.CarbonRegistry.hasRole(ZERO_ROLE, safe)).to.equal(true);
      });

      it("grants NATIVE_ISSUER_ROLE to the listed issuers only (not the deployer, not the EmissionVerifier by default)", async function () {
        const nft = contracts.CarbonCreditNFT;
        const role = await nft.NATIVE_ISSUER_ROLE();
        expect(await nft.hasRole(role, await contracts.EmissionVerifier.getAddress())).to.equal(false);
        expect(out.deployment.config.oracleIssuance).to.equal(false);
        expect(await nft.hasRole(role, signers[3].address)).to.equal(true);
        expect(await nft.hasRole(role, signers[4].address)).to.equal(true);
        expect(await nft.hasRole(role, deployer)).to.equal(false);
        expect(await nft.hasRole(role, await multisig.getAddress())).to.equal(false);
      });

      it("grants EXTERNAL_ISSUER_ROLE only to configured external issuers, never overlapping NATIVE_ISSUER_ROLE", async function () {
        const nft = contracts.CarbonCreditNFT;
        const issuerRole = await nft.NATIVE_ISSUER_ROLE();
        const externalRole = await nft.EXTERNAL_ISSUER_ROLE();
        for (const holder of [signers[3].address, signers[4].address]) {
          expect(await nft.hasRole(issuerRole, holder)).to.equal(true);
          expect(await nft.hasRole(externalRole, holder)).to.equal(false);
        }
        expect(await nft.hasRole(externalRole, deployer)).to.equal(false);
      });

      it("sets conservative launch limits, the Functions config and pauses nothing", async function () {
        const market = contracts.CarbonMarketplace;
        expect(await market.kycGateEnabled()).to.equal(true);
        expect(await market.tradingFeePercent()).to.equal(25n);
        expect(await market.minPricePerTonne()).to.equal(U(1));
        expect(await market.paymentDecimals()).to.equal(6n);
        for (const key of ["CarbonCreditNFT", "CCT_ICM_COMPLIANCE", "CCT_VERRA_VCS", "CCT_GOLD_STANDARD", "CarbonMarketplace", "CarbonRegistry"]) {
          expect(await contracts[key].paused(), key).to.equal(false);
        }
        for (const name of ["EmissionVerifier", "RegistrySync", "CarbonPriceOracle"]) {
          expect(await contracts[name].donId()).to.equal(ethers.encodeBytes32String("fun-robinhood-test-1"));
          expect(await contracts[name].subscriptionId()).to.equal(42n);
          expect(await contracts[name].functionsRouter()).to.equal(await router.getAddress());
        }
      });

      it("the deployer can no longer administer anything", async function () {
        const market = contracts.CarbonMarketplace;
        await expect(market.setKYCGate(false)).to.be.reverted;
        await expect(market.setTradingFee(50)).to.be.reverted;
        await expect(contracts.CarbonCreditNFT.pause()).to.be.reverted;
        await expect(contracts.CarbonCreditNFT.grantRole(await contracts.CarbonCreditNFT.NATIVE_ISSUER_ROLE(), deployer)).to.be.reverted;
        await expect(contracts.CarbonRegistry.pause()).to.be.reverted;
        await expect(
          contracts.EmissionVerifier.setFunctionsConfig(ethers.ZeroHash, 1, 300_000),
        ).to.be.reverted;
        await expect(contracts.CarbonCreditNFT.mintCredit(
          deployer, "P", "P", "S-1", "VERRA_VCS", E18, 2024, "IN", ethers.keccak256("0x01"), "", "u",
        )).to.be.reverted;
      });

      it("with the KYC gate on, AMM entry is gated for non-KYC wallets", async function () {
        const market = contracts.CarbonMarketplace;
        const bob = signers[6];
        await expect(market.connect(bob).addLiquidity(E18, U(5), 0, 0, 0)).to.be.revertedWith("KYC required");
        expect(await market.kycVerified(bob.address)).to.equal(false);
      });

      it("deploys the CARB stack: the whole supply goes to the treasury multisig, the deployer holds nothing", async function () {
        const { CarbToken: carb, CarbStaking: staking, IssuerBond: bond, CarbTimelock: timelock, CarbGovernor: governor } = out.tokens;
        const safe = await multisig.getAddress();
        const tsafe = await treasury.getAddress();
        expect(await carb.totalSupply()).to.equal(1_000_000_000n * E18);
        expect(await carb.balanceOf(tsafe)).to.equal(1_000_000_000n * E18);
        expect(await carb.balanceOf(deployer)).to.equal(0n);
        expect(await carb.balanceOf(safe)).to.equal(0n);
        expect(out.deployment.config.token).to.deep.include({ deployed: true, treasury: tsafe, stage: "dual", timelockMinDelay: 172800 });
        for (const key of ["CarbToken", "CarbStaking", "IssuerBond", "CarbTimelock", "CarbGovernor"]) {
          expect(out.deployment.contracts[key], key).to.match(/^0x[0-9a-fA-F]{40}$/);
          expect(out.deployment.constructorArgs[key], key).to.be.an("array");
        }
        expect(out.deployment.constructorArgs.CarbGovernor[6]).to.have.length(3);
        expect(out.deployment.gas.transactions).to.be.greaterThan(40);

        // the multisig holds every constructor role of staking / bond, the deployer none
        for (const [name, c] of [["CarbStaking", staking], ["IssuerBond", bond]]) {
          for (const roleName of CONSTRUCTOR_ROLES[name]) {
            expect(await c.hasRole(await roleOf(c, roleName), safe), `${name}.${roleName} multisig`).to.equal(true);
          }
        }
        const held = await assertDeployerHoldsNothing({
          roleContracts: { ...contracts, CarbStaking: staking, IssuerBond: bond },
          timelock,
          deployerAddress: deployer,
        });
        expect(held).to.deep.equal([]);
        await expect(staking.setTierDiscounts([0, 1, 2, 3])).to.be.reverted;
        await expect(bond.setMinBond(E18)).to.be.reverted;
        await expect(timelock.grantRole(await timelock.PROPOSER_ROLE(), deployer)).to.be.reverted;

        // timelock + governor
        expect(await timelock.getMinDelay()).to.equal(172800n);
        expect(await governor.votingDelay()).to.equal(86400n);
        expect(await governor.votingPeriod()).to.equal(5n * 86400n);
        expect(await governor.proposalThreshold()).to.equal(1_000_000n * E18);
        expect(await governor.quorumNumerator()).to.equal(4n);
        const gov = await governor.getAddress();
        const tl = await timelock.getAddress();
        expect(await timelock.hasRole(await timelock.PROPOSER_ROLE(), gov)).to.equal(true);
        expect(await timelock.hasRole(await timelock.CANCELLER_ROLE(), gov)).to.equal(true);
        expect(await timelock.hasRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress)).to.equal(true);
        expect(await timelock.hasRole(await timelock.TIMELOCK_ADMIN_ROLE(), safe)).to.equal(false);
        expect(await timelock.hasRole(await timelock.TIMELOCK_ADMIN_ROLE(), tl)).to.equal(true);
      });

      it("staged decentralisation: the timelock gets PARAMETER / SLASHER roles only, the multisig keeps DEFAULT_ADMIN and its copies", async function () {
        const { CarbStaking: staking, IssuerBond: bond, CarbTimelock: timelock } = out.tokens;
        const safe = await multisig.getAddress();
        const tl = await timelock.getAddress();
        const market = contracts.CarbonMarketplace;
        const nft = contracts.CarbonCreditNFT;
        expect(await market.hasRole(await market.PARAMETER_ROLE(), tl)).to.equal(true);
        expect(await staking.hasRole(await staking.PARAMETER_ROLE(), tl)).to.equal(true);
        expect(await bond.hasRole(await bond.PARAMETER_ROLE(), tl)).to.equal(true);
        expect(await bond.hasRole(await bond.SLASHER_ROLE(), tl)).to.equal(true);
        // multisig keeps its own copies (stage "dual") and every guardian role
        expect(await staking.hasRole(await staking.PARAMETER_ROLE(), safe)).to.equal(true);
        expect(await bond.hasRole(await bond.SLASHER_ROLE(), safe)).to.equal(true);
        for (const [c, roleName] of [
          [market, "DEFAULT_ADMIN_ROLE"], [market, "PAUSER_ROLE"], [market, "KYC_ROLE"], [market, "FEE_MANAGER_ROLE"],
          [nft, "DEFAULT_ADMIN_ROLE"], [nft, "PAUSER_ROLE"], [nft, "ISSUER_ADMIN_ROLE"],
          [staking, "DEFAULT_ADMIN_ROLE"], [bond, "DEFAULT_ADMIN_ROLE"],
        ]) {
          expect(await c.hasRole(await roleOf(c, roleName), safe), roleName).to.equal(true);
          expect(await c.hasRole(await roleOf(c, roleName), tl), `timelock ${roleName}`).to.equal(false);
        }
        for (const roleName of ["NATIVE_ISSUER_ROLE", "ORACLE_ROLE", "VERIFIER_ROLE"]) {
          expect(await nft.hasRole(await nft[roleName](), tl), roleName).to.equal(false);
        }
        // links: the bond has no NFT issuance authority; staking drives the fee discount
        expect(await nft.hasRole(await nft.ISSUER_ADMIN_ROLE(), await bond.getAddress())).to.equal(false);
        expect(await market.feeDiscountProvider()).to.equal(await staking.getAddress());
      });

      it("oracle enabled: sources hash-match, DON config stored, price sources and reporter set", async function () {
        const reporter = signers[7];
        for (const name of ["EmissionVerifier", "RegistrySync", "CarbonPriceOracle"]) {
          expect(await contracts[name].sourceHash(), name).to.equal(sourceHashOf(loadSource(SOURCE_FOR_CONTRACT[name])));
        }
        expect(await contracts.CarbonPriceOracle.getPriceSources()).to.deep.equal([
          "https://prices-a.example/{methodology}",
          "https://prices-b.example/{methodology}",
        ]);
        expect(out.deployment.functions).to.deep.include({ enabled: true, routerIsPlaceholder: false, subscriptionId: "42" });
        const oracle = contracts.CarbonPriceOracle;
        expect(await oracle.hasRole(await oracle.ORACLE_REPORTER_ROLE(), reporter.address)).to.equal(true);
        expect(await oracle.hasRole(await oracle.ORACLE_REPORTER_ROLE(), deployer)).to.equal(false);
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        await oracle.connect(reporter).reportPrice("VERRA_VCS", 15n * 10n ** 8n, 0, now);
        expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(15n * 10n ** 8n);
      });
    });

    it("ENABLE_ORACLE_ISSUANCE=yes also grants NATIVE_ISSUER_ROLE to the EmissionVerifier", async function () {
      const res = await deployMainnet({
        hre,
        outDir: newDir(),
        env: { ...baseEnv, CONFIRM_MAINNET: "yes", ENABLE_ORACLE_ISSUANCE: "yes", ISSUER_ADDRESS: "" },
        quiet: true,
      });
      const nft = res.contracts.CarbonCreditNFT;
      expect(await nft.hasRole(await nft.NATIVE_ISSUER_ROLE(), await res.contracts.EmissionVerifier.getAddress())).to.equal(true);
      expect(res.deployment.config.oracleIssuance).to.equal(true);
      expect(res.deployment.roles.issuers).to.deep.equal([await res.contracts.EmissionVerifier.getAddress()]);
    });

    describe("role handover logic is checked independently and fails loudly", function () {
      let deployed;
      let info;
      let protocol;

      before(async function () {
        deployed = await deployAll({ hre, outDir: newDir(), quiet: true });
        protocol = Object.fromEntries(
          Object.entries(deployed.contracts).filter(([k]) => k !== "USDC" && k !== "FunctionsRouter"),
        );
        info = Object.fromEntries(
          Object.entries(protocol).map(([k, c]) => [k, { address: null, c }]),
        );
        for (const [k, v] of Object.entries(info)) v.address = await v.c.getAddress();
      });

      it("verifyFinalState throws while the deployer still holds roles, passes after handOver", async function () {
        const deployer = signers[0].address;
        const safe = signers[5].address;
        const cfg = { tradingFeeBps: 25, minPriceUsd: "0.01", kycGateEnabled: true, oracleIssuance: true };
        const args = { contracts: protocol, info, deployerAddress: deployer, multisig: safe, issuers: [], cfg, paymentDecimals: 6, ethers };

        await expect(verifyFinalState(args)).to.be.rejectedWith(/FINAL STATE CHECK FAILED: deployer still holds/);

        await handOver({ contracts: protocol, deployerAddress: deployer, multisig: safe, log: () => {} });
        await verifyFinalState(args);

        // a wrong expectation is caught too
        await expect(verifyFinalState({ ...args, cfg: { ...cfg, tradingFeeBps: 30 } })).to.be.rejectedWith(/trading fee mismatch/);
        await expect(verifyFinalState({ ...args, cfg: { ...cfg, kycGateEnabled: false } })).to.be.rejectedWith(/KYC gate flag mismatch/);

        await expect(verifyFinalState({ ...args, cfg: { ...cfg, oracleIssuance: false } })).to.be.rejectedWith(
          /EmissionVerifier holds NATIVE_ISSUER_ROLE/,
        );

        // and the handover is idempotent (re-running changes nothing and does not throw)
        const nonce = await ethers.provider.getTransactionCount(deployer);
        await handOver({ contracts: protocol, deployerAddress: deployer, multisig: safe, log: () => {} });
        expect(await ethers.provider.getTransactionCount(deployer)).to.equal(nonce);
        expect(await roleId(protocol.CarbonCreditNFT, "DEFAULT_ADMIN_ROLE")).to.equal(ZERO_ROLE);
      });
    });
  });

  // ------------------------------------------------------------------------------------------
  // CARB_TOKEN_ADDRESS: the CARB token already exists (launchpad): 9 decimals, no burn, no votes (PlainERC20).
  // ------------------------------------------------------------------------------------------
  describe("CARB_TOKEN_ADDRESS: bring your own token", function () {
    const K9 = (n) => ethers.parseUnits(n.toString(), 9);
    let signers;
    let plain;
    let plainAddress;
    let native;
    let usdc;
    let multisig;
    let baseEnv;

    const deployPlain = async (decimals = 9, supplyTokens = 1_000_000_000) => {
      const t = await (await ethers.getContractFactory("PlainERC20")).deploy("Launchpad CARB", "CARB", decimals);
      if (supplyTokens > 0) await t.mint(signers[0].address, ethers.parseUnits(String(supplyTokens), decimals));
      return t;
    };
    const nonceOf = () => ethers.provider.getTransactionCount(signers[0].address);

    before(async function () {
      signers = await ethers.getSigners();
      plain = await deployPlain();
      plainAddress = await plain.getAddress();
      native = await (await ethers.getContractFactory("CarbToken")).deploy(signers[0].address);
      usdc = await (await ethers.getContractFactory("MockERC20")).deploy("Global Dollar", "USDG", 6);
      multisig = await (await ethers.getContractFactory("MockERC20")).deploy("Safe stand-in", "SAFE", 6);
      baseEnv = {
        MAINNET_USDG: await usdc.getAddress(),
        ADMIN_MULTISIG: await multisig.getAddress(),
        ALLOW_CHAINID_OVERRIDE_HARDHAT: "1",
        CONFIRM_MAINNET: "yes",
      };
    });

    describe("22_attach_token_check.js (read-only go / no-go)", function () {
      const check = (address, extra = {}) => attachTokenCheck({ hre, env: { CARB_TOKEN_ADDRESS: address, ...extra }, quiet: true });
      const row = (res, name) => res.rows.find((r) => r.check === name);

      it("GO for a plain 9-decimals token: no burn, no votes -> sink + wrapper; fee-on-transfer is enforced onchain", async function () {
        const nonce = await nonceOf();
        const res = await check(plainAddress);
        expect(res.go).to.equal(true);
        expect(res.votesMode).to.equal("wrapper");
        expect(res.report).to.deep.include({ symbol: "CARB", name: "Launchpad CARB", decimals: 9 });
        expect(res.report.burn.likely).to.equal(false);
        expect(row(res, "decimals").status).to.equal("OK");
        expect(row(res, "fee-on-transfer").detail).to.match(/Enforced onchain/);
        expect(row(res, "burn(uint256)").detail).to.match(/slash sink/);
        expect(await nonceOf()).to.equal(nonce); // read-only
      });

      it("GO for a token that is ERC-5805 with a timestamp clock and has burn(): native votes, burned slashes", async function () {
        const res = await check(await native.getAddress());
        expect(res.go).to.equal(true);
        expect(res.votesMode).to.equal("native");
        expect(res.report.votes.native).to.equal(true);
        expect(res.report.burn.likely).to.equal(true);
        expect(res.report.decimals).to.equal(18);
      });

      it("NO-GO: no code, absurd decimals, zero supply, forced native votes on a token without votes, bad address", async function () {
        const eoa = await check(signers[5].address);
        expect(eoa.go).to.equal(false);
        expect(eoa.rows[0]).to.deep.include({ check: "contract code", status: "FAIL" });
        expect((await check(await (await deployPlain(25)).getAddress())).go).to.equal(false);
        expect((await check(await (await deployPlain(9, 0)).getAddress())).go).to.equal(false);
        expect((await check(plainAddress, { CARB_VOTES_MODE: "native" })).go).to.equal(false);
        await expect(check("0x1234")).to.be.rejectedWith(/CARB_TOKEN_ADDRESS/);
        await expect(check(plainAddress, { CARB_VOTES_MODE: "both" })).to.be.rejectedWith(/CARB_VOTES_MODE/);
      });
    });

    describe("10_deploy_all.js (testnet)", function () {
      it("attaches the token: confirmation required, thresholds scaled to 9 decimals, CarbVotes as governor token", async function () {
        const env = { CARB_TOKEN_ADDRESS: plainAddress };
        const tiny = await deployPlain(9, 5_000);
        const nonce = await nonceOf();
        await expect(deployAll({ hre, outDir: newDir(), quiet: true, env })).to.be.rejectedWith(/CONFIRM_TOKEN=CARB is required/);
        await expect(deployAll({ hre, outDir: newDir(), quiet: true, env: { ...env, CONFIRM_TOKEN: "carb" } })).to.be.rejectedWith(/CONFIRM_TOKEN=CARB/);
        // bounds: whole tokens, scaled by decimals; a 10th fraction digit does not exist at 9 decimals; nothing above the supply
        const ok = { ...env, CONFIRM_TOKEN: "CARB" };
        await expect(deployAll({ hre, outDir: newDir(), quiet: true, env: { ...ok, GOV_PROPOSAL_THRESHOLD_CARB: "60000000" } })).to.be.rejectedWith(
          /GOV_PROPOSAL_THRESHOLD_CARB/,
        );
        await expect(deployAll({ hre, outDir: newDir(), quiet: true, env: { ...ok, BOND_MIN_CARB: "1.1234567891" } })).to.be.rejectedWith(/BOND_MIN_CARB/);
        await expect(deployAll({ hre, outDir: newDir(), quiet: true, env: { ...ok, STAKING_THRESHOLDS_CARB: "1,2,0" } })).to.be.rejectedWith(
          /STAKING_THRESHOLDS_CARB/,
        );
        await expect(
          deployAll({ hre, outDir: newDir(), quiet: true, env: { CARB_TOKEN_ADDRESS: await tiny.getAddress(), CONFIRM_TOKEN: "CARB" } }),
        ).to.be.rejectedWith(/exceeds the token's total supply/);
        expect(await nonceOf()).to.equal(nonce); // every refusal happened before the first transaction

        const dir = newDir();
        const out = await deployAll({ hre, outDir: dir, quiet: true, env: ok });
        const d = readJson(path.join(dir, "hardhat.json"));
        const { CarbStaking: staking, IssuerBond: bond, CarbGovernor: governor, CarbVotes: votes, CarbToken: carb } = out.tokens;

        expect(d.externalToken).to.equal(true);
        expect(d.contracts.CarbToken).to.equal(plainAddress);
        expect(d.contracts.CarbVotes).to.equal(await votes.getAddress());
        expect(d.deployBlocks).to.not.have.property("CarbToken"); // not deployed by us
        expect(d.deployBlocks.CarbVotes).to.be.greaterThan(0);
        expect(d.constructorArgs.CarbVotes).to.deep.equal([plainAddress]);
        expect(d.config.token).to.deep.include({ decimals: 9, treasury: null });
        expect(d.config.token.external).to.deep.equal({
          address: plainAddress,
          symbol: "CARB",
          name: "Launchpad CARB",
          decimals: 9,
          totalSupply: K9(1_000_000_000).toString(),
          burn: false,
          votes: "wrapper",
        });

        expect(await carb.getAddress()).to.equal(plainAddress);
        expect(await staking.carb()).to.equal(plainAddress);
        expect(await bond.carb()).to.equal(plainAddress);
        expect(await votes.underlying()).to.equal(plainAddress);
        expect(await governor.token()).to.equal(await votes.getAddress());
        expect(await staking.tokenDecimals()).to.equal(9n);
        expect(await staking.tierThresholds(0)).to.equal(K9(1_000));
        expect(await staking.tierThresholds(2)).to.equal(K9(25_000));
        expect(await bond.minBond()).to.equal(K9(10_000));
        expect(await bond.slashSink()).to.equal("0x000000000000000000000000000000000000dEaD");
        expect(await governor.proposalThreshold()).to.equal(K9(1_000_000));
        // the app-facing env: external CA + wrapper
        const values = buildValues(d);
        expect(values.NEXT_PUBLIC_CARB_TOKEN).to.equal(plainAddress);
        expect(values.NEXT_PUBLIC_CARB_VOTES).to.equal(await votes.getAddress());
        expect(values.NEXT_PUBLIC_CARB_EXTERNAL).to.equal("true");
        expect(buildVercelText(values, "robinhood", d)).to.match(/NEXT_PUBLIC_CARB_EXTERNAL=true/);
        expect(buildVercelText(values, "robinhood", d)).to.match(new RegExp(`NEXT_PUBLIC_CARB_VOTES=${await votes.getAddress()}`));
        expect(applyToEnvText("", { values, networkName: "robinhood", deployment: d })).to.match(/# CARB: EXTERNAL token CARB \(9 decimals\)/);

        // it works: stake at the 9-decimals tier, wrap + delegate for votes
        await plain.approve(await staking.getAddress(), ethers.MaxUint256);
        await staking.stake(K9(5_000));
        await plain.approve(await votes.getAddress(), ethers.MaxUint256);
        await votes.depositFor(signers[0].address, K9(2_000_000));
        await votes.delegate(signers[0].address);
        expect(await votes.getVotes(signers[0].address)).to.equal(K9(2_000_000));
        await hre.network.provider.send("evm_increaseTime", [4 * 86400]);
        await hre.network.provider.send("evm_mine");
        expect(await staking.tierOf(signers[0].address)).to.equal(2n);
      });

      it("honours explicit whole-token overrides (scaled by decimals) and forced wrapper mode on a token with votes", async function () {
        const dir = newDir();
        const out = await deployAll({
          hre,
          outDir: dir,
          quiet: true,
          env: {
            CARB_TOKEN_ADDRESS: plainAddress,
            CONFIRM_TOKEN: "CARB",
            STAKING_THRESHOLDS_CARB: "10,50,250",
            BOND_MIN_CARB: "5.5",
            GOV_PROPOSAL_THRESHOLD_CARB: "500",
          },
        });
        const { CarbStaking: staking, IssuerBond: bond, CarbGovernor: governor } = out.tokens;
        expect(await staking.tierThresholds(0)).to.equal(K9(10));
        expect(await staking.tierThresholds(1)).to.equal(K9(50));
        expect(await staking.tierThresholds(2)).to.equal(K9(250));
        expect(await bond.minBond()).to.equal(K9(5.5));
        expect(await governor.proposalThreshold()).to.equal(K9(500));

        // a token that is ERC-5805 can still be wrapped on request
        const forced = await deployAll({
          hre,
          outDir: newDir(),
          quiet: true,
          env: { CARB_TOKEN_ADDRESS: await native.getAddress(), CONFIRM_TOKEN: "CARB", CARB_VOTES_MODE: "wrapper" },
        });
        expect(await forced.tokens.CarbGovernor.token()).to.equal(await forced.tokens.CarbVotes.getAddress());
        expect(await forced.tokens.CarbStaking.tierThresholds(0)).to.equal(ethers.parseUnits("1000", 18));
      });

      it("a token with native timestamp votes needs no wrapper: the governor reads the token itself", async function () {
        const nativeAddress = await native.getAddress();
        const dir = newDir();
        const out = await deployAll({ hre, outDir: dir, quiet: true, env: { CARB_TOKEN_ADDRESS: nativeAddress, CONFIRM_TOKEN: "CARB" } });
        const d = readJson(path.join(dir, "hardhat.json"));
        expect(d.externalToken).to.equal(true);
        expect(d.contracts).to.not.have.property("CarbVotes");
        expect(d.config.token.external).to.deep.include({ votes: "native", burn: true, decimals: 18 });
        expect(out.tokens).to.not.have.property("CarbVotes");
        expect(await out.tokens.CarbGovernor.token()).to.equal(nativeAddress);
        expect(buildValues(d)).to.not.have.property("NEXT_PUBLIC_CARB_VOTES");
        expect(buildValues(d).NEXT_PUBLIC_CARB_EXTERNAL).to.equal("true");
        expect(d.deployBlocks).to.not.have.property("CarbToken");
      });
    });

    describe("20_deploy_mainnet.js", function () {
      it("CARB_TOKEN_ADDRESS: no treasury needed, confirmation required, deployer ends with no role, env lines for the app", async function () {
        const env = { ...baseEnv, CARB_TOKEN_ADDRESS: plainAddress };
        const nonce = await nonceOf();
        const dry = await deployMainnet({ hre, outDir: newDir(), quiet: true, env: { ...env, CONFIRM_MAINNET: "no" } });
        expect(dry.dryRun).to.equal(true);
        await expect(deployMainnet({ hre, outDir: newDir(), quiet: true, env })).to.be.rejectedWith(/CONFIRM_TOKEN=CARB is required/);
        await expect(deployMainnet({ hre, outDir: newDir(), quiet: true, env: { ...env, DEPLOY_TOKEN: "no", CONFIRM_TOKEN: "CARB" } })).to.be.rejectedWith(
          /CARB_TOKEN_ADDRESS needs the token stack/,
        );
        expect(await nonceOf()).to.equal(nonce);

        const dir = newDir();
        const out = await deployMainnet({ hre, outDir: dir, quiet: true, env: { ...env, CONFIRM_TOKEN: "CARB" } });
        const d = readJson(path.join(dir, "robinhoodMainnet.json"));
        expect(d.externalToken).to.equal(true);
        expect(d.contracts.CarbToken).to.equal(plainAddress);
        expect(d.contracts.CarbVotes).to.match(/^0x[0-9a-fA-F]{40}$/);
        expect(d.config.token).to.deep.include({ deployed: true, decimals: 9, treasury: null });
        expect(d.config.token.external.symbol).to.equal("CARB");
        expect(await out.tokens.CarbStaking.tokenDecimals()).to.equal(9n);
        expect(await out.tokens.CarbGovernor.token()).to.equal(d.contracts.CarbVotes);
        const held = await assertDeployerHoldsNothing({
          roleContracts: { CarbStaking: out.tokens.CarbStaking, IssuerBond: out.tokens.IssuerBond },
          timelock: out.tokens.CarbTimelock,
          deployerAddress: signers[0].address,
        });
        expect(held).to.deep.equal([]);

        const values = buildValues({ ...d, isTestnet: false });
        expect(values.NEXT_PUBLIC_CARB_TOKEN).to.equal(plainAddress);
        expect(values.NEXT_PUBLIC_CARB_VOTES).to.equal(d.contracts.CarbVotes);
      });
    });

    describe("DEPLOY_TOKEN=no first, the token launches later, 21_deploy_token_mainnet.js attaches it by address", function () {
      let dir;
      let protocolOnly;

      before(async function () {
        dir = newDir();
        protocolOnly = await deployMainnet({ hre, outDir: dir, quiet: true, env: { ...baseEnv, DEPLOY_TOKEN: "no" } });
      });

      it("dry run needs no confirmation; broadcasting needs CONFIRM_TOKEN; then it deploys, hands over and lists the multisig steps", async function () {
        const env = { ...baseEnv, CARB_TOKEN_ADDRESS: plainAddress };
        const nonce = await nonceOf();
        const dry = await deployTokenMainnet({ hre, outDir: dir, quiet: true, env: { ...env, CONFIRM_MAINNET: "no" } });
        expect(dry.dryRun).to.equal(true);
        expect(dry.summary.external).to.deep.include({ symbol: "CARB", decimals: 9, votes: "wrapper", confirmed: false });
        await expect(deployTokenMainnet({ hre, outDir: dir, quiet: true, env })).to.be.rejectedWith(/CONFIRM_TOKEN=CARB is required/);
        await expect(
          deployTokenMainnet({ hre, outDir: dir, quiet: true, env: { ...env, CONFIRM_TOKEN: "CARB", GOV_PROPOSAL_THRESHOLD_CARB: "60000000" } }),
        ).to.be.rejectedWith(/GOV_PROPOSAL_THRESHOLD_CARB/);
        expect(await nonceOf()).to.equal(nonce);

        const out = await deployTokenMainnet({ hre, outDir: dir, quiet: true, env: { ...env, CONFIRM_TOKEN: "CARB" } });
        expect(out.deployed).to.equal(true);
        const d = readJson(path.join(dir, "robinhoodMainnet.json"));
        expect(d.externalToken).to.equal(true);
        expect(d.contracts.CarbToken).to.equal(plainAddress);
        expect(d.contracts.CarbVotes).to.equal(await out.tokens.CarbVotes.getAddress());
        expect(d.deployBlocks).to.not.have.property("CarbToken");
        expect(d.config.token).to.deep.include({ deployed: true, decimals: 9, treasury: null, stage: "dual" });
        expect(readJson(path.join(dir, "robinhoodMainnet.previous.json")).contracts).to.not.have.property("CarbToken");

        const { CarbStaking: staking, IssuerBond: bond, CarbTimelock: timelock, CarbVotes: votes } = out.tokens;
        const safe = await multisig.getAddress();
        for (const roleName of CONSTRUCTOR_ROLES.IssuerBond) {
          expect(await bond.hasRole(await roleOf(bond, roleName), safe)).to.equal(true);
        }
        expect(await assertDeployerHoldsNothing({ roleContracts: { CarbStaking: staking, IssuerBond: bond }, timelock, deployerAddress: signers[0].address })).to.deep.equal([]);
        expect(out.pending).to.have.length(2);

        // check mode: the address is read from the deployment file; a different address is refused
        const check = await deployTokenMainnet({ hre, outDir: dir, quiet: true, env: baseEnv });
        expect(check.deployed).to.equal(false);
        expect(check.pending).to.have.length(2);
        expect((await deployTokenMainnet({ hre, outDir: dir, quiet: true, env })).deployed).to.equal(false);
        await expect(
          deployTokenMainnet({ hre, outDir: dir, quiet: true, env: { ...baseEnv, CARB_TOKEN_ADDRESS: await native.getAddress() } }),
        ).to.be.rejectedWith(/differs from the token in the deployment file/);

        // the multisig executes its transactions: the links are clean and the bond path works with the 9-decimals token
        const txs = readJson(path.join(dir, "robinhoodMainnet.token-multisig-txs.json"));
        await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [safe] });
        await hre.network.provider.request({ method: "hardhat_setBalance", params: [safe, "0xde0b6b3a7640000"] });
        const asSafe = await ethers.getSigner(safe);
        for (const tx of txs.transactions) await (await asSafe.sendTransaction({ to: tx.to, data: tx.data })).wait();
        await hre.network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [safe] });
        expect((await deployTokenMainnet({ hre, outDir: dir, quiet: true, env: baseEnv })).pending).to.have.length(0);

        const market = protocolOnly.contracts.CarbonMarketplace;
        expect(await market.feeDiscountProvider()).to.equal(await staking.getAddress());
        const nft = protocolOnly.contracts.CarbonCreditNFT;
        await plain.approve(await bond.getAddress(), ethers.MaxUint256);
        expect(await bond.bondRequired()).to.equal(false);
        expect(await nft.hasRole(await nft.ISSUER_ADMIN_ROLE(), await bond.getAddress())).to.equal(false);
        expect(await votes.decimals()).to.equal(9n);
      });
    });
  });
});
