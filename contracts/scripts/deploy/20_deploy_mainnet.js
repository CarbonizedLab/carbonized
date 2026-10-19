// Robinhood Chain MAINNET (chain id 4663) deployment. NO MOCKS: canonical USDG, and (only if you enable it) the real
// Chainlink Functions router.
//
//   npx hardhat run scripts/deploy/20_deploy_mainnet.js --network robinhoodMainnet            # dry run
//   CONFIRM_MAINNET=yes npx hardhat run scripts/deploy/20_deploy_mainnet.js --network robinhoodMainnet
//
// INTERNAL REVIEW ONLY. The contracts have had an internal review, not a professional audit. Do not put
// real value behind them before an independent audit.
//
// What it deploys: the protocol (NFT, 3 CCT pools, marketplace, registry, EmissionVerifier, RegistrySync,
// CarbonPriceOracle) and, unless DEPLOY_TOKEN=no, the CARB utility stack (CarbToken, CarbStaking, IssuerBond,
// CarbTimelock, CarbGovernor). With DEPLOY_TOKEN=no the token is deployed later with
// scripts/deploy/21_deploy_token_mainnet.js.
//
// Required env:
//   PRIVATE_KEY        deployer key (hardhat.config.js; a fresh, single-purpose key funded with gas only)
//   MAINNET_USDG       address of canonical USDG on Robinhood Chain (6 decimals, symbol USDG)
//   ADMIN_MULTISIG     contract address (e.g. a Safe) that ends up with DEFAULT_ADMIN_ROLE, FEE_MANAGER_ROLE
//                      and every other role; the deployer renounces everything
//   TREASURY_MULTISIG  contract address that receives the WHOLE CARB supply (may equal ADMIN_MULTISIG).
//                      Required unless DEPLOY_TOKEN=no. Must have code and must not be the deployer.
// Oracle (Chainlink Functions is NOT assumed to exist on chain 4663):
//   ENABLE_ORACLE=yes  requires FUNCTIONS_ROUTER, DON_ID, SUBSCRIPTION_ID; the script then sets the Functions
//                      config and uploads the three reference sources (setSource). Anything else (default): the
//                      three consumers are deployed UNCONFIGURED (no source, no DON, no subscription: they cannot
//                      send a request) and CarbonPriceOracle.reportPrice (ORACLE_REPORTER_ROLE) is the only
//                      price source. FUNCTIONS_ROUTER is optional in that mode; without it a code-less placeholder
//                      router is stored (immutable: redeploy the consumers to enable the oracle later).
//   PRICE_SOURCE_URLS  optional, https templates (comma separated, max 5) for setPriceSources (ENABLE_ORACLE=yes)
//   ORACLE_REPORTERS   optional, comma separated addresses that get ORACLE_REPORTER_ROLE (reportPrice fallback)
//   FUNCTIONS_GAS_LIMIT callback gas limit, default 300000 (200000..1000000)
// Optional env:
//   DEPLOY_TOKEN              "no" skips the CARB stack (deploy it later with 21_deploy_token_mainnet.js)
//   ISSUER_ADDRESS            comma separated addresses that get NATIVE_ISSUER_ROLE on the NFT (the only way credits
//                             are created: mintCredit / batchMint). Empty = nobody can issue until the multisig
//                             grants the role.
//   EXTERNAL_ISSUER_ADDRESS   comma separated addresses for registry-attested mintExternalCredit only.
//   ENABLE_ORACLE_ISSUANCE    "yes" (needs ENABLE_ORACLE=yes) also grants NATIVE_ISSUER_ROLE to the EmissionVerifier.
//                             Default OFF.
//   TRADING_FEE_BPS           default 25 (0.25%), contract max 100
//   MIN_PRICE_PER_TONNE_USD   default 1 (USD per tonne, decimal string)
//   KYC_GATE                  default on; "off" / "false" / "0" disables
//   EXPECTED_USDG_SYMBOL      default "USDG"
//   RELEASE_MANIFEST          required approved manifest file for a real broadcast (not used by hardhat tests)
//   CONFIRM_MAINNET=yes       without it the script only prints the dry-run summary and broadcasts nothing
// CARB stack (all bounded; see lib/deploy-core.js readTokenConfig and .env.example):
//   GOVERNANCE_STAGE (bootstrap|dual, default dual), TIMELOCK_MIN_DELAY (>= 172800 s), TIMELOCK_PROPOSERS,
//   TIMELOCK_EXECUTORS (open|governor|list), GOV_VOTING_DELAY / GOV_VOTING_PERIOD / GOV_PROPOSAL_THRESHOLD_CARB /
//   GOV_QUORUM_PERCENT, STAKING_WARMUP / STAKING_COOLDOWN / STAKING_THRESHOLDS_CARB / STAKING_DISCOUNTS_BPS,
//   BOND_MIN_CARB / BOND_UNBOND_DELAY / BOND_DISPUTE_WINDOW / BOND_REQUIRED (default off) / BOND_SLASH_TREASURY.
//   CARB_TOKEN_ADDRESS        bring your own token (launchpad): CarbToken is NOT deployed, TREASURY_MULTISIG is not
//                             needed; CONFIRM_TOKEN=<symbol> is required to broadcast; CARB_VOTES_MODE=auto|native|wrapper.
//                             Token not launched yet? Use DEPLOY_TOKEN=no now and 21_deploy_token_mainnet.js later.
//
// Resumable like 10_deploy_all.js (deployments/robinhoodMainnet.partial.json). Every role grant, renounce
// and parameter is re-read from chain and the script throws on the first mismatch; the last step proves with
// hasRole reads that the deployer holds NO role anywhere (including the timelock).

const fs = require("node:fs");
const {
  DEFAULTS,
  DEPLOYMENTS_DIR,
  POOLS,
  ROLE_NAMES,
  CONSTRUCTOR_ROLES,
  PAUSABLE,
  ZERO_ADDRESS,
  NO_ORACLE_ROUTER_PLACEHOLDER,
  MAINNET_MIN_TIMELOCK_DELAY,
  requireAddress,
  parseAddressList,
  parseDonId,
  parseSubscriptionId,
  openState,
  deployProtocol,
  grantRoleChecked,
  renounceRoleChecked,
  roleId,
  configureFunctions,
  configureMarketplace,
  configureSources,
  configurePriceSources,
  grantReporters,
  verifyOracleState,
  readTokenConfig,
  deployTokenStack,
  wireTokenStack,
  verifyTokenStack,
  assertDeployerHoldsNothing,
  verifyWiring,
  publishedContracts,
  writeDeploymentFile,
  buildMetadata,
  minDeployBlock,
  makeLogger,
  roleTableName,
  gasTally,
  resetGasTally,
} = require("../lib/deploy-core");
const { resolveExternalToken, externalSummary, assertConfigFitsSupply } = require("../lib/external-token");
const { assertReleaseManifest } = require("./release-manifest");

const MAINNET_CHAIN_ID = 4663n;
const DEPLOYMENT_NAME = "robinhoodMainnet";
const CANONICAL_USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const REQUIRED_PAYMENT_DECIMALS = 6;
const MAX_TRADING_FEE_BPS = 100; // contract constant MAX_TRADING_FEE
const MAX_MIN_PRICE_USD = 1_000_000; // contract constant MAX_MIN_PRICE_PER_TONNE (in USD)
const MIN_FUNCTIONS_GAS = 200_000;
const MAX_FUNCTIONS_GAS = 1_000_000;
const MAX_PRICE_SOURCES = 5;
const MAX_URL_LENGTH = 512;
const DEFAULT_MIN_PRICE_USD = "1";
const FALSE_WORDS = /^(0|false|no|off)$/i;
const HTTPS_URL = /^https:\/\/[^\s,]+$/;

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
];

/** Escape hatch for the in-process dry run ONLY. Refused on every other network. */
function chainIdOverrideAllowed(hre, env) {
  const flag = env.ALLOW_CHAINID_OVERRIDE_HARDHAT === "1";
  if (flag && hre.network.name !== "hardhat") {
    throw new Error("ALLOW_CHAINID_OVERRIDE_HARDHAT is only honoured on the in-process hardhat network. Unset it.");
  }
  return flag;
}

/** Chain id 4663 + network name (or the hardhat-only override). Shared with 21_deploy_token_mainnet.js. */
async function preflightChain({ hre, env }) {
  const { ethers } = hre;
  const network = await ethers.provider.getNetwork();
  const override = chainIdOverrideAllowed(hre, env);
  if (network.chainId !== MAINNET_CHAIN_ID && !override) {
    throw new Error(`Refusing to run: connected chain id is ${network.chainId}, expected ${MAINNET_CHAIN_ID} (Robinhood Chain mainnet).`);
  }
  if (!override && hre.network.name !== DEPLOYMENT_NAME) {
    throw new Error(`Run with --network ${DEPLOYMENT_NAME} (got ${hre.network.name}).`);
  }
  return { chainId: network.chainId, override };
}

/** A multisig must be a deployed contract (an EOA is only accepted by the in-process test) and not the deployer. */
async function requireMultisig({ hre, env, address, label, deployerAddress }) {
  const eoaAllowed = env.ALLOW_EOA_ADMIN_HARDHAT === "1";
  if (eoaAllowed && hre.network.name !== "hardhat") {
    throw new Error("ALLOW_EOA_ADMIN_HARDHAT is only honoured on the in-process hardhat network. Unset it.");
  }
  if (address === deployerAddress) throw new Error(`${label} must not be the deployer`);
  const isContract = (await hre.ethers.provider.getCode(address)) !== "0x";
  if (!isContract && !eoaAllowed) {
    throw new Error(`${label} ${address} has no code: it must be a deployed multisig (e.g. Safe), not an EOA`);
  }
  return isContract;
}

function parseUrlList(raw, label) {
  const urls = (raw ?? "")
    .split(/[,\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (urls.length > MAX_PRICE_SOURCES) throw new Error(`${label}: at most ${MAX_PRICE_SOURCES} URLs`);
  for (const url of urls) {
    if (!HTTPS_URL.test(url) || url.length > MAX_URL_LENGTH) throw new Error(`${label}: "${url}" is not an https URL (<= ${MAX_URL_LENGTH} bytes)`);
  }
  return urls;
}

function readConfig(hre, env) {
  const { ethers } = hre;
  const oracleEnabled = env.ENABLE_ORACLE === "yes";
  const deployToken = (env.DEPLOY_TOKEN ?? "yes").trim().toLowerCase() !== "no";
  // CARB_TOKEN_ADDRESS = bring your own token: CarbToken is not deployed, no TREASURY_MULTISIG is needed.
  const externalTokenRaw = (env.CARB_TOKEN_ADDRESS ?? "").trim();
  if (!deployToken && externalTokenRaw) {
    throw new Error("CARB_TOKEN_ADDRESS needs the token stack: remove DEPLOY_TOKEN=no, or attach the token later with 21_deploy_token_mainnet.js");
  }

  const required = ["MAINNET_USDG", "ADMIN_MULTISIG"];
  if (oracleEnabled) required.push("FUNCTIONS_ROUTER", "DON_ID", "SUBSCRIPTION_ID");
  if (deployToken && !externalTokenRaw) required.push("TREASURY_MULTISIG");
  const missing = required.filter((k) => !env[k] || !env[k].trim());
  if (missing.length) throw new Error(`Missing required env: ${missing.join(", ")}`);

  if (env.ENABLE_ORACLE_ISSUANCE === "yes" && !oracleEnabled) {
    throw new Error("ENABLE_ORACLE_ISSUANCE=yes requires ENABLE_ORACLE=yes");
  }
  if (!oracleEnabled && env.PRICE_SOURCE_URLS?.trim()) {
    throw new Error("PRICE_SOURCE_URLS needs ENABLE_ORACLE=yes (without the oracle, reportPrice is the only source)");
  }

  const tradingFeeBps = env.TRADING_FEE_BPS ? Number(env.TRADING_FEE_BPS) : DEFAULTS.tradingFeeBps;
  if (!Number.isInteger(tradingFeeBps) || tradingFeeBps < 0 || tradingFeeBps > MAX_TRADING_FEE_BPS) {
    throw new Error(`TRADING_FEE_BPS must be an integer 0..${MAX_TRADING_FEE_BPS}`);
  }
  const minPriceUsd = (env.MIN_PRICE_PER_TONNE_USD || DEFAULT_MIN_PRICE_USD).trim();
  if (!/^[0-9]+(\.[0-9]{1,6})?$/.test(minPriceUsd) || Number(minPriceUsd) <= 0 || Number(minPriceUsd) > MAX_MIN_PRICE_USD) {
    throw new Error(`MIN_PRICE_PER_TONNE_USD must be a decimal in (0, ${MAX_MIN_PRICE_USD}] with at most 6 decimals`);
  }
  const functionsGasLimit = env.FUNCTIONS_GAS_LIMIT ? Number(env.FUNCTIONS_GAS_LIMIT) : DEFAULTS.functionsGasLimit;
  if (!Number.isInteger(functionsGasLimit) || functionsGasLimit < MIN_FUNCTIONS_GAS || functionsGasLimit > MAX_FUNCTIONS_GAS) {
    throw new Error(`FUNCTIONS_GAS_LIMIT must be an integer ${MIN_FUNCTIONS_GAS}..${MAX_FUNCTIONS_GAS}`);
  }

  const routerSupplied = Boolean(env.FUNCTIONS_ROUTER?.trim());
  return {
    paymentToken: requireAddress(ethers, env.MAINNET_USDG, "MAINNET_USDG"),
    oracleEnabled,
    routerSupplied,
    router: routerSupplied ? requireAddress(ethers, env.FUNCTIONS_ROUTER, "FUNCTIONS_ROUTER") : NO_ORACLE_ROUTER_PLACEHOLDER,
    donId: oracleEnabled ? parseDonId(ethers, env.DON_ID) : `0x${"00".repeat(32)}`,
    subscriptionId: oracleEnabled ? parseSubscriptionId(env.SUBSCRIPTION_ID) : 0n,
    priceSources: oracleEnabled ? parseUrlList(env.PRICE_SOURCE_URLS, "PRICE_SOURCE_URLS") : [],
    reporters: parseAddressList(ethers, env.ORACLE_REPORTERS, "ORACLE_REPORTERS"),
    multisig: requireAddress(ethers, env.ADMIN_MULTISIG, "ADMIN_MULTISIG"),
    deployToken,
    externalTokenRaw: deployToken ? externalTokenRaw : "",
    external: null,
    treasury: deployToken && !externalTokenRaw ? requireAddress(ethers, env.TREASURY_MULTISIG, "TREASURY_MULTISIG") : null,
    token:
      deployToken && !externalTokenRaw
        ? readTokenConfig(ethers, env, { timelockDelayFloor: MAINNET_MIN_TIMELOCK_DELAY, bondRequiredDefault: false })
        : null,
    issuers: parseAddressList(ethers, env.ISSUER_ADDRESS, "ISSUER_ADDRESS"),
    externalIssuers: parseAddressList(ethers, env.EXTERNAL_ISSUER_ADDRESS, "EXTERNAL_ISSUER_ADDRESS"),
    tradingFeeBps,
    minPriceUsd,
    kycGateEnabled: !FALSE_WORDS.test((env.KYC_GATE ?? "on").trim()),
    functionsGasLimit,
    oracleIssuance: oracleEnabled && env.ENABLE_ORACLE_ISSUANCE === "yes",
    expectedSymbol: (env.EXPECTED_USDG_SYMBOL || "USDG").trim(),
  };
}

/** Reads and validates everything the deployment depends on, before a single transaction is sent. */
async function preflight({ hre, env, cfg, deployerAddress }) {
  const { ethers } = hre;
  const { chainId, override } = await preflightChain({ hre, env });

  const code = async (address) => (await ethers.provider.getCode(address)) !== "0x";
  if (!override && cfg.paymentToken.toLowerCase() !== CANONICAL_USDG.toLowerCase()) {
    throw new Error(`MAINNET_USDG must be canonical USDG ${CANONICAL_USDG}`);
  }
  const paymentToken = new ethers.Contract(cfg.paymentToken, ERC20_ABI, ethers.provider);
  if (!(await code(cfg.paymentToken))) throw new Error(`MAINNET_USDG ${cfg.paymentToken} has no code on this chain`);
  const [decimals, symbol, supply] = await Promise.all([paymentToken.decimals(), paymentToken.symbol(), paymentToken.totalSupply()]);
  if (Number(decimals) !== REQUIRED_PAYMENT_DECIMALS) {
    throw new Error(`MAINNET_USDG decimals() is ${decimals}; the launch is specified for ${REQUIRED_PAYMENT_DECIMALS}`);
  }
  if (symbol !== cfg.expectedSymbol) {
    throw new Error(`MAINNET_USDG symbol() is "${symbol}", expected "${cfg.expectedSymbol}". Wrong token address?`);
  }
  if (cfg.routerSupplied && !(await code(cfg.router))) throw new Error(`FUNCTIONS_ROUTER ${cfg.router} has no code on this chain`);

  const multisigIsContract = await requireMultisig({ hre, env, address: cfg.multisig, label: "ADMIN_MULTISIG", deployerAddress });
  const treasuryIsContract = cfg.treasury
    ? await requireMultisig({ hre, env, address: cfg.treasury, label: "TREASURY_MULTISIG", deployerAddress })
    : null;
  for (const issuer of cfg.issuers) {
    if (issuer === deployerAddress) throw new Error("ISSUER_ADDRESS must not include the deployer");
  }
  for (const issuer of cfg.externalIssuers) {
    if (issuer === deployerAddress) throw new Error("EXTERNAL_ISSUER_ADDRESS must not include the deployer");
    if (cfg.issuers.includes(issuer)) throw new Error("ISSUER_ADDRESS and EXTERNAL_ISSUER_ADDRESS must not overlap");
  }
  for (const reporter of cfg.reporters) {
    if (reporter === deployerAddress) throw new Error("ORACLE_REPORTERS must not include the deployer");
  }

  return { chainId, symbol, decimals: Number(decimals), supply, override, multisigIsContract, treasuryIsContract };
}

function printSummary({ log, hre, cfg, pre, deployerAddress, balance, confirm }) {
  const { ethers } = hre;
  const line = (k, v) => log(`  ${k.padEnd(26)} ${v}`);
  const noCode = (ok) => (ok ? "" : "  (NO CODE, test override)");
  log("\n==================== CARBONIZED MAINNET DEPLOYMENT: SUMMARY ====================");
  log("INTERNAL REVIEW ONLY: get a professional audit before real value goes through these contracts.\n");
  line("chain id", `${pre.chainId}${pre.override ? "  (hardhat dry-run override!)" : ""}`);
  line("deployer", deployerAddress);
  line("deployer gas balance", `${ethers.formatEther(balance)} ETH`);
  line("payment token", `${cfg.paymentToken}  (${pre.symbol}, ${pre.decimals} decimals)`);
  line("admin multisig", `${cfg.multisig}${noCode(pre.multisigIsContract)}`);
  line("NATIVE_ISSUER_ROLE holders", cfg.issuers.length ? cfg.issuers.join(", ") : "(none: multisig must grant it later)");
  line("trading fee", `${cfg.tradingFeeBps} bps`);
  line("min price per tonne", `${cfg.minPriceUsd} USD`);
  line("KYC gate", cfg.kycGateEnabled ? "ON" : "OFF");
  if (cfg.oracleEnabled) {
    line("oracle", "ENABLED (Functions config + reference sources uploaded)");
    line("Functions router", cfg.router);
    line("DON id", cfg.donId);
    line("subscription id", cfg.subscriptionId.toString());
    line("callback gas limit", String(cfg.functionsGasLimit));
    line("price source URLs", cfg.priceSources.length ? cfg.priceSources.join(" | ") : "(none: set with setPriceSources later)");
    line("oracle issuance", cfg.oracleIssuance ? "ON (EmissionVerifier gets NATIVE_ISSUER_ROLE)" : "OFF (EmissionVerifier gets no NATIVE_ISSUER_ROLE)");
  } else {
    line("oracle", "DISABLED: consumers deployed UNCONFIGURED, reportPrice is the only price source");
    line("Functions router", cfg.routerSupplied ? cfg.router : `${cfg.router}  (code-less placeholder)`);
  }
  line("ORACLE_REPORTER_ROLE", cfg.reporters.length ? cfg.reporters.join(", ") : "(none: multisig must grant it later)");
  if (cfg.deployToken) {
    const t = cfg.token;
    if (cfg.external) {
      const e = cfg.external;
      line("CARB token", `EXTERNAL ${e.symbol} (${e.name}) ${e.address}, ${e.decimals} decimals, supply ${ethers.formatUnits(e.totalSupply, e.decimals)}`);
      line("governance votes", e.votes === "native" ? "the token itself (ERC-5805, timestamp clock)" : "CarbVotes wrapper (vCARB) is deployed");
    } else {
      line("CARB supply recipient", `${cfg.treasury}${noCode(pre.treasuryIsContract)}`);
    }
    line("governance stage", t.stage === "dual" ? "dual (timelock gets PARAMETER/SLASHER roles; multisig keeps its copies)" : "bootstrap (timelock holds nothing)");
    line("timelock min delay", `${t.timelock.minDelay} s`);
    line("timelock executors", t.timelock.executors.mode === "list" ? t.timelock.executors.list.join(", ") : t.timelock.executors.mode);
    line("timelock extra proposers", t.timelock.extraProposers.length ? t.timelock.extraProposers.join(", ") : "(none: governor only)");
    line("voting delay / period", `${t.governance.votingDelay} s / ${t.governance.votingPeriod} s`);
    line("proposal threshold", `${ethers.formatUnits(t.governance.proposalThreshold, t.decimals)} ${cfg.external?.symbol ?? "CARB"}`);
    line("quorum", `${t.governance.quorumPercent} %`);
    line("bond path", t.bond.bondRequired ? "OPEN (bonded issuers can self-issue!)" : "CLOSED (bondRequired=false)");
  } else {
    line("CARB stack", "NOT deployed now (DEPLOY_TOKEN=no): use 21_deploy_token_mainnet.js later");
  }
  log("\n  Will deploy: CarbonCreditNFT, " + POOLS.map((p) => p.symbol).join(", ") + ", CarbonMarketplace,");
  log("               CarbonRegistry (admin = multisig), EmissionVerifier, RegistrySync, CarbonPriceOracle");
  if (cfg.deployToken) {
    log(`               ${cfg.external ? "(CARB: external token attached)" : "CarbToken,"} CarbStaking, IssuerBond, CarbTimelock, CarbGovernor`);
    if (cfg.external?.votes === "wrapper") log("               CarbVotes (voting wrapper around the external CARB)");
  }
  log("  Then: launch limits, oracle config (if enabled), NATIVE_ISSUER_ROLE, token wiring; grant every role to the multisig;");
  log("        deployer renounces every role; each step is re-read from chain; final check: deployer holds NOTHING.");
  log("  Nothing is paused. No mocks are deployed.");
  log(confirm ? "\n  CONFIRM_MAINNET=yes -> BROADCASTING.\n" : "\n  DRY RUN: nothing was sent. Re-run with CONFIRM_MAINNET=yes to broadcast.\n");
  log("============================================================================\n");
}

/** Multisig takes over every role the constructors gave the deployer; the deployer then renounces all. */
async function handOver({ contracts, deployerAddress, multisig, log }) {
  for (const [key, c] of Object.entries(contracts)) {
    const table = roleTableName(key);
    // CarbonRegistry was constructed with the multisig as admin: nothing to hand over.
    for (const roleName of CONSTRUCTOR_ROLES[table]) {
      await grantRoleChecked(c, key, roleName, multisig, log);
    }
    // DEFAULT_ADMIN_ROLE goes last so the deployer can still renounce the others.
    const ordered = [...ROLE_NAMES[table]].sort((a, b) => Number(a === "DEFAULT_ADMIN_ROLE") - Number(b === "DEFAULT_ADMIN_ROLE"));
    for (const roleName of ordered) {
      await renounceRoleChecked(c, key, roleName, deployerAddress, log);
    }
  }
}

/** Final, independent proof of the end state. Throws on the first inconsistency. */
async function verifyFinalState({ contracts, info, deployerAddress, multisig, issuers, cfg, paymentDecimals, ethers }) {
  const oracleIssuance = cfg.oracleIssuance === true;
  const fail = (msg) => {
    throw new Error(`FINAL STATE CHECK FAILED: ${msg}`);
  };
  for (const [key, c] of Object.entries(contracts)) {
    const table = roleTableName(key);
    for (const roleName of ROLE_NAMES[table]) {
      const role = await roleId(c, roleName);
      if (await c.hasRole(role, deployerAddress)) fail(`deployer still holds ${roleName} on ${key}`);
    }
    for (const roleName of CONSTRUCTOR_ROLES[table]) {
      const role = await roleId(c, roleName);
      if (!(await c.hasRole(role, multisig))) fail(`multisig lacks ${roleName} on ${key}`);
    }
    if (PAUSABLE.includes(table) && (await c.paused())) fail(`${key} is paused`);
  }
  const nft = contracts.CarbonCreditNFT;
  const issuerRole = await nft.NATIVE_ISSUER_ROLE();
  for (const holder of [...(oracleIssuance ? [info.EmissionVerifier.address] : []), ...issuers]) {
    if (!(await nft.hasRole(issuerRole, holder))) fail(`${holder} lacks NATIVE_ISSUER_ROLE on the NFT`);
  }
  if (!oracleIssuance && (await nft.hasRole(issuerRole, info.EmissionVerifier.address))) {
    fail("EmissionVerifier holds NATIVE_ISSUER_ROLE but ENABLE_ORACLE_ISSUANCE is not set");
  }
  const market = contracts.CarbonMarketplace;
  if (!(await market.hasRole(await market.FEE_MANAGER_ROLE(), multisig))) fail("multisig lacks FEE_MANAGER_ROLE");
  if ((await market.tradingFeePercent()) !== BigInt(cfg.tradingFeeBps)) fail("trading fee mismatch");
  if ((await market.minPricePerTonne()) !== ethers.parseUnits(cfg.minPriceUsd, paymentDecimals)) fail("min price mismatch");
  if ((await market.kycGateEnabled()) !== cfg.kycGateEnabled) fail("KYC gate flag mismatch");
  if (cfg.reporters) {
    const oracle = contracts.CarbonPriceOracle;
    const reporterRole = await oracle.ORACLE_REPORTER_ROLE();
    for (const reporter of cfg.reporters) {
      if (!(await oracle.hasRole(reporterRole, reporter))) fail(`${reporter} lacks ORACLE_REPORTER_ROLE`);
    }
  }
}

/**
 * @param {object} opts
 * @param {import("hardhat/types").HardhatRuntimeEnvironment} opts.hre
 * @param {string} [opts.outDir]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {boolean} [opts.quiet]
 * @param {number} [opts.confirmations]
 * @returns {Promise<{dryRun: true, summary: object} | {dryRun: false, deployment: object, contracts: object, tokens: object, file: string}>}
 */
async function deployMainnet({ hre, outDir = DEPLOYMENTS_DIR, env = process.env, quiet = false, confirmations = 1 }) {
  const { ethers } = hre;
  const log = makeLogger(quiet);
  const cfg = readConfig(hre, env);

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer available: set PRIVATE_KEY in .env");
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  const pre = await preflight({ hre, env, cfg, deployerAddress });
  const confirm = env.CONFIRM_MAINNET === "yes";
  // External CARB (CARB_TOKEN_ADDRESS): validated, symbol-confirmed (when broadcasting) and its decimals decide the
  // scale of the token-stack parameters, so the token config is read only now.
  if (cfg.deployToken && cfg.externalTokenRaw) {
    cfg.external = await resolveExternalToken({ ethers, env, log, requireConfirm: confirm });
    cfg.token = readTokenConfig(ethers, env, {
      timelockDelayFloor: MAINNET_MIN_TIMELOCK_DELAY,
      bondRequiredDefault: false,
      decimals: cfg.external.decimals,
    });
    cfg.token.external = cfg.external;
    assertConfigFitsSupply(cfg.token, cfg.external);
  }
  printSummary({ log, hre, cfg, pre, deployerAddress, balance, confirm });
  if (!confirm) return { dryRun: true, summary: { chainId: Number(pre.chainId), deployer: deployerAddress, ...cfg } };
  if (!pre.override) assertReleaseManifest({ env });
  if (balance === 0n) throw new Error("Deployer has no gas funds");

  resetGasTally();
  const store = openState({ dir: outDir, network: DEPLOYMENT_NAME, chainId: Number(pre.chainId), deployer: deployerAddress, log });

  const { contracts, info } = await deployProtocol({
    hre,
    store,
    paymentToken: cfg.paymentToken,
    functionsRouter: cfg.router,
    adminForRegistry: cfg.multisig,
    log,
    confirmations,
  });

  log("[config] launch limits, oracle, issuers");
  await configureMarketplace({
    market: contracts.CarbonMarketplace,
    tradingFeeBps: cfg.tradingFeeBps,
    minPricePerTonne: ethers.parseUnits(cfg.minPriceUsd, pre.decimals),
    kycGateEnabled: cfg.kycGateEnabled,
    log,
  });
  if (cfg.oracleEnabled) {
    await configureFunctions({ contracts, donId: cfg.donId, subscriptionId: cfg.subscriptionId, gasLimit: cfg.functionsGasLimit, log });
    await configureSources({ contracts, log });
    await configurePriceSources({ oracle: contracts.CarbonPriceOracle, urls: cfg.priceSources, log });
  } else {
    log("  oracle DISABLED: consumers stay unconfigured (no source, no DON, no subscription)");
  }
  await grantReporters({ oracle: contracts.CarbonPriceOracle, reporters: cfg.reporters, log });
  // Issuance is NATIVE_ISSUER_ROLE only. No one gets it unless listed; the EmissionVerifier (mints on claimCredits)
  // only with ENABLE_ORACLE_ISSUANCE=yes.
  const nft = contracts.CarbonCreditNFT;
  const issuerHolders = [...(cfg.oracleIssuance ? [info.EmissionVerifier.address] : []), ...cfg.issuers];
  for (const holder of issuerHolders) {
    await grantRoleChecked(nft, "CarbonCreditNFT", "NATIVE_ISSUER_ROLE", holder, log);
  }
  for (const holder of cfg.externalIssuers) {
    await grantRoleChecked(nft, "CarbonCreditNFT", "EXTERNAL_ISSUER_ROLE", holder, log);
  }

  // CARB stack: deployed and wired while the deployer still administers NFT / marketplace / staking / bond.
  let tokens = {};
  let tokenInfo = {};
  let plan = null;
  if (cfg.deployToken) {
    const deployed = await deployTokenStack({
      hre,
      store,
      deployerAddress,
      recipient: cfg.treasury,
      nft: info.CarbonCreditNFT.address,
      market: info.CarbonMarketplace.address,
      cfg: cfg.token,
      log,
      confirmations,
    });
    tokens = deployed.contracts;
    tokenInfo = deployed.info;
    plan = (await wireTokenStack({ ethers, contracts, tokens, cfg: cfg.token, deployerSigner: deployer, links: true, log })).plan;
  }

  await verifyWiring({
    contracts,
    info,
    paymentToken: cfg.paymentToken,
    paymentDecimals: pre.decimals,
    functionsRouter: cfg.router,
  });

  log("[handover] roles -> multisig, deployer renounces");
  const roleContracts = cfg.deployToken ? { ...contracts, CarbStaking: tokens.CarbStaking, IssuerBond: tokens.IssuerBond } : contracts;
  await handOver({ contracts: roleContracts, deployerAddress, multisig: cfg.multisig, log });

  await verifyFinalState({
    contracts: roleContracts,
    info,
    deployerAddress,
    multisig: cfg.multisig,
    issuers: cfg.issuers,
    cfg,
    paymentDecimals: pre.decimals,
    ethers,
  });
  await verifyOracleState({
    contracts,
    enabled: cfg.oracleEnabled,
    donId: cfg.donId,
    subscriptionId: cfg.subscriptionId,
    gasLimit: cfg.functionsGasLimit,
  });
  if (cfg.deployToken) {
    await verifyTokenStack({
      ethers,
      contracts,
      tokens,
      cfg: cfg.token,
      recipient: cfg.treasury,
      deployerAddress,
      plan,
      requireLinks: true,
    });
  }
  await assertDeployerHoldsNothing({ roleContracts, timelock: tokens.CarbTimelock, deployerAddress });
  log(`  ok  final role / parameter state verified from chain; deployer ${deployerAddress} holds NO role on ${Object.keys(roleContracts).length + (cfg.deployToken ? 1 : 0)} contracts`);

  const allInfo = { ...info, ...tokenInfo };
  const deployBlock = minDeployBlock(allInfo);
  const tokenSummary = cfg.deployToken
    ? {
        deployed: true,
        treasury: cfg.treasury,
        decimals: cfg.token.decimals,
        ...(cfg.external ? { external: externalSummary(cfg.external) } : {}),
        stage: cfg.token.stage,
        timelockMinDelay: cfg.token.timelock.minDelay,
        timelockExecutors: cfg.token.timelock.executors,
        timelockExtraProposers: cfg.token.timelock.extraProposers,
        governance: Object.fromEntries(Object.entries(cfg.token.governance).map(([k, v]) => [k, v.toString()])),
        staking: {
          warmup: cfg.token.staking.warmup,
          cooldown: cfg.token.staking.cooldown,
          thresholds: cfg.token.staking.thresholds.map(String),
          discountsBps: cfg.token.staking.discountsBps,
        },
        bond: {
          minBond: cfg.token.bond.minBond.toString(),
          unbondDelay: cfg.token.bond.unbondDelay,
          disputeWindow: cfg.token.bond.disputeWindow,
          bondRequired: cfg.token.bond.bondRequired,
          slashTreasury: cfg.token.bond.slashTreasury,
        },
      }
    : { deployed: false };
  const deployment = {
    schemaVersion: 2,
    ...(cfg.external ? { externalToken: true } : {}),
    network: DEPLOYMENT_NAME,
    chainId: Number(pre.chainId),
    isTestnet: false,
    usesMocks: false,
    deployer: deployerAddress,
    admin: cfg.multisig,
    timestamp: new Date().toISOString(),
    deployBlock,
    lastKnownBlock: await ethers.provider.getBlockNumber(),
    decimals: { payment: pre.decimals, carbon: 18 },
    paymentToken: { address: cfg.paymentToken, symbol: pre.symbol, decimals: pre.decimals, isMock: false },
    contracts: publishedContracts({
      info,
      paymentTokenAddress: cfg.paymentToken,
      paymentTokenSymbol: pre.symbol,
      routerAddress: cfg.router,
      tokenInfo,
      externalToken: cfg.external,
    }),
    deployBlocks: Object.fromEntries(Object.entries(allInfo).map(([k, v]) => [k, v.block])),
    constructorArgs: Object.fromEntries(Object.entries(allInfo).map(([k, v]) => [k, v.constructorArgs])),
    functions: {
      enabled: cfg.oracleEnabled,
      router: cfg.router,
      routerIsMock: false,
      routerIsPlaceholder: !cfg.routerSupplied,
      donId: cfg.oracleEnabled ? cfg.donId : null,
      subscriptionId: cfg.oracleEnabled ? cfg.subscriptionId.toString() : null,
      gasLimit: cfg.oracleEnabled ? cfg.functionsGasLimit : null,
    },
    config: {
      tradingFeeBps: cfg.tradingFeeBps,
      minPricePerTonne: ethers.parseUnits(cfg.minPriceUsd, pre.decimals).toString(),
      kycGateEnabled: cfg.kycGateEnabled,
      oracleIssuance: cfg.oracleIssuance,
      oracle: { enabled: cfg.oracleEnabled, priceSources: cfg.priceSources, reporters: cfg.reporters },
      token: tokenSummary,
    },
    roles: {
      note: "Every admin/operational role is held by `holder`; the deployer renounced all roles. `issuers` hold NATIVE_ISSUER_ROLE.",
      holder: cfg.multisig,
      issuers: issuerHolders,
    },
    gas: { total: gasTally.gas.toString(), transactions: gasTally.txs, note: "execution gas on the deployment network, excluding the L1 data fee" },
    build: buildMetadata(hre),
  };

  const written = writeDeploymentFile({ dir: outDir, network: DEPLOYMENT_NAME, data: deployment });
  fs.rmSync(store.file, { force: true });
  log(`\nMainnet deployment complete. Wrote ${written.target}${written.previous ? ` (previous kept at ${written.previous})` : ""}`);
  log(`Gas used by the deployer: ${gasTally.gas} in ${gasTally.txs} transactions`);
  log("Next: verify on Blockscout, add the 3 consumers to the Functions subscription (if enabled),");
  log("then `node scripts/update-carb-env.js --network robinhoodMainnet`.");
  return { dryRun: false, deployment, contracts, tokens, file: written.target };
}

module.exports = {
  deployMainnet,
  MAINNET_CHAIN_ID,
  DEPLOYMENT_NAME,
  ZERO_ADDRESS,
  readConfig,
  preflight,
  preflightChain,
  requireMultisig,
  handOver,
  verifyFinalState,
};

if (require.main === module) {
  deployMainnet({ hre: require("hardhat") })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
