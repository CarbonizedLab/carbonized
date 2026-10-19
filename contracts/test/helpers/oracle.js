"use strict";
// Shared helpers for the oracle-layer tests (CarbonPriceOracle, EmissionVerifier, RegistrySync).

const { ethers } = require("hardhat");
const { loadSource, sourceHashOf } = require("../../scripts/functions/sources");

const coder = ethers.AbiCoder.defaultAbiCoder();
const E18 = 10n ** 18n;
const USD = 10n ** 8n; // oracle prices have 8 decimals
const DAY = 24 * 3600;
const DON_ID = ethers.encodeBytes32String("fun-test-1");
const SUB_ID = 42n;
const GAS_LIMIT = 300_000;

/** Operator-provided demo URL templates (never fetched by contract tests). */
const PRICE_URLS = [
  "https://price-a.test/{methodology}",
  "https://price-b.test/{methodology}",
  "https://price-c.test/{methodology}",
];
const IOT_URL = "https://iot.test/{projectId}";
const CROSS_URL = "https://ref.test/{projectId}";
const REGISTRY_URL = "https://registry.test/{serial}";

// ---- response encoders: exactly what the DON must return ------------------------------------------------------------
/** CarbonPriceOracle: abi.encode(uint256 price, uint256 volume24h, uint256 confidence, uint256 dataPoints) */
const encodePrice = (price, volume = 0n, confidence = 100n, dataPoints = 3n) =>
  coder.encode(["uint256", "uint256", "uint256", "uint256"], [price, volume, confidence, dataPoints]);
/** EmissionVerifier: abi.encode(uint256 measuredEmissions, uint256 confidence) */
const encodeEmission = (measured, confidence = 100n) => coder.encode(["uint256", "uint256"], [measured, confidence]);
/** RegistrySync: abi.encode(uint256 status), 0 NOT_FOUND / 1 ACTIVE / 2 RETIRED */
const encodeRegistry = (status) => coder.encode(["uint256"], [status]);
const NOT_FOUND = 0n;
const ACTIVE = 1n;
const RETIRED = 2n;

// ---- minimal CBOR reader (enough for FunctionsRequest.encodeCBOR) ----------------------------------------------------
function readItem(buf, pos) {
  const initial = buf[pos++];
  const major = initial >> 5;
  const info = initial & 31;
  if (major === 7) {
    if (info === 31) return [Symbol.for("break"), pos];
    throw new Error(`unsupported simple value ${initial}`);
  }
  let length;
  if (info < 24) length = info;
  else {
    const size = { 24: 1, 25: 2, 26: 4, 27: 8 }[info];
    if (!size) {
      if (info === 31 && (major === 4 || major === 5)) length = -1; // indefinite
      else throw new Error(`unsupported CBOR additional info ${info}`);
    } else {
      length = 0;
      for (let i = 0; i < size; i++) length = length * 256 + buf[pos++];
    }
  }
  switch (major) {
    case 0:
      return [length, pos];
    case 2: {
      const hex = `0x${Buffer.from(buf.subarray(pos, pos + length)).toString("hex")}`;
      return [hex, pos + length];
    }
    case 3:
      return [Buffer.from(buf.subarray(pos, pos + length)).toString("utf8"), pos + length];
    case 4: {
      const items = [];
      for (let i = 0; length < 0 || i < length; i++) {
        const [item, next] = readItem(buf, pos);
        pos = next;
        if (item === Symbol.for("break")) break;
        items.push(item);
      }
      return [items, pos];
    }
    case 6: {
      // tag 2 = unsigned bignum (FunctionsRequest writes uint256 values that way)
      const [inner, next] = readItem(buf, pos);
      if (length !== 2) throw new Error(`unsupported CBOR tag ${length}`);
      return [Number(BigInt(inner)), next];
    }
    default:
      throw new Error(`unsupported CBOR major type ${major}`);
  }
}

/** Decode a flat CBOR key/value sequence (what FunctionsRequest writes) into an object. */
function decodeCborSequence(hex) {
  const buf = ethers.getBytes(hex);
  const out = {};
  let pos = 0;
  while (pos < buf.length) {
    const [key, afterKey] = readItem(buf, pos);
    const [value, afterValue] = readItem(buf, afterKey);
    out[key] = value;
    pos = afterValue;
  }
  return out;
}

/** What the DON receives for a request the router recorded: the request payload fully decoded. */
async function decodeRouterRequest(router, requestId) {
  const r = await router.requests(requestId);
  const cbor = decodeCborSequence(r.data);
  return {
    client: r.client,
    subscriptionId: r.subscriptionId,
    dataVersion: r.dataVersion,
    callbackGasLimit: r.callbackGasLimit,
    donId: r.donId,
    ...cbor,
    donHostedSecrets: cbor.secrets ? decodeCborSequence(cbor.secrets) : undefined,
  };
}

// ---- deployment / configuration ---------------------------------------------------------------------------------------
async function deployRouter(name = "MockFunctionsRouter") {
  return (await ethers.getContractFactory(name)).deploy();
}

/** setFunctionsConfig + setSource with the reference source `name` ("price" | "emission" | "registry"). */
async function configure(contract, name, { subscriptionId = SUB_ID, donId = DON_ID, gasLimit = GAS_LIMIT } = {}) {
  await contract.setFunctionsConfig(donId, subscriptionId, gasLimit);
  await contract.setSource(loadSource(name));
}

async function deployPriceOracle(router, { sources = PRICE_URLS, configured = true } = {}) {
  const oracle = await (await ethers.getContractFactory("CarbonPriceOracle")).deploy(await router.getAddress());
  if (configured) {
    await configure(oracle, "price");
    await oracle.setPriceSources(sources);
  }
  return oracle;
}

async function deployVerifier(router, nft, { configured = true } = {}) {
  const verifier = await (await ethers.getContractFactory("EmissionVerifier")).deploy(
    await router.getAddress(),
    await nft.getAddress(),
  );
  if (configured) await configure(verifier, "emission");
  return verifier;
}

async function deploySync(router, nft, { configured = true, registries = ["VERRA", "GOLD_STANDARD", "ICM"] } = {}) {
  const sync = await (await ethers.getContractFactory("RegistrySync")).deploy(
    await router.getAddress(),
    await nft.getAddress(),
  );
  if (configured) {
    await configure(sync, "registry");
    for (const name of registries) {
      await sync.setRegistryEndpoint(name, REGISTRY_URL);
      await sync.setRegistryStatus(name, true);
    }
  }
  return sync;
}

/** Request ids the router saw, in order. */
const requestIdsOf = async (client) => (await client.queryFilter(client.filters.RequestSent())).map((e) => e.args.id);

module.exports = {
  E18,
  USD,
  DAY,
  DON_ID,
  SUB_ID,
  GAS_LIMIT,
  PRICE_URLS,
  IOT_URL,
  CROSS_URL,
  REGISTRY_URL,
  encodePrice,
  encodeEmission,
  encodeRegistry,
  NOT_FOUND,
  ACTIVE,
  RETIRED,
  decodeCborSequence,
  decodeRouterRequest,
  deployRouter,
  configure,
  deployPriceOracle,
  deployVerifier,
  deploySync,
  requestIdsOf,
  loadSource,
  sourceHashOf,
};
