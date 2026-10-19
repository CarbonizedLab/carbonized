/**
 * Oracle layer / Chainlink Functions setup: source setter, config, DON-hosted secrets and the exact request
 * (CBOR payload, subscription, DON id, callback gas) each contract hands to the router.
 * Run: npx hardhat test test/unit/OracleFunctionsSetup.test.js
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  E18, DAY, DON_ID, SUB_ID, GAS_LIMIT, PRICE_URLS, IOT_URL, CROSS_URL, REGISTRY_URL,
  deployRouter, deployPriceOracle, deployVerifier, deploySync, configure, decodeRouterRequest, loadSource, sourceHashOf,
} = require("../helpers/oracle");

const MISSING_ROLE = /is missing role/;
const MAX_SOURCE = 16_000;

async function fixture() {
  const [admin, stranger, owner] = await ethers.getSigners();
  const router = await deployRouter();
  const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
  const oracle = await deployPriceOracle(router);
  const verifier = await deployVerifier(router, nft);
  const sync = await deploySync(router, nft);
  for (const id of ["P1", "P2"]) {
    await verifier.registerProject(id, owner.address, "VERRA_VCS", 10_000n * E18, 30, 30 * DAY, IOT_URL, CROSS_URL, ethers.ZeroHash);
  }
  return { admin, stranger, owner, router, nft, oracle, verifier, sync };
}

/** Per contract: how to trigger one request and what args it must carry. */
const CASES = {
  CarbonPriceOracle: {
    source: "price",
    trigger: async ({ oracle }, n = 0) => oracle.updatePrice(["VERRA_VCS", "ICM_COMPLIANCE"][n]),
    args: () => ["VERRA_VCS", "2000", ...PRICE_URLS],
  },
  EmissionVerifier: {
    source: "emission",
    trigger: async ({ verifier }, n = 0) => {
      await time.increase(30 * DAY + 1);
      return verifier.requestVerification(["P1", "P2"][n]);
    },
    args: async ({ verifier }, tx) => {
      const lastVerification = (await verifier.getProject("P1")).lastVerificationTime;
      const block = await ethers.provider.getBlock((await tx.wait()).blockNumber);
      return ["P1", IOT_URL, CROSS_URL, "1500", lastVerification.toString(), block.timestamp.toString()];
    },
  },
  RegistrySync: {
    source: "registry",
    trigger: async ({ sync }, n = 0) => sync.checkRegistry("VERRA", ["VCS-001", "VCS-002"][n]),
    args: () => ["VERRA", "VCS-001", REGISTRY_URL],
  },
};
const contractOf = (ctx, name) =>
  ({ CarbonPriceOracle: ctx.oracle, EmissionVerifier: ctx.verifier, RegistrySync: ctx.sync })[name];
const lastRequestId = (router) => router.lastRequestId();

describe("Oracle layer: Functions setup", function () {
  for (const [name, spec] of Object.entries(CASES)) {
    describe(`${name}: source / config / secrets`, function () {
      it("setSource is admin-only, bounded, emits SourceUpdated and exposes sourceHash", async function () {
        const ctx = await loadFixture(fixture);
        const c = contractOf(ctx, name);

        // freshly deployed (no configuration): no source, zero hash
        const router = await deployRouter();
        const fresh =
          name === "CarbonPriceOracle"
            ? await deployPriceOracle(router, { configured: false })
            : name === "EmissionVerifier"
              ? await deployVerifier(router, ctx.nft, { configured: false })
              : await deploySync(router, ctx.nft, { configured: false });
        expect(await fresh.source()).to.equal("");
        expect(await fresh.sourceHash()).to.equal(ethers.ZeroHash);

        const text = loadSource(spec.source);
        await expect(fresh.connect(ctx.stranger).setSource(text)).to.be.revertedWith(MISSING_ROLE);
        await expect(fresh.setSource("")).to.be.revertedWith("Invalid source length");
        await expect(fresh.setSource("x".repeat(MAX_SOURCE + 1))).to.be.revertedWith("Invalid source length");

        await expect(fresh.setSource(text))
          .to.emit(fresh, "SourceUpdated")
          .withArgs(sourceHashOf(text), Buffer.byteLength(text));
        expect(await fresh.source()).to.equal(text);
        expect(await fresh.sourceHash()).to.equal(sourceHashOf(text));

        // replacing changes the hash again; the boundary length is accepted
        const max = "a".repeat(MAX_SOURCE);
        await fresh.setSource(max);
        expect(await fresh.sourceHash()).to.equal(ethers.keccak256(ethers.toUtf8Bytes(max)));
        expect(await fresh.MAX_SOURCE_LENGTH()).to.equal(BigInt(MAX_SOURCE));
        expect(await c.sourceHash()).to.equal(sourceHashOf(text)); // other instance untouched
      });

      it("the deployed reference source is what scripts/functions would upload (hash matches)", async function () {
        const ctx = await loadFixture(fixture);
        const c = contractOf(ctx, name);
        const text = loadSource(spec.source);
        expect(await c.source()).to.equal(text);
        expect(await c.sourceHash()).to.equal(sourceHashOf(text));
        expect(Buffer.byteLength(text)).to.be.lessThan(MAX_SOURCE);
      });

      it("setFunctionsConfig / setDONHostedSecrets: admin-only, bounded, emit", async function () {
        const ctx = await loadFixture(fixture);
        const c = contractOf(ctx, name);
        const don = ethers.encodeBytes32String("fun-other");

        await expect(c.connect(ctx.stranger).setFunctionsConfig(don, 1, 300_000)).to.be.revertedWith(MISSING_ROLE);
        await expect(c.setFunctionsConfig(don, 1, 199_999)).to.be.revertedWith("Gas limit out of bounds");
        await expect(c.setFunctionsConfig(don, 1, 1_000_001)).to.be.revertedWith("Gas limit out of bounds");
        await expect(c.setFunctionsConfig(don, 9, 450_000)).to.emit(c, "FunctionsConfigUpdated").withArgs(don, 9, 450_000);
        expect([await c.donId(), await c.subscriptionId(), await c.gasLimit()]).to.deep.equal([don, 9n, 450_000n]);

        await expect(c.connect(ctx.stranger).setDONHostedSecrets(1, 5)).to.be.revertedWith(MISSING_ROLE);
        await expect(c.setDONHostedSecrets(3, 1_700_000_000)).to.emit(c, "DONHostedSecretsUpdated").withArgs(3, 1_700_000_000);
        expect([await c.secretsSlotId(), await c.secretsVersion()]).to.deep.equal([3n, 1_700_000_000n]);
      });

      it("a request needs a source and a configured DON/subscription", async function () {
        const ctx = await loadFixture(fixture);
        const router = await deployRouter();
        if (name === "CarbonPriceOracle") {
          const o = await deployPriceOracle(router, { configured: false });
          await o.setPriceSources(PRICE_URLS);
          await expect(o.updatePrice("VERRA_VCS")).to.be.revertedWith("Source not set");
          await o.setSource(loadSource("price"));
          await expect(o.updatePrice("VERRA_VCS")).to.be.revertedWith("Functions not configured");
          await o.setFunctionsConfig(DON_ID, 0, GAS_LIMIT); // subscription 0 is not a subscription
          await expect(o.updatePrice("VERRA_VCS")).to.be.revertedWith("Functions not configured");
          await o.setFunctionsConfig(DON_ID, SUB_ID, GAS_LIMIT);
          await o.updatePrice("VERRA_VCS");
        } else if (name === "EmissionVerifier") {
          const v = await deployVerifier(router, ctx.nft, { configured: false });
          await v.registerProject("P1", ctx.owner.address, "VERRA_VCS", E18, 30, DAY, IOT_URL, "", ethers.ZeroHash);
          await time.increase(DAY + 1);
          await expect(v.requestVerification("P1")).to.be.revertedWith("Source not set");
          await v.setSource(loadSource("emission"));
          await expect(v.requestVerification("P1")).to.be.revertedWith("Functions not configured");
          await v.setFunctionsConfig(DON_ID, SUB_ID, GAS_LIMIT);
          await v.requestVerification("P1");
        } else {
          const s = await deploySync(router, ctx.nft, { configured: false });
          await s.setRegistryEndpoint("VERRA", REGISTRY_URL);
          await s.setRegistryStatus("VERRA", true);
          await expect(s.checkRegistry("VERRA", "S")).to.be.revertedWith("Source not set");
          await s.setSource(loadSource("registry"));
          await expect(s.checkRegistry("VERRA", "S")).to.be.revertedWith("Functions not configured");
          await s.setFunctionsConfig(DON_ID, SUB_ID, GAS_LIMIT);
          await s.checkRegistry("VERRA", "S");
        }
      });

      it("builds the request the DON receives: inline JS source, exact args, subscription, DON id, callback gas", async function () {
        const ctx = await loadFixture(fixture);
        const c = contractOf(ctx, name);
        const tx = await spec.trigger(ctx);
        const id = await lastRequestId(ctx.router);
        const req = await decodeRouterRequest(ctx.router, id);

        expect(req.client).to.equal(await c.getAddress());
        expect(req.subscriptionId).to.equal(SUB_ID);
        expect(req.donId).to.equal(DON_ID);
        expect(req.callbackGasLimit).to.equal(GAS_LIMIT);
        expect(req.dataVersion).to.equal(1n); // FunctionsRequest.REQUEST_DATA_VERSION
        expect(req.codeLocation).to.equal(0); // Inline
        expect(req.language).to.equal(0); // JavaScript
        expect(req.source).to.equal(loadSource(spec.source));
        expect(req.args).to.deep.equal(await spec.args(ctx, tx));
        expect(req.secrets).to.equal(undefined); // no secrets by default
        expect(req.secretsLocation).to.equal(undefined);
      });

      it("uses a changed subscription / DON / gas limit and attaches DON-hosted secrets only when configured", async function () {
        const ctx = await loadFixture(fixture);
        const c = contractOf(ctx, name);
        const don = ethers.encodeBytes32String("fun-second");
        await c.setFunctionsConfig(don, 777, 650_000);
        await c.setDONHostedSecrets(2, 1_234_567);

        await spec.trigger(ctx);
        const req = await decodeRouterRequest(ctx.router, await lastRequestId(ctx.router));
        expect(req.subscriptionId).to.equal(777n);
        expect(req.donId).to.equal(don);
        expect(req.callbackGasLimit).to.equal(650_000n);
        expect(req.secretsLocation).to.equal(2); // DONHosted
        expect(req.donHostedSecrets).to.deep.equal({ slotID: 2, version: 1_234_567 });

        // version 0 detaches the secrets again
        await c.setDONHostedSecrets(2, 0);
        await spec.trigger(ctx, 1);
        const req2 = await decodeRouterRequest(ctx.router, await lastRequestId(ctx.router));
        expect(req2.secrets).to.equal(undefined);
      });
    });
  }

  it("constructors refuse a zero Functions router", async function () {
    const { nft } = await loadFixture(fixture);
    const zero = ethers.ZeroAddress;
    await expect((await ethers.getContractFactory("CarbonPriceOracle")).deploy(zero)).to.be.revertedWith("Invalid router");
    await expect((await ethers.getContractFactory("EmissionVerifier")).deploy(zero, await nft.getAddress())).to.be.revertedWith("Invalid router");
    await expect((await ethers.getContractFactory("RegistrySync")).deploy(zero, await nft.getAddress())).to.be.revertedWith("Invalid router");
  });

  describe("CarbonPriceOracle: sources", function () {
    it("price source URLs are admin-set, https-only, 1..5, bounded; args follow the stored list", async function () {
      const { oracle, stranger, router } = await loadFixture(fixture);
      expect(await oracle.getPriceSources()).to.deep.equal(PRICE_URLS);
      await expect(oracle.connect(stranger).setPriceSources(PRICE_URLS)).to.be.revertedWith(MISSING_ROLE);
      await expect(oracle.setPriceSources([])).to.be.revertedWith("Invalid source count");
      await expect(oracle.setPriceSources(Array.from({ length: 6 }, (_, i) => `https://s${i}.test/{methodology}`))).to.be.revertedWith(
        "Invalid source count",
      );
      await expect(oracle.setPriceSources(["http://insecure.test/x"])).to.be.revertedWith("URL must be https");
      await expect(oracle.setPriceSources(["ftp://x.test/x"])).to.be.revertedWith("URL must be https");
      await expect(oracle.setPriceSources([""])).to.be.revertedWith("Invalid URL length");
      await expect(oracle.setPriceSources([`https://x.test/${"a".repeat(600)}`])).to.be.revertedWith("Invalid URL length");

      const one = ["https://only.test/p?m={methodology}"];
      await expect(oracle.setPriceSources(one)).to.emit(oracle, "PriceSourcesUpdated").withArgs(one);
      expect(await oracle.getPriceSources()).to.deep.equal(one);
      await oracle.updatePrice("GOLD_STANDARD");
      const req = await decodeRouterRequest(router, await router.lastRequestId());
      expect(req.args).to.deep.equal(["GOLD_STANDARD", "2000", ...one]);

      // the spread passed to the source is admin-set within 1%..50%
      await expect(oracle.setMaxSourceSpread(99)).to.be.revertedWith("Invalid spread");
      await expect(oracle.setMaxSourceSpread(5001)).to.be.revertedWith("Invalid spread");
      await expect(oracle.connect(stranger).setMaxSourceSpread(500)).to.be.revertedWith(MISSING_ROLE);
      await expect(oracle.setMaxSourceSpread(500)).to.emit(oracle, "MaxSourceSpreadChanged").withArgs(500);
      await oracle.updatePrice("GOLD_STANDARD");
      expect((await decodeRouterRequest(router, await router.lastRequestId())).args[1]).to.equal("500");
    });

    it("updateAllPrices sends one request per methodology; no sources configured => revert", async function () {
      const { router } = await loadFixture(fixture);
      const bare = await deployPriceOracle(router, { configured: false });
      await configure(bare, "price");
      await expect(bare.updateAllPrices()).to.be.revertedWith("No price sources");
      await bare.setPriceSources(PRICE_URLS);
      await bare.updateAllPrices();
      const ids = (await bare.queryFilter(bare.filters.PriceRequested())).map((e) => e.args.methodology);
      expect(ids.length).to.equal(3);
    });
  });

  describe("EmissionVerifier: project endpoints + tolerance", function () {
    it("registerProject validates the measurement / cross-check URL templates and the project id length", async function () {
      const { verifier, owner } = await loadFixture(fixture);
      const reg = (id, iot, cross) =>
        verifier.registerProject(id, owner.address, "VERRA_VCS", E18, 30, DAY, iot, cross, ethers.ZeroHash);
      await expect(reg("A", "", "")).to.be.revertedWith("Invalid URL length");
      await expect(reg("A", "http://iot.test/{projectId}", "")).to.be.revertedWith("URL must be https");
      await expect(reg("A", IOT_URL, "28.6,77.2")).to.be.revertedWith("URL must be https"); // coordinates are not a URL
      await expect(reg("A", IOT_URL, "http://ref.test/x")).to.be.revertedWith("URL must be https");
      await expect(reg("A", `https://x.test/${"a".repeat(600)}`, "")).to.be.revertedWith("Invalid URL length");
      await expect(reg("x".repeat(65), IOT_URL, "")).to.be.revertedWith("Invalid project ID");
      await reg("A", IOT_URL, ""); // cross-check is optional
      await reg("B", IOT_URL, CROSS_URL);
    });

    it("crossCheckToleranceBps is admin-set (1%..50%), emitted, and forwarded to the source", async function () {
      const { verifier, stranger, router } = await loadFixture(fixture);
      expect(await verifier.crossCheckToleranceBps()).to.equal(1500n);
      await expect(verifier.connect(stranger).setCrossCheckTolerance(300)).to.be.revertedWith(MISSING_ROLE);
      await expect(verifier.setCrossCheckTolerance(99)).to.be.revertedWith("Invalid tolerance");
      await expect(verifier.setCrossCheckTolerance(5001)).to.be.revertedWith("Invalid tolerance");
      await expect(verifier.setCrossCheckTolerance(300)).to.emit(verifier, "CrossCheckToleranceChanged").withArgs(300);
      await time.increase(30 * DAY + 1);
      await verifier.requestVerification("P1");
      expect((await decodeRouterRequest(router, await router.lastRequestId())).args[3]).to.equal("300");
    });
  });

  describe("RegistrySync: endpoints", function () {
    it("default registries exist but are inactive without an endpoint; activation needs an endpoint", async function () {
      const router = await deployRouter();
      const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
      const sync = await deploySync(router, nft, { configured: false });
      await configure(sync, "registry");
      expect(await sync.getSupportedRegistries()).to.deep.equal(["VERRA", "GOLD_STANDARD", "ICM"]);
      for (const n of ["VERRA", "GOLD_STANDARD", "ICM"]) {
        const r = await sync.getRegistry(n);
        expect(r.isActive).to.equal(false);
        expect(r.apiEndpoint).to.equal("");
      }
      await expect(sync.checkRegistry("VERRA", "S")).to.be.revertedWith("Registry not supported");
      await expect(sync.setRegistryStatus("VERRA", true)).to.be.revertedWith("Endpoint not set");

      await expect(sync.setRegistryEndpoint("NOPE", REGISTRY_URL)).to.be.revertedWith("Unknown registry");
      await expect(sync.setRegistryEndpoint("VERRA", "http://registry.test/{serial}")).to.be.revertedWith("URL must be https");
      await expect(sync.setRegistryEndpoint("VERRA", "https://registry.test/fixed")).to.be.revertedWith("Endpoint needs {serial}");
      await expect(sync.setRegistryEndpoint("VERRA", "https://")).to.be.revertedWith("Invalid URL length");
      await expect(sync.setRegistryEndpoint("VERRA", REGISTRY_URL))
        .to.emit(sync, "RegistryEndpointUpdated")
        .withArgs("VERRA", REGISTRY_URL);
      await sync.setRegistryStatus("VERRA", true);
      await sync.checkRegistry("VERRA", "S-1");
      const req = await decodeRouterRequest(router, await router.lastRequestId());
      expect(req.args).to.deep.equal(["VERRA", "S-1", REGISTRY_URL]);

      await expect(sync.addRegistry("OTHER", "https://x.test/nothing")).to.be.revertedWith("Endpoint needs {serial}");
      await sync.addRegistry("OTHER", "https://other.test/c/{serial}");
      expect((await sync.getRegistry("OTHER")).isActive).to.equal(true);
    });

    it("endpoint setters are admin-only", async function () {
      const { sync, stranger } = await loadFixture(fixture);
      await expect(sync.connect(stranger).setRegistryEndpoint("VERRA", REGISTRY_URL)).to.be.revertedWith(MISSING_ROLE);
      await expect(sync.connect(stranger).addRegistry("X", REGISTRY_URL)).to.be.revertedWith(MISSING_ROLE);
    });
  });
});
