"use strict";
// Shared building blocks for scripts/deploy/10_deploy_all.js (testnet) and 20_deploy_mainnet.js.
// Nothing in here talks to a network by itself: every helper receives the hardhat runtime (`hre`)
// or a signer/contract from the caller, so the same code runs on a live RPC and on the in-process
// Hardhat network used by test/integration/DeployScripts.test.js.

const fs = require("node:fs");
const path = require("node:path");

const DEPLOYMENTS_DIR = path.join(__dirname, "../../deployments");

/** The three CarbonCreditToken pools. `type` is the NFT methodology string a pool accepts. */
const POOLS = [
  { type: "ICM_COMPLIANCE", name: "Carbonized Credit - ICM", symbol: "CCT-ICM" },
  { type: "VERRA_VCS", name: "Carbonized Credit - Verra", symbol: "CCT-VCS" },
  { type: "GOLD_STANDARD", name: "Carbonized Credit - Gold Standard", symbol: "CCT-GS" },
];
/** The marketplace is deployed against this pool (as before). */
const DEFAULT_POOL_TYPE = "VERRA_VCS";

/**
 * Roles granted to the deployer by each constructor (the CarbonRegistry takes an explicit admin and
 * is listed with the same set). Used to hand everything over to the multisig and to prove afterwards
 * that the deployer holds nothing.
 */
const ROLE_NAMES = {
  CarbonCreditNFT: ["DEFAULT_ADMIN_ROLE", "PAUSER_ROLE", "NATIVE_ISSUER_ROLE", "EXTERNAL_ISSUER_ROLE", "ISSUER_ADMIN_ROLE", "VERIFIER_ROLE", "ORACLE_ROLE"],
  CarbonCreditToken: ["DEFAULT_ADMIN_ROLE", "WRAPPER_ROLE", "PAUSER_ROLE"],
  CarbonMarketplace: ["DEFAULT_ADMIN_ROLE", "MATCHER_ROLE", "KYC_ROLE", "PAUSER_ROLE", "FEE_MANAGER_ROLE", "PARAMETER_ROLE"],
  CarbonRegistry: ["DEFAULT_ADMIN_ROLE", "PAUSER_ROLE", "VERIFIER_ROLE"],
  EmissionVerifier: ["DEFAULT_ADMIN_ROLE", "PROJECT_REGISTRAR_ROLE", "VERIFIER_ROLE", "AUTOMATION_ROLE"],
  RegistrySync: ["DEFAULT_ADMIN_ROLE", "VERIFIER_ROLE", "ORACLE_ROLE"],
  CarbonPriceOracle: ["DEFAULT_ADMIN_ROLE", "PRICE_UPDATER_ROLE", "AUTOMATION_ROLE", "ORACLE_REPORTER_ROLE"],
  CarbStaking: ["DEFAULT_ADMIN_ROLE", "PARAMETER_ROLE"],
  IssuerBond: ["DEFAULT_ADMIN_ROLE", "PARAMETER_ROLE", "SLASHER_ROLE"],
};
/** Roles each constructor really grants to msg.sender / admin (subset of ROLE_NAMES). */
const CONSTRUCTOR_ROLES = {
  CarbonCreditNFT: ["DEFAULT_ADMIN_ROLE", "PAUSER_ROLE", "ISSUER_ADMIN_ROLE"],
  CarbonCreditToken: ["DEFAULT_ADMIN_ROLE", "WRAPPER_ROLE", "PAUSER_ROLE"],
  CarbonMarketplace: ["DEFAULT_ADMIN_ROLE", "MATCHER_ROLE", "KYC_ROLE", "PAUSER_ROLE", "FEE_MANAGER_ROLE"],
  CarbonRegistry: ["DEFAULT_ADMIN_ROLE", "PAUSER_ROLE", "VERIFIER_ROLE"],
  EmissionVerifier: ["DEFAULT_ADMIN_ROLE", "PROJECT_REGISTRAR_ROLE", "VERIFIER_ROLE"],
  RegistrySync: ["DEFAULT_ADMIN_ROLE", "VERIFIER_ROLE", "ORACLE_ROLE"],
  CarbonPriceOracle: ["DEFAULT_ADMIN_ROLE", "PRICE_UPDATER_ROLE"],
  CarbStaking: ["DEFAULT_ADMIN_ROLE", "PARAMETER_ROLE"],
  IssuerBond: ["DEFAULT_ADMIN_ROLE", "PARAMETER_ROLE", "SLASHER_ROLE"],
};
const PAUSABLE = ["CarbonCreditNFT", "CarbonCreditToken", "CarbonMarketplace", "CarbonRegistry"];

/** Gas used by every transaction sent through deployOnce / sendTx since the last `resetGasTally()`. */
const gasTally = { gas: 0n, txs: 0, byLabel: {} };
const resetGasTally = () => {
  gasTally.gas = 0n;
  gasTally.txs = 0;
  gasTally.byLabel = {};
};
const recordGas = (label, receipt) => {
  gasTally.gas += receipt.gasUsed;
  gasTally.txs += 1;
  gasTally.byLabel[label] = (gasTally.byLabel[label] ?? 0n) + receipt.gasUsed;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
/** Defaults shared by both deploy scripts. `tradingFeeBps` is the contract default (0.25%, max 100). */
const DEFAULTS = { functionsGasLimit: 300_000, tradingFeeBps: 25 };

const isAddress = (value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);

function requireAddress(ethers, value, label) {
  if (!isAddress(value)) {
    throw new Error(`${label} must be a 0x-prefixed 20-byte address (got "${value ?? ""}")`);
  }
  const checksummed = ethers.getAddress(value);
  if (checksummed === ZERO_ADDRESS) {
    throw new Error(`${label} must not be the zero address`);
  }
  return checksummed;
}

/** Comma / whitespace separated address list (empty -> []). Duplicates removed, order kept. */
function parseAddressList(ethers, raw, label) {
  if (!raw || !raw.trim()) return [];
  const out = [];
  for (const part of raw.split(/[\s,;]+/).filter(Boolean)) {
    const address = requireAddress(ethers, part, label);
    if (!out.includes(address)) out.push(address);
  }
  return out;
}

/** DON id: a `0x` + 64 hex bytes32, or a short string (<= 31 bytes, e.g. "fun-ethereum-sepolia-1"). */
function parseDonId(ethers, raw) {
  if (!raw || !raw.trim()) throw new Error("DON_ID is required");
  const value = raw.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase();
  if (value.startsWith("0x")) throw new Error("DON_ID in hex form must be exactly 32 bytes (0x + 64 hex chars)");
  return ethers.encodeBytes32String(value);
}

function parseSubscriptionId(raw) {
  if (!raw || !/^[0-9]+$/.test(raw.trim())) throw new Error("SUBSCRIPTION_ID must be a positive integer");
  const id = BigInt(raw.trim());
  if (id === 0n || id >= 2n ** 64n) throw new Error("SUBSCRIPTION_ID must be in 1..2^64-1 (uint64)");
  return id;
}

// ---------------------------------------------------------------------------------------------
// Persistent, resumable deployment state
// ---------------------------------------------------------------------------------------------

/**
 * `<dir>/<network>.partial.json` records every contract the moment it is deployed. If the script dies
 * halfway, re-running it resumes from that file (after checking the code is really on chain) instead of
 * deploying a second set. A finished run deletes the partial file and writes `<network>.json`.
 */
function openState({ dir, network, chainId, deployer, log }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network}.partial.json`);
  let state = { network, chainId, deployer, startedAt: new Date().toISOString(), contracts: {}, notes: {} };

  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, "utf8"));
    if (existing.network !== network || existing.chainId !== chainId) {
      throw new Error(`${file} belongs to ${existing.network}/${existing.chainId}; delete it to start over`);
    }
    if (existing.deployer.toLowerCase() !== deployer.toLowerCase()) {
      throw new Error(
        `${file} was started by ${existing.deployer} but the active signer is ${deployer}; use the same key or delete the file`,
      );
    }
    state = existing;
    log(`Resuming interrupted deployment from ${file} (${Object.keys(state.contracts).length} contracts already on chain)`);
  }

  const save = () => fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  return { state, file, save };
}

/** BigInt-safe, JSON-friendly copy of a constructor argument (arrays are converted element-wise). */
const jsonSafe = (value) => (Array.isArray(value) ? value.map(jsonSafe) : typeof value === "bigint" ? value.toString() : value);

/**
 * Deploy `factoryName(...args)` unless `key` is already recorded (and its code exists on chain).
 * Returns { contract, address, block, txHash, resumed }.
 */
async function deployOnce({ hre, store, key, factoryName, args = [], confirmations = 1, log }) {
  const { ethers } = hre;
  const recorded = store.state.contracts[key];
  if (recorded) {
    const code = await ethers.provider.getCode(recorded.address);
    if (code === "0x") {
      throw new Error(
        `${key} is recorded at ${recorded.address} but there is no code there (wrong network or reorg); delete ${store.file}`,
      );
    }
    log(`  reuse ${key} at ${recorded.address}`);
    const contract = await ethers.getContractAt(factoryName, recorded.address);
    return { contract, ...recorded, resumed: true };
  }

  const factory = await ethers.getContractFactory(factoryName);
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  const receipt = await tx.wait(confirmations);
  if (!receipt || receipt.status !== 1) throw new Error(`${key} deployment reverted (tx ${tx.hash})`);
  recordGas(`deploy ${key}`, receipt);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  const entry = {
    address,
    factory: factoryName,
    block: receipt.blockNumber,
    txHash: tx.hash,
    constructorArgs: args.map(jsonSafe),
  };
  store.state.contracts[key] = entry;
  store.save();
  log(`  deployed ${key} at ${address} (block ${receipt.blockNumber})`);
  return { contract, ...entry, resumed: false };
}

/** Send a transaction and require success. `send` is a thunk returning the pending tx response. */
async function sendTx(label, send, log, confirmations = 1) {
  const tx = await send();
  const receipt = await tx.wait(confirmations);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} failed (tx ${tx.hash})`);
  recordGas(label, receipt);
  log(`  ok  ${label}`);
  return receipt;
}

async function roleId(contract, roleName) {
  if (roleName === "DEFAULT_ADMIN_ROLE") return `0x${"00".repeat(32)}`;
  return contract[roleName]();
}

/** Grant `roleName` to `account` unless it already holds it; always re-reads and asserts. */
async function grantRoleChecked(contract, label, roleName, account, log) {
  const role = await roleId(contract, roleName);
  if (!(await contract.hasRole(role, account))) {
    await sendTx(`${label}.grantRole(${roleName}, ${account})`, () => contract.grantRole(role, account), log);
  }
  if (!(await contract.hasRole(role, account))) {
    throw new Error(`${label}: ${account} does not hold ${roleName} after grantRole`);
  }
}

/** Renounce `roleName` for the connected signer unless already gone; always re-reads and asserts. */
async function renounceRoleChecked(contract, label, roleName, signerAddress, log) {
  const role = await roleId(contract, roleName);
  if (await contract.hasRole(role, signerAddress)) {
    await sendTx(`${label}.renounceRole(${roleName})`, () => contract.renounceRole(role, signerAddress), log);
  }
  if (await contract.hasRole(role, signerAddress)) {
    throw new Error(`${label}: ${signerAddress} still holds ${roleName} after renounceRole`);
  }
}

// ---------------------------------------------------------------------------------------------
// The protocol itself (shared by testnet and mainnet)
// ---------------------------------------------------------------------------------------------

/**
 * Deploys the nine protocol contracts against an externally supplied payment token and Functions router.
 * `adminForRegistry` is the constructor admin of CarbonRegistry (the deployer on testnet, the multisig on
 * mainnet, so the deployer never holds a registry role).
 * Returns a map of ethers contracts keyed by deployment name, plus per-contract deploy info.
 */
async function deployProtocol({ hre, store, paymentToken, functionsRouter, adminForRegistry, log, confirmations = 1 }) {
  const run = (key, factoryName, args) => deployOnce({ hre, store, key, factoryName, args, confirmations, log });
  const info = {};
  const c = {};
  const take = async (key, factoryName, args) => {
    const r = await run(key, factoryName, args);
    c[key] = r.contract;
    info[key] = { address: r.address, block: r.block, txHash: r.txHash, constructorArgs: r.constructorArgs };
    return r;
  };

  log("[protocol] CarbonCreditNFT");
  await take("CarbonCreditNFT", "CarbonCreditNFT", []);
  const nftAddress = info.CarbonCreditNFT.address;

  log("[protocol] CarbonCreditToken pools");
  for (const pool of POOLS) {
    await take(`CCT_${pool.type}`, "CarbonCreditToken", [pool.name, pool.symbol, nftAddress, pool.type]);
  }

  log("[protocol] CarbonMarketplace");
  await take("CarbonMarketplace", "CarbonMarketplace", [
    paymentToken,
    info[`CCT_${DEFAULT_POOL_TYPE}`].address,
    nftAddress,
  ]);

  log("[protocol] CarbonRegistry");
  await take("CarbonRegistry", "CarbonRegistry", [adminForRegistry]);

  log("[protocol] Chainlink Functions consumers");
  await take("EmissionVerifier", "EmissionVerifier", [functionsRouter, nftAddress]);
  await take("RegistrySync", "RegistrySync", [functionsRouter, nftAddress]);
  if ((await c.CarbonCreditNFT.registrySync()).toLowerCase() !== c.RegistrySync.target.toLowerCase()) {
    await sendTx("CarbonCreditNFT.setRegistrySync", () => c.CarbonCreditNFT.setRegistrySync(c.RegistrySync.target), log);
  }
  await take("CarbonPriceOracle", "CarbonPriceOracle", [functionsRouter]);

  return { contracts: c, info };
}

/** Points the three Functions consumers at the DON/subscription (admin-only; deployer is admin here). */
async function configureFunctions({ contracts, donId, subscriptionId, gasLimit, log }) {
  for (const name of ["EmissionVerifier", "RegistrySync", "CarbonPriceOracle"]) {
    const c = contracts[name];
    const same =
      (await c.donId()) === donId && (await c.subscriptionId()) === subscriptionId && (await c.gasLimit()) === BigInt(gasLimit);
    if (!same) {
      await sendTx(`${name}.setFunctionsConfig`, () => c.setFunctionsConfig(donId, subscriptionId, gasLimit), log);
    }
    if ((await c.donId()) !== donId || (await c.subscriptionId()) !== subscriptionId || (await c.gasLimit()) !== BigInt(gasLimit)) {
      throw new Error(`${name}: Functions config read-back mismatch`);
    }
  }
}

/** Marketplace launch parameters. Writes only what differs, then re-reads everything. */
async function configureMarketplace({ market, tradingFeeBps, minPricePerTonne, kycGateEnabled, log }) {
  if ((await market.tradingFeePercent()) !== BigInt(tradingFeeBps)) {
    await sendTx(`CarbonMarketplace.setTradingFee(${tradingFeeBps})`, () => market.setTradingFee(tradingFeeBps), log);
  }
  if ((await market.minPricePerTonne()) !== minPricePerTonne) {
    await sendTx(`CarbonMarketplace.setMinPricePerTonne(${minPricePerTonne})`, () => market.setMinPricePerTonne(minPricePerTonne), log);
  }
  if ((await market.kycGateEnabled()) !== kycGateEnabled) {
    await sendTx(`CarbonMarketplace.setKYCGate(${kycGateEnabled})`, () => market.setKYCGate(kycGateEnabled), log);
  }
  if (
    (await market.tradingFeePercent()) !== BigInt(tradingFeeBps) ||
    (await market.minPricePerTonne()) !== minPricePerTonne ||
    (await market.kycGateEnabled()) !== kycGateEnabled
  ) {
    throw new Error("CarbonMarketplace: launch parameter read-back mismatch");
  }
}

/** Contract name -> role-table name (the three pools share one). */
const roleTableName = (key) => (key.startsWith("CCT_") ? "CarbonCreditToken" : key);

/** Re-reads the wiring that the constructors establish. Throws on the first inconsistency. */
async function verifyWiring({ contracts, info, paymentToken, paymentDecimals, functionsRouter }) {
  const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const need = (cond, msg) => {
    if (!cond) throw new Error(`Wiring check failed: ${msg}`);
  };
  const nft = info.CarbonCreditNFT.address;
  const market = contracts.CarbonMarketplace;

  need(eq(await market.paymentToken(), paymentToken), "marketplace.paymentToken");
  need(Number(await market.paymentDecimals()) === paymentDecimals, "marketplace.paymentDecimals");
  need(eq(await market.nftContract(), nft), "marketplace.nftContract");
  need(eq(await market.carbonToken(), info[`CCT_${DEFAULT_POOL_TYPE}`].address), "marketplace.carbonToken");
  for (const pool of POOLS) {
    const token = contracts[`CCT_${pool.type}`];
    need(eq(await token.nftContract(), nft), `${pool.symbol}.nftContract`);
    need((await token.methodology()) === pool.type, `${pool.symbol}.methodology`);
    need((await token.symbol()) === pool.symbol, `${pool.symbol}.symbol`);
    need((await token.name()) === pool.name, `${pool.symbol}.name`);
  }
  for (const name of ["EmissionVerifier", "RegistrySync"]) {
    need(eq(await contracts[name].nftContract(), nft), `${name}.nftContract`);
  }
  need(eq(await contracts.CarbonCreditNFT.registrySync(), info.RegistrySync.address), "CarbonCreditNFT.registrySync");
  for (const name of ["EmissionVerifier", "RegistrySync", "CarbonPriceOracle"]) {
    need(eq(await contracts[name].functionsRouter(), functionsRouter), `${name}.functionsRouter`);
  }
}

// ---------------------------------------------------------------------------------------------
// Oracle configuration (sources, Functions config, price sources, reporters)
// ---------------------------------------------------------------------------------------------

const ORACLE_CONSUMERS = ["EmissionVerifier", "RegistrySync", "CarbonPriceOracle"];
/** Marked loudly: these are NOT real data sources. The mock router never fetches them. TESTNET ONLY. */
const TEST_ONLY_PRICE_SOURCES = [
  "https://example.invalid/carb-test-only/price-a/{methodology}",
  "https://example.invalid/carb-test-only/price-b/{methodology}",
];
/** Non-zero placeholder for the immutable router when the oracle is DISABLED and no router is supplied: it has no
 *  code, so every Functions request reverts. Redeploy the three consumers to enable the oracle later. */
const NO_ORACLE_ROUTER_PLACEHOLDER = "0x000000000000000000000000000000000000dEaD";

/** Uploads the reference sources (`setSource`) to the three consumers; writes only when the hash differs. */
async function configureSources({ contracts, log }) {
  const { SOURCE_FOR_CONTRACT, loadSource, sourceHashOf } = require("../functions/sources");
  for (const name of ORACLE_CONSUMERS) {
    const text = loadSource(SOURCE_FOR_CONTRACT[name]);
    const c = contracts[name];
    if ((await c.sourceHash()) !== sourceHashOf(text)) {
      await sendTx(`${name}.setSource(${SOURCE_FOR_CONTRACT[name]}, ${Buffer.byteLength(text)} bytes)`, () => c.setSource(text), log);
    }
    if ((await c.sourceHash()) !== sourceHashOf(text)) throw new Error(`${name}: sourceHash read-back mismatch`);
  }
}

/** `setPriceSources(urls)` unless the oracle already stores exactly this list. */
async function configurePriceSources({ oracle, urls, log }) {
  if (urls.length === 0) return;
  const same = (current) => current.length === urls.length && current.every((u, i) => u === urls[i]);
  if (!same(await oracle.getPriceSources())) {
    await sendTx(`CarbonPriceOracle.setPriceSources(${urls.length})`, () => oracle.setPriceSources(urls), log);
  }
  if (!same(await oracle.getPriceSources())) throw new Error("CarbonPriceOracle: price source read-back mismatch");
}

/** Hand-fed reporters (`reportPrice` fallback). Never granted by a constructor. */
async function grantReporters({ oracle, reporters, log }) {
  for (const reporter of reporters) {
    await grantRoleChecked(oracle, "CarbonPriceOracle", "ORACLE_REPORTER_ROLE", reporter, log);
  }
}

/**
 * Re-reads the oracle end state. enabled: Functions config + source hashes match; disabled: nothing configured
 * (no source, no DON, no subscription), so no Functions request can be sent and `reportPrice` is the only source.
 */
async function verifyOracleState({ contracts, enabled, donId, subscriptionId, gasLimit }) {
  const { SOURCE_FOR_CONTRACT, loadSource, sourceHashOf } = require("../functions/sources");
  const need = (cond, msg) => {
    if (!cond) throw new Error(`FINAL STATE CHECK FAILED: ${msg}`);
  };
  for (const name of ORACLE_CONSUMERS) {
    const c = contracts[name];
    if (enabled) {
      need((await c.donId()) === donId, `${name}.donId`);
      need((await c.subscriptionId()) === BigInt(subscriptionId), `${name}.subscriptionId`);
      need((await c.gasLimit()) === BigInt(gasLimit), `${name}.gasLimit`);
      need((await c.sourceHash()) === sourceHashOf(loadSource(SOURCE_FOR_CONTRACT[name])), `${name}.sourceHash`);
    } else {
      need((await c.subscriptionId()) === 0n, `${name} has a subscription although the oracle is disabled`);
      need((await c.donId()) === ZERO_HASH, `${name} has a DON id although the oracle is disabled`);
      need((await c.sourceHash()) === ZERO_HASH, `${name} has a source although the oracle is disabled`);
    }
  }
}
const ZERO_HASH = `0x${"00".repeat(32)}`;

// ---------------------------------------------------------------------------------------------
// CARB token stack: CarbToken, CarbStaking, IssuerBond, CarbTimelock, CarbGovernor
// ---------------------------------------------------------------------------------------------

const DAY = 24 * 60 * 60;
const TOKEN_KEYS = ["CarbToken", "CarbStaking", "IssuerBond", "CarbTimelock", "CarbGovernor"];
/** Deployed only for an external token that has no votes of its own (see lib/external-token.js). */
const OPTIONAL_TOKEN_KEYS = ["CarbVotes"];
/** Highest `decimals()` the contracts accept (TokenChecks.MAX_DECIMALS). */
const MAX_TOKEN_DECIMALS = 24;
/** Minimal ERC-20 surface used to read / verify a token that Carbonized did not deploy. */
const EXTERNAL_ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];
/** Contract keys of the token stack that Carbonized deploys itself: no CarbToken for an external token. */
const deployedTokenKeys = (external) => [
  ...TOKEN_KEYS.filter((k) => !(external && k === "CarbToken")),
  ...(external?.votes === "wrapper" ? OPTIONAL_TOKEN_KEYS : []),
];
/** Mirrors the hard bounds enforced onchain (CarbStaking / IssuerBond / CarbGovernor / CarbTimelock). */
const TOKEN_BOUNDS = {
  warmup: [3600, 14 * DAY],
  cooldown: [DAY, 30 * DAY],
  thresholdKarb: [1n, 50_000_000n],
  maxDiscountBps: 5000,
  minBondKarb: [1n, 100_000_000n],
  unbondDelay: [7 * DAY, 90 * DAY],
  disputeWindow: [DAY, 30 * DAY],
  timelockDelay: [DAY, 30 * DAY],
  votingDelay: [3600, 7 * DAY],
  votingPeriod: [DAY, 14 * DAY],
  proposalThresholdKarb: [1n, 50_000_000n],
  quorumPercent: [1, 20],
};
/** The script refuses a timelock delay below this on mainnet (the contract floor is 1 day). */
const MAINNET_MIN_TIMELOCK_DELAY = 2 * DAY;
const GOVERNANCE_STAGES_DEPLOYABLE = ["bootstrap", "dual"];
const CARB_DEFAULTS = {
  staking: { warmup: 3 * DAY, cooldown: 7 * DAY, thresholdsKarb: "1000,5000,25000", discountsBps: "0,1000,2500,5000" },
  bond: { minBondKarb: "10000", unbondDelay: 30 * DAY, disputeWindow: 7 * DAY },
  governance: { votingDelay: DAY, votingPeriod: 5 * DAY, proposalThresholdKarb: "1000000", quorumPercent: 4 },
  timelockDelay: MAINNET_MIN_TIMELOCK_DELAY,
};

function envInt(env, key, def, [min, max]) {
  const raw = (env[key] ?? "").trim();
  const value = raw === "" ? def : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer ${min}..${max} (got "${raw || def}")`);
  return value;
}

/**
 * Whole-token amount from env (`def` when unset) scaled by the token's `decimals`. `[min, max]` are WHOLE tokens and
 * mirror the onchain bounds, which scale with `tokenDecimals`. Fractions are allowed up to `decimals` digits.
 */
function envKarb(ethers, env, key, def, [min, max], label = key, decimals = 18) {
  const raw = (env[key] ?? "").trim() || def;
  const pattern = decimals === 0 ? /^[0-9]+$/ : new RegExp(`^[0-9]+(\\.[0-9]{1,${decimals}})?$`);
  if (!pattern.test(raw)) throw new Error(`${label} must be a decimal CARB amount with at most ${decimals} decimals (got "${raw}")`);
  const value = ethers.parseUnits(raw, decimals);
  const unit = 10n ** BigInt(decimals);
  if (value < min * unit || value > max * unit) throw new Error(`${label} must be between ${min} and ${max} CARB`);
  return value;
}

/**
 * Reads and bound-checks every token-stack parameter from env. `timelockDelayFloor` is the lowest delay this
 * script accepts (mainnet: 2 days). Throws on the first out-of-range value, before anything is sent.
 */
function readTokenConfig(
  ethers,
  env,
  { timelockDelayFloor = MAINNET_MIN_TIMELOCK_DELAY, bondRequiredDefault = false, decimals = 18 } = {},
) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_TOKEN_DECIMALS) {
    throw new Error(`CARB token decimals must be an integer 0..${MAX_TOKEN_DECIMALS} (got ${decimals})`);
  }
  const stage = (env.GOVERNANCE_STAGE || "dual").trim().toLowerCase();
  if (!GOVERNANCE_STAGES_DEPLOYABLE.includes(stage)) {
    throw new Error(
      `GOVERNANCE_STAGE must be one of ${GOVERNANCE_STAGES_DEPLOYABLE.join(", ")} (later stages are multisig transactions)`,
    );
  }

  const thresholds = (env.STAKING_THRESHOLDS_CARB || CARB_DEFAULTS.staking.thresholdsKarb).split(",").map((s) => s.trim());
  if (thresholds.length !== 3) throw new Error("STAKING_THRESHOLDS_CARB needs exactly 3 comma separated CARB amounts");
  const thresholdValues = thresholds.map((t, i) => {
    if (!/^[0-9]+$/.test(t)) throw new Error(`STAKING_THRESHOLDS_CARB[${i}] must be a whole CARB amount`);
    return envKarb(ethers, { X: t }, "X", t, TOKEN_BOUNDS.thresholdKarb, `STAKING_THRESHOLDS_CARB[${i}]`, decimals);
  });
  if (!(thresholdValues[0] < thresholdValues[1] && thresholdValues[1] < thresholdValues[2])) {
    throw new Error("STAKING_THRESHOLDS_CARB must be strictly increasing");
  }
  const discounts = (env.STAKING_DISCOUNTS_BPS || CARB_DEFAULTS.staking.discountsBps).split(",").map((s) => Number(s.trim()));
  const discountsOk =
    discounts.length === 4 &&
    discounts.every((d) => Number.isInteger(d) && d >= 0 && d <= TOKEN_BOUNDS.maxDiscountBps) &&
    discounts[0] === 0 &&
    discounts.every((d, i) => i === 0 || d >= discounts[i - 1]);
  if (!discountsOk) throw new Error(`STAKING_DISCOUNTS_BPS must be 4 non-decreasing integers, first 0, last <= ${TOKEN_BOUNDS.maxDiscountBps}`);

  const bondRaw = (env.BOND_REQUIRED ?? "").trim();
  const slashTreasuryRaw = (env.BOND_SLASH_TREASURY ?? "").trim();

  const executorsRaw = (env.TIMELOCK_EXECUTORS || "open").trim();
  const executors =
    executorsRaw === "open" || executorsRaw === "governor"
      ? { mode: executorsRaw, list: [] }
      : { mode: "list", list: parseAddressList(ethers, executorsRaw, "TIMELOCK_EXECUTORS") };

  return {
    stage,
    decimals,
    staking: {
      warmup: envInt(env, "STAKING_WARMUP", CARB_DEFAULTS.staking.warmup, TOKEN_BOUNDS.warmup),
      cooldown: envInt(env, "STAKING_COOLDOWN", CARB_DEFAULTS.staking.cooldown, TOKEN_BOUNDS.cooldown),
      thresholds: thresholdValues,
      discountsBps: discounts,
    },
    bond: {
      minBond: envKarb(ethers, env, "BOND_MIN_CARB", CARB_DEFAULTS.bond.minBondKarb, TOKEN_BOUNDS.minBondKarb, "BOND_MIN_CARB", decimals),
      unbondDelay: envInt(env, "BOND_UNBOND_DELAY", CARB_DEFAULTS.bond.unbondDelay, TOKEN_BOUNDS.unbondDelay),
      disputeWindow: envInt(env, "BOND_DISPUTE_WINDOW", CARB_DEFAULTS.bond.disputeWindow, TOKEN_BOUNDS.disputeWindow),
      bondRequired: bondRaw === "" ? bondRequiredDefault : !/^(0|false|no|off)$/i.test(bondRaw),
      slashTreasury: slashTreasuryRaw === "" ? ZERO_ADDRESS : requireAddress(ethers, slashTreasuryRaw, "BOND_SLASH_TREASURY"),
    },
    governance: {
      votingDelay: envInt(env, "GOV_VOTING_DELAY", CARB_DEFAULTS.governance.votingDelay, TOKEN_BOUNDS.votingDelay),
      votingPeriod: envInt(env, "GOV_VOTING_PERIOD", CARB_DEFAULTS.governance.votingPeriod, TOKEN_BOUNDS.votingPeriod),
      proposalThreshold: envKarb(
        ethers,
        env,
        "GOV_PROPOSAL_THRESHOLD_CARB",
        CARB_DEFAULTS.governance.proposalThresholdKarb,
        TOKEN_BOUNDS.proposalThresholdKarb,
        "GOV_PROPOSAL_THRESHOLD_CARB",
        decimals,
      ),
      quorumPercent: envInt(env, "GOV_QUORUM_PERCENT", CARB_DEFAULTS.governance.quorumPercent, TOKEN_BOUNDS.quorumPercent),
    },
    timelock: {
      minDelay: envInt(env, "TIMELOCK_MIN_DELAY", CARB_DEFAULTS.timelockDelay, [
        Math.max(timelockDelayFloor, TOKEN_BOUNDS.timelockDelay[0]),
        TOKEN_BOUNDS.timelockDelay[1],
      ]),
      extraProposers: parseAddressList(ethers, env.TIMELOCK_PROPOSERS, "TIMELOCK_PROPOSERS"),
      executors,
    },
  };
}

/**
 * Deploys the five token-stack contracts (resumable). CarbStaking / IssuerBond are constructed with the DEPLOYER
 * as admin so the script can wire them; `wireTokenStack` hands them over. The timelock starts with the deployer as
 * its temporary admin, which `wireTokenStack` renounces.
 */
async function deployTokenStack({ hre, store, deployerAddress, recipient, nft, market, cfg, log, confirmations = 1 }) {
  const info = {};
  const c = {};
  const take = async (key, args) => {
    const r = await deployOnce({ hre, store, key, factoryName: key, args, confirmations, log });
    c[key] = r.contract;
    info[key] = { address: r.address, block: r.block, txHash: r.txHash, constructorArgs: r.constructorArgs };
    return r;
  };
  // `cfg.external` (set by the scripts from CARB_TOKEN_ADDRESS, see lib/external-token.js) = a token Carbonized did not
  // deploy: no CarbToken is created; `cfg.external.votes === "wrapper"` adds the CarbVotes wrapper for governance.
  const external = cfg.external ?? null;
  let carbAddress;
  if (external) {
    carbAddress = external.address;
    c.CarbToken = await hre.ethers.getContractAt(EXTERNAL_ERC20_ABI, carbAddress);
    log(`[token] external CARB ${external.symbol} at ${carbAddress} (${external.decimals} decimals): CarbToken is NOT deployed`);
  } else {
    log("[token] CarbToken (fixed supply -> recipient)");
    await take("CarbToken", [recipient]);
    carbAddress = info.CarbToken.address;
  }
  let votesTokenAddress = carbAddress;
  if (external?.votes === "wrapper") {
    log("[token] CarbVotes (1:1 voting wrapper around the external token)");
    await take("CarbVotes", [carbAddress]);
    votesTokenAddress = info.CarbVotes.address;
  }
  log("[token] CarbStaking, IssuerBond");
  await take("CarbStaking", [
    carbAddress,
    deployerAddress,
    cfg.staking.warmup,
    cfg.staking.cooldown,
    cfg.staking.thresholds,
    cfg.staking.discountsBps,
  ]);
  await take("IssuerBond", [
    carbAddress,
    deployerAddress,
    cfg.bond.minBond,
    cfg.bond.unbondDelay,
    cfg.bond.disputeWindow,
    cfg.bond.bondRequired,
    cfg.bond.slashTreasury,
  ]);
  log("[token] CarbTimelock, CarbGovernor");
  await take("CarbTimelock", [cfg.timelock.minDelay, [], [], deployerAddress]);
  await take("CarbGovernor", [
    votesTokenAddress,
    info.CarbTimelock.address,
    cfg.governance.votingDelay,
    cfg.governance.votingPeriod,
    cfg.governance.proposalThreshold,
    cfg.governance.quorumPercent,
    [market, info.CarbStaking.address, info.IssuerBond.address],
  ]);
  return { contracts: c, info };
}

/** Timelock roles: governor (+ extra proposers) propose / cancel, executors per config; deployer's admin role goes. */
async function wireTimelock({ timelock, governorAddress, cfg, deployerAddress, log }) {
  const grant = (roleName, account) => grantRoleChecked(timelock, "CarbTimelock", roleName, account, log);
  for (const proposer of [governorAddress, ...cfg.timelock.extraProposers]) {
    await grant("PROPOSER_ROLE", proposer);
    await grant("CANCELLER_ROLE", proposer);
  }
  const { mode, list } = cfg.timelock.executors;
  const executors = mode === "open" ? [ZERO_ADDRESS] : mode === "governor" ? [governorAddress] : list;
  for (const executor of executors) await grant("EXECUTOR_ROLE", executor);
  await renounceRoleChecked(timelock, "CarbTimelock", "TIMELOCK_ADMIN_ROLE", deployerAddress, log);
}

/** Plan entries that live on CarbStaking / IssuerBond (the deployer administers them until the handover). */
const tokenOwnedEntries = (plan) => plan.grantToTimelock.filter((e) => e.name === "CarbStaking" || e.name === "IssuerBond");

/**
 * Actions that need DEFAULT_ADMIN_ROLE on the marketplace. On a fresh deployment the deployer sends them; when
 * the token is deployed later (21_deploy_token_mainnet.js) the multisig must execute them (calldata is printed).
 */
async function protocolLinkActions({ nft, market, bond, staking, timelock, stage }) {
  const parameter = await market.PARAMETER_ROLE();
  const [bondAddr, stakingAddr, timelockAddr] = await Promise.all([bond.getAddress(), staking.getAddress(), timelock.getAddress()]);
  const actions = [
    {
      label: "CarbonMarketplace.setFeeDiscountProvider(CarbStaking)",
      contract: market,
      fn: "setFeeDiscountProvider",
      args: [stakingAddr],
      done: (await market.feeDiscountProvider()) === stakingAddr,
    },
  ];
  if (stage === "dual") {
    actions.push({
      label: "CarbonMarketplace.grantRole(PARAMETER_ROLE, CarbTimelock)",
      contract: market,
      fn: "grantRole",
      args: [parameter, timelockAddr],
      done: await market.hasRole(parameter, timelockAddr),
    });
  }
  for (const a of actions) {
    a.to = await a.contract.getAddress();
    a.data = a.contract.interface.encodeFunctionData(a.fn, a.args);
  }
  return actions;
}

/** Sends the not-yet-done actions from the connected signer (must hold the admin roles) and re-reads. */
async function applyProtocolLinks({ actions, rebuild, log }) {
  for (const a of actions) {
    if (!a.done) await sendTx(a.label, () => a.contract[a.fn](...a.args), log);
  }
  const after = await rebuild();
  const pending = after.filter((a) => !a.done);
  if (pending.length) throw new Error(`Protocol link read-back mismatch: ${pending.map((a) => a.label).join("; ")}`);
}

/**
 * Deployer-side wiring of the token stack: timelock roles, timelock-admin renounce, governance role grants on
 * staking / bond. `links = true` additionally performs the NFT / marketplace actions (deployer still administers them).
 */
async function wireTokenStack({ ethers, contracts, tokens, cfg, deployerSigner, links, log }) {
  const { governanceRolePlan, applyGovernanceSetup } = require("./governance-setup");
  const deployerAddress = await deployerSigner.getAddress();
  const governorAddress = await tokens.CarbGovernor.getAddress();
  const timelockAddress = await tokens.CarbTimelock.getAddress();

  await wireTimelock({ timelock: tokens.CarbTimelock, governorAddress, cfg, deployerAddress, log });

  const plan = governanceRolePlan({
    market: contracts.CarbonMarketplace,
    staking: tokens.CarbStaking,
    bond: tokens.IssuerBond,
    nft: contracts.CarbonCreditNFT,
  });
  if (cfg.stage === "dual") {
    await applyGovernanceSetup({ grantToTimelock: tokenOwnedEntries(plan) }, timelockAddress, deployerSigner);
    for (const e of tokenOwnedEntries(plan)) log(`  ok  ${e.name}.${e.role} -> CarbTimelock`);
  }

  const build = () =>
    protocolLinkActions({
      nft: contracts.CarbonCreditNFT,
      market: contracts.CarbonMarketplace,
      bond: tokens.IssuerBond,
      staking: tokens.CarbStaking,
      timelock: tokens.CarbTimelock,
      stage: cfg.stage,
    });
  const actions = await build();
  if (links) await applyProtocolLinks({ actions, rebuild: build, log });
  return { plan, actions: links ? await build() : actions };
}

/**
 * Independent read-back of the token stack. `requireLinks` = the NFT / marketplace links must be in place; otherwise
 * the open ones are returned as `pending`. Throws "FINAL STATE CHECK FAILED: ..." on the first inconsistency.
 * `timelockHolders` must NOT include roles on the timelock for the deployer; the check is explicit below.
 */
async function verifyTokenStack({ ethers, contracts, tokens, cfg, recipient, deployerAddress, plan, requireLinks }) {
  const { assertGovernanceBoundaries } = require("./governance-setup");
  const need = (cond, msg) => {
    if (!cond) throw new Error(`FINAL STATE CHECK FAILED: ${msg}`);
  };
  const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const {
    CarbToken: carb,
    CarbStaking: staking,
    IssuerBond: bond,
    CarbTimelock: timelock,
    CarbGovernor: governor,
    CarbVotes: votes,
  } = tokens;
  const [carbAddr, stakingAddr, bondAddr, timelockAddr, governorAddr] = await Promise.all(
    [carb, staking, bond, timelock, governor].map((x) => x.getAddress()),
  );

  // The votes token the governor must be wired to: our CarbToken, an external token that is itself IVotes
  // (timestamp clock), or the CarbVotes wrapper around the external token.
  let governorTokenAddr = carbAddr;
  const external = cfg.external ?? null;
  if (external) {
    need(eq(carbAddr, external.address), "external token address");
    need((await ethers.provider.getCode(carbAddr)) !== "0x", "external token has no code");
    need(Number(await carb.decimals()) === external.decimals, "external token decimals differ from the recorded ones");
    need(Number(await staking.tokenDecimals()) === external.decimals, "staking.tokenDecimals");
    need(Number(await bond.tokenDecimals()) === external.decimals, "bond.tokenDecimals");
    if (external.votes === "wrapper") {
      need(Boolean(votes), "CarbVotes (voting wrapper) is missing");
      const votesAddr = await votes.getAddress();
      need(eq(await votes.underlying(), carbAddr), "votes.underlying");
      need(Number(await votes.decimals()) === external.decimals, "votes.decimals");
      governorTokenAddr = votesAddr;
    } else {
      need(!votes, "CarbVotes was deployed although the external token carries votes natively");
    }
  } else {
    const supply = await carb.totalSupply();
    need(supply === (await carb.INITIAL_SUPPLY()), "CARB supply is not the fixed INITIAL_SUPPLY");
    need((await carb.balanceOf(recipient)) === supply, "CARB supply is not held by the recipient (treasury)");
    need((await carb.balanceOf(deployerAddress)) === 0n || eq(recipient, deployerAddress), "deployer holds CARB");
  }

  need(eq(await staking.carb(), carbAddr), "staking.carb");
  need((await staking.WARMUP()) === BigInt(cfg.staking.warmup), "staking warmup");
  need((await staking.COOLDOWN()) === BigInt(cfg.staking.cooldown), "staking cooldown");
  for (let i = 0; i < 3; i++) need((await staking.tierThresholds(i)) === cfg.staking.thresholds[i], `staking threshold ${i}`);
  for (let i = 0; i < 4; i++) need(Number(await staking.tierDiscountBps(i)) === cfg.staking.discountsBps[i], `staking discount ${i}`);

  need(eq(await bond.carb(), carbAddr), "bond.carb");
  need((await bond.minBond()) === cfg.bond.minBond, "bond.minBond");
  need((await bond.UNBOND_DELAY()) === BigInt(cfg.bond.unbondDelay), "bond.unbondDelay");
  need((await bond.DISPUTE_WINDOW()) === BigInt(cfg.bond.disputeWindow), "bond.disputeWindow");
  need((await bond.bondRequired()) === cfg.bond.bondRequired, "bond.bondRequired");
  need(eq(await bond.slashTreasury(), cfg.bond.slashTreasury), "bond.slashTreasury");

  need(eq(await governor.token(), governorTokenAddr), "governor.token");
  need(eq(await governor.timelock(), timelockAddr), "governor.timelock");
  need((await governor.votingDelay()) === BigInt(cfg.governance.votingDelay), "governor.votingDelay");
  need((await governor.votingPeriod()) === BigInt(cfg.governance.votingPeriod), "governor.votingPeriod");
  need((await governor.proposalThreshold()) === cfg.governance.proposalThreshold, "governor.proposalThreshold");
  need((await governor.quorumNumerator()) === BigInt(cfg.governance.quorumPercent), "governor.quorumPercent");
  for (const target of [await contracts.CarbonMarketplace.getAddress(), stakingAddr, bondAddr, timelockAddr, governorAddr]) {
    need(await governor.allowedTargets(target), `governor does not allow target ${target}`);
  }
  need(!(await governor.allowedTargets(await contracts.CarbonCreditNFT.getAddress())), "governor must not be allowed to call the NFT");

  need((await timelock.getMinDelay()) === BigInt(cfg.timelock.minDelay), "timelock min delay");
  const tl = async (name) => timelock[name]();
  const [proposerRole, executorRole, cancellerRole, adminRole] = await Promise.all(
    ["PROPOSER_ROLE", "EXECUTOR_ROLE", "CANCELLER_ROLE", "TIMELOCK_ADMIN_ROLE"].map(tl),
  );
  for (const proposer of [governorAddr, ...cfg.timelock.extraProposers]) {
    need(await timelock.hasRole(proposerRole, proposer), `timelock: ${proposer} lacks PROPOSER_ROLE`);
    need(await timelock.hasRole(cancellerRole, proposer), `timelock: ${proposer} lacks CANCELLER_ROLE`);
  }
  const { mode, list } = cfg.timelock.executors;
  const wantExecutors = mode === "open" ? [ZERO_ADDRESS] : mode === "governor" ? [governorAddr] : list;
  for (const executor of wantExecutors) need(await timelock.hasRole(executorRole, executor), `timelock: ${executor} lacks EXECUTOR_ROLE`);
  need(await timelock.hasRole(adminRole, timelockAddr), "timelock is not self-administered");
  for (const [name, role] of [["PROPOSER", proposerRole], ["EXECUTOR", executorRole], ["CANCELLER", cancellerRole], ["TIMELOCK_ADMIN", adminRole]]) {
    need(!(await timelock.hasRole(role, deployerAddress)), `deployer still holds ${name}_ROLE on the timelock`);
  }

  const checked = await assertGovernanceBoundaries(plan, timelockAddr);
  const stakingParameter = await staking.PARAMETER_ROLE();
  need((await staking.hasRole(stakingParameter, timelockAddr)) === (cfg.stage === "dual"), "timelock PARAMETER_ROLE on staking does not match the stage");
  need((await bond.hasRole(await bond.SLASHER_ROLE(), timelockAddr)) === (cfg.stage === "dual"), "timelock SLASHER_ROLE on bond does not match the stage");

  const actions = await protocolLinkActions({
    nft: contracts.CarbonCreditNFT,
    market: contracts.CarbonMarketplace,
    bond,
    staking,
    timelock,
    stage: cfg.stage,
  });
  const pending = actions.filter((a) => !a.done);
  if (requireLinks) need(pending.length === 0, `open protocol links: ${pending.map((a) => a.label).join("; ")}`);
  return { boundariesChecked: checked.length, pending };
}

/** Everything the deployer must NOT hold at the end, for every contract in `roleContracts` plus the timelock. */
async function assertDeployerHoldsNothing({ roleContracts, timelock, deployerAddress }) {
  const held = [];
  for (const [key, c] of Object.entries(roleContracts)) {
    for (const roleName of ROLE_NAMES[roleTableName(key)] ?? []) {
      if (await c.hasRole(await roleId(c, roleName), deployerAddress)) held.push(`${key}.${roleName}`);
    }
  }
  if (timelock) {
    for (const roleName of ["PROPOSER_ROLE", "EXECUTOR_ROLE", "CANCELLER_ROLE", "TIMELOCK_ADMIN_ROLE"]) {
      if (await timelock.hasRole(await timelock[roleName](), deployerAddress)) held.push(`CarbTimelock.${roleName}`);
    }
  }
  if (held.length) throw new Error(`FINAL STATE CHECK FAILED: deployer still holds ${held.join(", ")}`);
  return held;
}

/**
 * Multisig takes over the roles the constructors gave the deployer on `staking` / `bond` and the deployer renounces
 * (generic handover for any contract table; the protocol part lives in 20_deploy_mainnet.js `handOver`).
 */
async function handOverTable({ contracts, deployerAddress, multisig, log }) {
  for (const [key, c] of Object.entries(contracts)) {
    const table = roleTableName(key);
    for (const roleName of CONSTRUCTOR_ROLES[table]) await grantRoleChecked(c, key, roleName, multisig, log);
    const ordered = [...ROLE_NAMES[table]].sort((a, b) => Number(a === "DEFAULT_ADMIN_ROLE") - Number(b === "DEFAULT_ADMIN_ROLE"));
    for (const roleName of ordered) await renounceRoleChecked(c, key, roleName, deployerAddress, log);
  }
}

// ---------------------------------------------------------------------------------------------
// Deployment file
// ---------------------------------------------------------------------------------------------

/** Contracts map in the published format (CCT pools nested, like the previous deployments). `tokenInfo` adds the CARB stack. */
function publishedContracts({ info, paymentTokenAddress, paymentTokenSymbol = "USDC", routerAddress, tokenInfo, externalToken }) {
  const pools = {};
  for (const pool of POOLS) pools[pool.type] = info[`CCT_${pool.type}`].address;
  const token = {};
  // External (launchpad) token: its address is published under the same key the app already reads.
  if (externalToken) token.CarbToken = externalToken.address;
  for (const key of [...TOKEN_KEYS, ...OPTIONAL_TOKEN_KEYS]) if (tokenInfo?.[key]) token[key] = tokenInfo[key].address;
  return {
    CarbonCreditNFT: info.CarbonCreditNFT.address,
    CarbonCreditTokens: pools,
    [paymentTokenSymbol]: paymentTokenAddress,
    CarbonMarketplace: info.CarbonMarketplace.address,
    CarbonRegistry: info.CarbonRegistry.address,
    FunctionsRouter: routerAddress,
    EmissionVerifier: info.EmissionVerifier.address,
    RegistrySync: info.RegistrySync.address,
    CarbonPriceOracle: info.CarbonPriceOracle.address,
    ...token,
  };
}

/**
 * Writes `<dir>/<network>.json`, first moving any existing file to `<network>.previous.json`.
 * The caller removes the partial state file after this returns.
 */
function writeDeploymentFile({ dir, network, data }) {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${network}.json`);
  const previous = path.join(dir, `${network}.previous.json`);
  if (fs.existsSync(target)) fs.copyFileSync(target, previous);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, target);
  return { target, previous: fs.existsSync(previous) ? previous : null };
}

/** Build/runtime metadata that does not depend on git. */
function buildMetadata(hre) {
  const compiler = hre.config.solidity.compilers?.[0];
  return {
    solc: compiler?.version,
    optimizerRuns: compiler?.settings?.optimizer?.runs,
    viaIR: compiler?.settings?.viaIR,
    evmVersion: compiler?.settings?.evmVersion,
    hardhat: hre.version,
    ethers: require("ethers").version,
    node: process.version,
  };
}

/** Smallest earlier block across the deployed contracts: where event scans must start. */
function minDeployBlock(info, extraBlocks = []) {
  return Math.min(...Object.values(info).map((i) => i.block), ...extraBlocks);
}

const makeLogger = (quiet) => (...args) => {
  if (!quiet) process.stdout.write(`${args.join(" ")}\n`);
};

module.exports = {
  DEPLOYMENTS_DIR,
  POOLS,
  DEFAULT_POOL_TYPE,
  ROLE_NAMES,
  CONSTRUCTOR_ROLES,
  PAUSABLE,
  ZERO_ADDRESS,
  DEFAULTS,
  isAddress,
  requireAddress,
  parseAddressList,
  parseDonId,
  parseSubscriptionId,
  openState,
  deployOnce,
  deployProtocol,
  sendTx,
  roleId,
  grantRoleChecked,
  renounceRoleChecked,
  configureFunctions,
  configureMarketplace,
  verifyWiring,
  roleTableName,
  publishedContracts,
  writeDeploymentFile,
  buildMetadata,
  minDeployBlock,
  makeLogger,
  DAY,
  gasTally,
  resetGasTally,
  jsonSafe,
  ORACLE_CONSUMERS,
  TEST_ONLY_PRICE_SOURCES,
  NO_ORACLE_ROUTER_PLACEHOLDER,
  configureSources,
  configurePriceSources,
  grantReporters,
  verifyOracleState,
  TOKEN_KEYS,
  OPTIONAL_TOKEN_KEYS,
  MAX_TOKEN_DECIMALS,
  EXTERNAL_ERC20_ABI,
  deployedTokenKeys,
  TOKEN_BOUNDS,
  MAINNET_MIN_TIMELOCK_DELAY,
  CARB_DEFAULTS,
  readTokenConfig,
  deployTokenStack,
  wireTimelock,
  wireTokenStack,
  protocolLinkActions,
  applyProtocolLinks,
  verifyTokenStack,
  assertDeployerHoldsNothing,
  handOverTable,
};
