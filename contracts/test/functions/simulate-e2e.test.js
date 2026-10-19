/**
 * End to end: the reference Functions sources (scripts/functions/*.js) are taken from the REQUEST the contract sends
 * (stored source + onchain built args), executed locally against a mock HTTP server, and the bytes they return are
 * delivered through MockFunctionsRouter into the contract's fulfil path. This proves that what the sources encode is
 * exactly what the contracts decode.
 *
 * Engine: the built-in shim (deterministic; rewrites https://*.test to the local mock server). With Deno installed an
 * extra test also runs the price source through @chainlink/functions-toolkit `simulateScript`.
 * Run: npx hardhat test test/functions/simulate-e2e.test.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { simulate, decodePrice, decodeEmission, decodeRegistry } = require("../../scripts/functions/simulate");
const { startMockServer } = require("../../scripts/functions/lib/mock-server");
const { hasDeno } = require("../../scripts/functions/lib/runtime");
const { loadSource } = require("../../scripts/functions/sources");
const {
  E18, USD, DAY, IOT_URL, CROSS_URL, REGISTRY_URL, deployRouter, deployPriceOracle, deployVerifier, deploySync,
  decodeRouterRequest,
} = require("../helpers/oracle");

const ENGINE = "shim";
const utf8 = (s) => ethers.toUtf8Bytes(s);

describe("Functions sources <-> contracts (simulated end to end)", function () {
  this.timeout(60_000);
  let server;
  before(async function () {
    server = await startMockServer();
  });
  after(async function () {
    await server.close();
  });
  beforeEach(function () {
    for (const k of Object.keys(server.routes)) delete server.routes[k];
    server.hits.length = 0;
  });
  const serve = (routes) => Object.assign(server.routes, routes);

  /** The request the router recorded, run through the matching reference source. */
  async function runRequest(router, name, secrets = {}) {
    const id = await router.lastRequestId();
    const req = await decodeRouterRequest(router, id);
    const result = await simulate({ name, args: req.args, source: req.source, port: server.port, secrets, engine: ENGINE });
    return { id, req, ...result };
  }
  /** Deliver the simulated outcome like the DON would: bytes on success, the error text as `err` otherwise. */
  const deliver = (router, run) =>
    run.errorString
      ? router.fulfillRequest(run.id, "0x", utf8(run.errorString))
      : router.fulfillRequest(run.id, run.responseHex, "0x");

  // ========================================================================== price
  describe("price.js -> CarbonPriceOracle", function () {
    async function setup() {
      const router = await deployRouter();
      const oracle = await deployPriceOracle(router);
      return { router, oracle };
    }

    it("median of the valid sources, volume sum, confidence and dataPoints decode exactly onchain", async function () {
      const { router, oracle } = await setup();
      serve({
        "/price-a.test/VERRA_VCS": { json: { price: 14.5, volume24h: 120000 } },
        "/price-b.test/VERRA_VCS": { json: { price: "14.9", volume24h: "80000.5" } },
        "/price-c.test/VERRA_VCS": { status: 500, json: { error: "down" } },
      });
      await oracle.updatePrice("VERRA_VCS");
      const run = await runRequest(router, "price");
      expect(run.errorString).to.equal(undefined);
      expect(ethers.dataLength(run.responseHex)).to.equal(128);
      expect(run.decoded).to.deep.equal({ price: 1_470_000_000n, volume24h: 20_000_050_000_000n, confidence: 67n, dataPoints: 2n });

      await deliver(router, run);
      const d = await oracle.getPriceData("VERRA_VCS");
      expect([d.price, d.volume24h, d.confidence, d.dataPoints]).to.deep.equal([1_470_000_000n, 20_000_050_000_000n, 67n, 2n]);
      expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(1_470_000_000n);
      // the contract-built args reached the sources: {methodology} substituted into each template
      expect(server.hits.map((h) => h.path).sort()).to.deep.equal([
        "/price-a.test/VERRA_VCS", "/price-b.test/VERRA_VCS", "/price-c.test/VERRA_VCS",
      ]);
    });

    it("three agreeing sources: median, full confidence", async function () {
      const { router, oracle } = await setup();
      serve({
        "/price-a.test/GOLD_STANDARD": { json: { price: 30 } },
        "/price-b.test/GOLD_STANDARD": { json: { price: 31.5 } },
        "/price-c.test/GOLD_STANDARD": { json: { price: 29.25 } },
      });
      await oracle.updatePrice("GOLD_STANDARD");
      const run = await runRequest(router, "price");
      expect(run.decoded).to.deep.equal({ price: 30n * USD, volume24h: 0n, confidence: 100n, dataPoints: 3n });
      await deliver(router, run);
      expect(await oracle.getLatestPrice("GOLD_STANDARD")).to.equal(30n * USD);
    });

    it("invalid source values are ignored by the script (strings, zero, negative, absurd); only valid ones count", async function () {
      const { router, oracle } = await setup();
      serve({
        "/price-a.test/VERRA_VCS": { json: { price: "abc" } },
        "/price-b.test/VERRA_VCS": { json: { price: -3 } },
        "/price-c.test/VERRA_VCS": { json: { price: 12, volume24h: "x" } }, // invalid volume invalidates the source
      });
      await oracle.updatePrice("VERRA_VCS");
      const run = await runRequest(router, "price");
      expect(run.errorString).to.equal("no valid price source");
      await deliver(router, run);
      const evs = await oracle.queryFilter(oracle.filters.PriceRequestFailed());
      expect(evs[0].args.reason).to.equal("no valid price source");
      await expect(oracle.getLatestPrice("VERRA_VCS")).to.be.revertedWith("Price not available");

      serve({ "/price-a.test/VERRA_VCS": { json: { price: 1e9 } }, "/price-b.test/VERRA_VCS": { json: { price: 0 } }, "/price-c.test/VERRA_VCS": { json: { price: 12 } } });
      await oracle.updatePrice("VERRA_VCS");
      const ok = await runRequest(router, "price");
      expect(ok.decoded).to.deep.equal({ price: 12n * USD, volume24h: 0n, confidence: 33n, dataPoints: 1n });
      await deliver(router, ok);
      // 1 of 3 sources => confidence 33 < default minConfidence 60: the contract refuses it
      const failed = await oracle.queryFilter(oracle.filters.PriceRequestFailed());
      expect(failed[failed.length - 1].args.reason).to.equal("Confidence too low");
    });

    it("sources that disagree by more than the onchain spread fail the run; the error text becomes PriceRequestFailed", async function () {
      const { router, oracle } = await setup();
      serve({
        "/price-a.test/VERRA_VCS": { json: { price: 10 } },
        "/price-b.test/VERRA_VCS": { json: { price: 14 } }, // +40% around a 12 median: 33% > 20%
        "/price-c.test/VERRA_VCS": { json: { price: 12 } },
      });
      await oracle.updatePrice("VERRA_VCS");
      const run = await runRequest(router, "price");
      expect(run.errorString).to.equal("sources disagree");
      await expect(deliver(router, run)).to.emit(oracle, "PriceRequestFailed").withArgs("VERRA_VCS", "sources disagree");

      // the spread is passed from the contract: widen it and the same data is accepted
      await oracle.setMaxSourceSpread(5000);
      await oracle.updatePrice("VERRA_VCS");
      const wide = await runRequest(router, "price");
      expect(wide.decoded.price).to.equal(12n * USD);
      await deliver(router, wide);
      expect(await oracle.getLatestPrice("VERRA_VCS")).to.equal(12n * USD);
    });

    it("a price the script accepts but the contract bounds reject is dropped onchain (defence in depth)", async function () {
      const { router, oracle } = await setup();
      serve({
        "/price-a.test/VERRA_VCS": { json: { price: 20000 } },
        "/price-b.test/VERRA_VCS": { json: { price: 20100 } },
        "/price-c.test/VERRA_VCS": { json: { price: 19900 } },
      });
      await oracle.updatePrice("VERRA_VCS"); // maxPrice default 10,000 USD
      const run = await runRequest(router, "price");
      expect(run.decoded.price).to.equal(20000n * USD);
      await expect(deliver(router, run)).to.emit(oracle, "PriceRequestFailed").withArgs("VERRA_VCS", "Price out of bounds");
    });

    it("secrets: the API key is sent only to URLs under secrets.allowedUrlPrefix; without secrets nothing is sent", async function () {
      const { router, oracle } = await setup();
      serve({
        "/price-a.test/VERRA_VCS": { json: { price: 14 } },
        "/price-b.test/VERRA_VCS": { json: { price: 14 } },
        "/price-c.test/VERRA_VCS": { json: { price: 14 } },
      });
      await oracle.updatePrice("VERRA_VCS");
      await runRequest(router, "price");
      expect(server.hits.every((h) => h.headers.authorization === undefined)).to.equal(true);

      server.hits.length = 0;
      await runRequest(router, "price", { apiKey: "K-123", allowedUrlPrefix: "https://price-a.test/" });
      const byPath = Object.fromEntries(server.hits.map((h) => [h.path, h.headers.authorization]));
      expect(byPath["/price-a.test/VERRA_VCS"]).to.equal("Bearer K-123");
      expect(byPath["/price-b.test/VERRA_VCS"]).to.equal(undefined);
      expect(byPath["/price-c.test/VERRA_VCS"]).to.equal(undefined);

      server.hits.length = 0;
      await runRequest(router, "price", { apiKey: "K-9", apiKeyHeader: "x-api-key", allowedUrlPrefix: "https://price-b.test/" });
      const h = server.hits.find((x) => x.path === "/price-b.test/VERRA_VCS").headers;
      expect(h["x-api-key"]).to.equal("K-9");
      expect(h.authorization).to.equal(undefined);
    });

    it("the script refuses non-https source URLs and malformed args", async function () {
      const base = { name: "price", port: server.port, engine: ENGINE };
      serve({ "/evil.test/VERRA_VCS": { json: { price: 10 } } });
      const insecure = await simulate({ ...base, args: ["VERRA_VCS", "2000", "http://evil.test/{methodology}"] });
      expect(insecure.errorString).to.equal("no valid price source");
      expect(server.hits.length).to.equal(0);
      expect((await simulate({ ...base, args: ["VERRA_VCS"] })).errorString).to.equal("invalid args");
      expect((await simulate({ ...base, args: ["VERRA_VCS", "not-a-number", "https://a.test/x"] })).errorString).to.equal("invalid args");
      expect((await simulate({ ...base, args: ["", "2000", "https://a.test/x"] })).errorString).to.equal("invalid args");
      const six = Array.from({ length: 6 }, (_, i) => `https://s${i}.test/x`);
      expect((await simulate({ ...base, args: ["VERRA_VCS", "2000", ...six] })).errorString).to.equal("invalid args");
    });
  });

  // ========================================================================== emission
  describe("emission.js -> EmissionVerifier", function () {
    async function setup() {
      const [, owner] = await ethers.getSigners();
      const router = await deployRouter();
      const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
      const verifier = await deployVerifier(router, nft);
      await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), await verifier.getAddress());
      const register = (id, iot = IOT_URL, cross = CROSS_URL) =>
        verifier.registerProject(id, owner.address, "VERRA_VCS", 10_000n * E18, 30, 30 * DAY, iot, cross, ethers.ZeroHash);
      await register("P1");
      await time.increase(30 * DAY + 1);
      return { owner, router, nft, verifier, register };
    }

    it("two agreeing sources: the higher measurement, confidence 100, recorded and claimable", async function () {
      const { owner, router, nft, verifier } = await setup();
      serve({
        "/iot.test/P1": { json: { tonnesCO2e: 7000 } },
        "/ref.test/P1": { json: { tonnesCO2e: "7200.5" } },
      });
      await verifier.requestVerification("P1");
      const run = await runRequest(router, "emission");
      expect(ethers.dataLength(run.responseHex)).to.equal(64);
      expect(run.decoded).to.deep.equal({ measuredEmissions: 7_200_500_000_000_000_000_000n, confidence: 100n });
      await deliver(router, run);

      const r = await verifier.getVerificationRequest(run.id);
      expect([r.measuredEmissions, r.reductionAchieved, r.confidenceScore, r.failed]).to.deep.equal([
        7200_500_000_000_000_000_000n, 2799_500_000_000_000_000_000n, 100n, false,
      ]);
      await verifier.claimCredits(run.id);
      expect(await nft.ownerOf(1)).to.equal(owner.address);
      expect((await nft.credits(1)).co2Tonnes).to.equal(2799_500_000_000_000_000_000n);
    });

    it("a single-source project reports confidence 70: recorded but never claimable", async function () {
      const { router, verifier, register } = await setup();
      await register("SOLO", IOT_URL, "");
      await time.increase(30 * DAY + 1);
      serve({ "/iot.test/SOLO": { json: { tonnesCO2e: 9000.25 } } });
      await verifier.requestVerification("SOLO");
      const run = await runRequest(router, "emission");
      expect(run.decoded).to.deep.equal({ measuredEmissions: 9_000_250_000_000_000_000_000n, confidence: 70n });
      await deliver(router, run);
      expect((await verifier.getVerificationRequest(run.id)).confidenceScore).to.equal(70n);
      await expect(verifier.claimCredits(run.id)).to.be.revertedWith("Confidence too low");
    });

    it("sources disagreeing beyond the onchain tolerance, endpoint failures and invalid values fail the run (nothing minted)", async function () {
      const { router, nft, verifier } = await setup();
      const attempt = async (routes, expected) => {
        for (const k of Object.keys(server.routes)) delete server.routes[k];
        serve(routes);
        await time.increase(2 * 3600); // MIN_RETRY_DELAY
        await verifier.requestVerification("P1");
        const run = await runRequest(router, "emission");
        expect(run.errorString).to.equal(expected);
        await deliver(router, run);
        const r = await verifier.getVerificationRequest(run.id);
        expect(r.fulfilled && r.failed).to.equal(true);
        const evs = await verifier.queryFilter(verifier.filters.VerificationFailed());
        expect(evs[evs.length - 1].args.reason).to.equal("Oracle error");
      };
      // 7000 vs 8500: (8500-7000)/8500 = 17.6% > 15%
      await attempt({ "/iot.test/P1": { json: { tonnesCO2e: 7000 } }, "/ref.test/P1": { json: { tonnesCO2e: 8500 } } }, "measurements disagree");
      await attempt({ "/iot.test/P1": { status: 503, json: {} }, "/ref.test/P1": { json: { tonnesCO2e: 7000 } } }, "measurement request failed");
      await attempt({ "/iot.test/P1": { json: { tonnesCO2e: 7000 } }, "/ref.test/P1": { status: 404, json: {} } }, "measurement request failed");
      for (const bad of [0, -5, "abc", 1e8, null, [7000]]) {
        await attempt({ "/iot.test/P1": { json: { tonnesCO2e: bad } }, "/ref.test/P1": { json: { tonnesCO2e: 7000 } } }, "invalid measurement");
      }
      await attempt({ "/iot.test/P1": { json: { other: 1 } }, "/ref.test/P1": { json: { tonnesCO2e: 7000 } } }, "invalid measurement");
      expect(await nft.totalSupply()).to.equal(0n);

      // raising the tolerance onchain makes the same data acceptable (the value travels in the args)
      await verifier.setCrossCheckTolerance(2000);
      for (const k of Object.keys(server.routes)) delete server.routes[k];
      serve({ "/iot.test/P1": { json: { tonnesCO2e: 7000 } }, "/ref.test/P1": { json: { tonnesCO2e: 8500 } } });
      await time.increase(2 * 3600);
      await verifier.requestVerification("P1");
      const ok = await runRequest(router, "emission");
      expect(ok.decoded).to.deep.equal({ measuredEmissions: 8500n * E18, confidence: 100n });
    });

    it("{projectId}, {from} and {to} placeholders carry the onchain project id and measurement window", async function () {
      const { router, verifier, register } = await setup();
      await register("proj/ö 2", "https://iot.test/{projectId}/{from}/{to}", "");
      await time.increase(30 * DAY + 1);
      await verifier.requestVerification("proj/ö 2");
      const req = await decodeRouterRequest(router, await router.lastRequestId());
      const [, , , , from, to] = req.args;
      expect(Number(to) - Number(from)).to.be.greaterThanOrEqual(30 * DAY);
      serve({ [`/iot.test/${encodeURIComponent("proj/ö 2")}/${from}/${to}`]: { json: { tonnesCO2e: 100 } } });
      const run = await runRequest(router, "emission");
      expect(run.errorString).to.equal(undefined);
      expect(run.decoded.measuredEmissions).to.equal(100n * E18);
    });

    it("the script refuses non-https endpoints and malformed args", async function () {
      const base = { name: "emission", port: server.port, engine: ENGINE };
      serve({ "/x.test/P": { json: { tonnesCO2e: 5 } } });
      expect((await simulate({ ...base, args: ["P", "http://x.test/P", "", "1500", "1", "2"] })).errorString).to.equal("url must be https");
      expect((await simulate({ ...base, args: ["P", "https://x.test/P", "", "-1", "1", "2"] })).errorString).to.equal("invalid args");
      expect((await simulate({ ...base, args: ["", "https://x.test/P", "", "1500", "1", "2"] })).errorString).to.equal("invalid args");
      expect((await simulate({ ...base, args: ["P", "https://x.test/P", "", "1500", "1"] })).errorString).to.equal("invalid args");
      expect(server.hits.length).to.equal(0);
    });
  });

  // ========================================================================== registry
  describe("registry-check.js -> RegistrySync", function () {
    async function setup() {
      const router = await deployRouter();
      const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
      const sync = await deploySync(router, nft);
      return { router, sync };
    }

    it("RETIRED / ACTIVE / NOT_FOUND (HTTP 404) decode to the onchain verdicts", async function () {
      const { router, sync } = await setup();
      serve({
        "/registry.test/RET-1": { json: { status: "retired" } },
        "/registry.test/ACT-1": { json: { status: "ACTIVE", extra: true } },
      });
      const expectations = [
        ["RET-1", 2n, "RETIRED", true, false],
        ["ACT-1", 1n, "ACTIVE", false, true],
        ["MISSING-1", 0n, "NOT_FOUND", false, false],
      ];
      for (const [serial, status, name, verified, used] of expectations) {
        await sync.checkRegistry("VERRA", serial);
        const run = await runRequest(router, "registry");
        expect(ethers.dataLength(run.responseHex)).to.equal(32);
        expect(run.decoded).to.deep.equal({ status, name });
        await deliver(router, run);
        expect((await sync.getRegistryCheck(run.id)).registryStatus).to.equal(name);
        expect(await sync.isCreditVerified("VERRA", serial)).to.equal(verified);
        expect(await sync.isSerialUsed("VERRA", serial)).to.equal(used);
      }
    });

    it("the serial is URL-encoded into {serial}", async function () {
      const { router, sync } = await setup();
      const serial = "VCS 001/ä";
      serve({ [`/registry.test/${encodeURIComponent(serial)}`]: { json: { status: "RETIRED" } } });
      await sync.checkRegistry("VERRA", serial);
      const run = await runRequest(router, "registry");
      expect(run.decoded.name).to.equal("RETIRED");
      await deliver(router, run);
      expect(await sync.isCreditVerified("VERRA", serial)).to.equal(true);
    });

    it("HTTP errors and unrecognised statuses fail the run => ERROR onchain, no verdict change", async function () {
      const { router, sync } = await setup();
      serve({ "/registry.test/RET-1": { json: { status: "RETIRED" } } });
      await sync.checkRegistry("VERRA", "RET-1");
      await deliver(router, await runRequest(router, "registry"));
      expect(await sync.isCreditVerified("VERRA", "RET-1")).to.equal(true);

      const cases = [
        [{ status: 500, json: {} }, "registry request failed"],
        [{ status: 403, json: {} }, "registry request failed"],
        [{ json: { status: "PENDING" } }, "unrecognised status"],
        [{ json: {} }, "unrecognised status"],
        [{ json: { status: 2 } }, "unrecognised status"],
      ];
      for (const [route, expected] of cases) {
        serve({ "/registry.test/RET-1": route });
        await sync.checkRegistry("VERRA", "RET-1");
        const run = await runRequest(router, "registry");
        expect(run.errorString).to.equal(expected);
        await deliver(router, run);
        expect((await sync.getRegistryCheck(run.id)).registryStatus).to.equal("ERROR");
        expect(await sync.isCreditVerified("VERRA", "RET-1")).to.equal(true); // unchanged
      }
    });

    it("the script refuses endpoints without {serial}, non-https endpoints and malformed args", async function () {
      const base = { name: "registry", port: server.port, engine: ENGINE };
      expect((await simulate({ ...base, args: ["VERRA", "S", "https://registry.test/fixed"] })).errorString).to.equal("invalid args");
      expect((await simulate({ ...base, args: ["VERRA", "S", "http://registry.test/{serial}"] })).errorString).to.equal("url must be https");
      expect((await simulate({ ...base, args: ["VERRA", "x".repeat(129), REGISTRY_URL] })).errorString).to.equal("invalid args");
      expect((await simulate({ ...base, args: ["VERRA"] })).errorString).to.equal("invalid args");
      expect(server.hits.length).to.equal(0);
    });
  });

  // ========================================================================== source files
  describe("sources", function () {
    it("the compacted onchain text behaves exactly like the commented file", async function () {
      serve({
        "/price-a.test/VERRA_VCS": { json: { price: 14.5, volume24h: 10 } },
        "/price-b.test/VERRA_VCS": { json: { price: 14.9 } },
      });
      const args = ["VERRA_VCS", "2000", "https://price-a.test/{methodology}", "https://price-b.test/{methodology}"];
      const raw = fs.readFileSync(path.join(__dirname, "../../scripts/functions/price.js"), "utf8");
      const a = await simulate({ name: "price", args, port: server.port, engine: ENGINE, source: raw });
      const b = await simulate({ name: "price", args, port: server.port, engine: ENGINE, source: loadSource("price") });
      expect(a.responseHex).to.equal(b.responseHex);
      expect(decodePrice(b.responseHex).confidence).to.equal(100n);
    });

    it("the encoders match the contract decoders for the extremes", async function () {
      expect(decodeEmission(ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [1n, 100n]))).to.deep.equal({
        measuredEmissions: 1n, confidence: 100n,
      });
      expect(decodeRegistry(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [2n])).name).to.equal("RETIRED");
      expect(() => decodeRegistry("0x")).to.throw();
    });

    if (hasDeno()) {
      it("price.js also runs in the functions-toolkit Deno sandbox", async function () {
        serve({ "/price-a.test/VERRA_VCS": { json: { price: 14.5 } } });
        const url = `${server.baseUrl}/price-a.test/{methodology}`;
        const res = await simulate({ name: "price", args: ["VERRA_VCS", "2000", url], engine: "toolkit" });
        expect(res.errorString).to.equal(undefined);
        expect(res.decoded.price).to.equal(1_450_000_000n);
      });
    }
  });
});
