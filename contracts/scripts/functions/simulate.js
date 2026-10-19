"use strict";
// Runs the reference Functions sources locally against a tiny local HTTP mock server and decodes the bytes exactly like
// the contracts do. No network, no secrets, no keys.
//
//   node scripts/functions/simulate.js [price|emission|registry|all]
//   FUNCTIONS_ENGINE=shim|toolkit|auto  (default auto: @chainlink/functions-toolkit `simulateScript` when `deno` is on
//                                        PATH, else the built-in shim)
//
// The mock endpoints (https://price-a.test/..., https://iot.test/..., https://registry.test/...) are demo fixtures served
// by this process; they are NOT real data sources. Real endpoints are supplied onchain by the operator.

const { AbiCoder } = require("ethers");
const { runSource } = require("./lib/runtime");
const { startMockServer } = require("./lib/mock-server");
const { loadSource, SOURCE_FILES } = require("./sources");

const coder = AbiCoder.defaultAbiCoder();
const E18 = 10n ** 18n;
const REGISTRY_STATUS = ["NOT_FOUND", "ACTIVE", "RETIRED"];

const byteLength = (hex) => (hex.length - 2) / 2;

/** CarbonPriceOracle.fulfillRequest: abi.encode(uint256 price, uint256 volume24h, uint256 confidence, uint256 dataPoints). */
function decodePrice(hex) {
  if (byteLength(hex) !== 128) throw new Error(`price response must be 128 bytes, got ${byteLength(hex)}`);
  const [price, volume24h, confidence, dataPoints] = coder.decode(["uint256", "uint256", "uint256", "uint256"], hex);
  return { price, volume24h, confidence, dataPoints };
}

/** EmissionVerifier.fulfillRequest: abi.encode(uint256 measuredEmissions, uint256 confidence). */
function decodeEmission(hex) {
  if (byteLength(hex) !== 64) throw new Error(`emission response must be 64 bytes, got ${byteLength(hex)}`);
  const [measuredEmissions, confidence] = coder.decode(["uint256", "uint256"], hex);
  return { measuredEmissions, confidence };
}

/** RegistrySync.fulfillRequest: abi.encode(uint256 status) with 0 NOT_FOUND, 1 ACTIVE, 2 RETIRED. */
function decodeRegistry(hex) {
  if (byteLength(hex) !== 32) throw new Error(`registry response must be 32 bytes, got ${byteLength(hex)}`);
  const [status] = coder.decode(["uint256"], hex);
  return { status, name: REGISTRY_STATUS[Number(status)] ?? "INVALID" };
}

const DECODERS = { price: decodePrice, emission: decodeEmission, registry: decodeRegistry };

/** Shim helper: serve `https://host/path` from the mock server at `http://127.0.0.1:port/host/path`. */
const localRewrite = (port) => (url) => (url.startsWith("https://") ? `http://127.0.0.1:${port}/${url.slice(8)}` : url);

/**
 * Run one reference source and decode its answer.
 * @param {object} p
 * @param {"price"|"emission"|"registry"} p.name
 * @param {string[]} p.args exactly the args the contract builds
 * @param {number} [p.port] mock server port (needed for https://*.test URLs with the shim engine)
 * @param {Record<string,string>} [p.secrets]
 * @param {"auto"|"shim"|"toolkit"} [p.engine]
 * @param {string} [p.source] override (e.g. the exact text uploaded onchain); defaults to `loadSource(name)`
 */
async function simulate({ name, args, port, secrets = {}, engine = process.env.FUNCTIONS_ENGINE || "auto", source }) {
  if (!SOURCE_FILES[name]) throw new Error(`unknown source "${name}"`);
  const result = await runSource({
    source: source ?? loadSource(name),
    args,
    secrets,
    engine,
    rewriteUrl: port ? localRewrite(port) : undefined,
  });
  return { ...result, decoded: result.responseHex ? DECODERS[name](result.responseHex) : undefined };
}

module.exports = { simulate, decodePrice, decodeEmission, decodeRegistry, localRewrite };

// ---------------------------------------------------------------------------------------------------------------------
// CLI

async function main() {
  const which = process.argv[2] || "all";
  const names = which === "all" ? Object.keys(SOURCE_FILES) : [which];
  for (const n of names) if (!SOURCE_FILES[n]) throw new Error(`usage: simulate.js [${Object.keys(SOURCE_FILES).join("|")}|all]`);

  const server = await startMockServer({
    "/price-a.test/VERRA_VCS": { json: { price: 14.5, volume24h: 120000 } },
    "/price-b.test/VERRA_VCS": { json: { price: "14.9", volume24h: 80000 } },
    "/price-c.test/VERRA_VCS": { status: 500, json: { error: "down" } },
    "/iot.test/PROJECT_X": { json: { tonnesCO2e: 7000 } },
    "/ref.test/PROJECT_X": { json: { tonnesCO2e: "7200.5" } },
    "/registry.test/VCS-001": { json: { status: "retired" } },
  });
  try {
    // With the toolkit (Deno) engine the sources run in a sandbox that cannot be rewritten: point straight at the server.
    const engine = process.env.FUNCTIONS_ENGINE || "auto";
    const direct = engine === "toolkit" || (engine === "auto" && require("./lib/runtime").hasDeno());
    const url = (host, path) => (direct ? `${server.baseUrl}/${host}${path}` : `https://${host}${path}`);
    const port = direct ? undefined : server.port;

    const runs = {
      price: ["VERRA_VCS", "2000", url("price-a.test", "/{methodology}"), url("price-b.test", "/{methodology}"), url("price-c.test", "/{methodology}")],
      emission: ["PROJECT_X", url("iot.test", "/{projectId}"), url("ref.test", "/{projectId}"), "1500", "1700000000", "1702592000"],
      registry: ["VERRA", "VCS-001", url("registry.test", "/{serial}")],
    };
    for (const n of names) {
      const res = await simulate({ name: n, args: runs[n], port });
      console.log(`\n[${n}] engine=${res.engine}`);
      console.log("  args    :", JSON.stringify(runs[n]));
      if (res.errorString) {
        console.log("  ERROR   :", res.errorString);
        process.exitCode = 1;
        continue;
      }
      console.log("  bytes   :", res.responseHex);
      const d = res.decoded;
      if (n === "price") {
        console.log(`  decoded : price=${d.price} (${Number(d.price) / 1e8} USD) volume24h=${d.volume24h} confidence=${d.confidence} dataPoints=${d.dataPoints}`);
      } else if (n === "emission") {
        console.log(`  decoded : measuredEmissions=${d.measuredEmissions} (${Number(d.measuredEmissions / (E18 / 1000n)) / 1000} t) confidence=${d.confidence}`);
      } else {
        console.log(`  decoded : status=${d.status} (${d.name})`);
      }
    }
  } finally {
    await server.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
