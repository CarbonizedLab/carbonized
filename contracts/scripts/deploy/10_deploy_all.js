// ONE idempotent testnet deployment of the whole Carbonized protocol (NEW contracts), against mocks:
//   MockERC20 "USDC" (6 decimals, like the real one), MockFunctionsRouter, then
//   CarbonCreditNFT, 3x CarbonCreditToken, CarbonMarketplace, CarbonRegistry, EmissionVerifier,
//   RegistrySync, CarbonPriceOracle, the CARB utility stack (CarbToken, CarbStaking, IssuerBond,
//   CarbTimelock, CarbGovernor) plus the role wiring.
//
//   npx hardhat run scripts/deploy/10_deploy_all.js --network robinhood
//
// Idempotent / resumable: every contract is recorded in deployments/<network>.partial.json as soon as it
// is mined. If the run is interrupted, re-run the same command and it continues from there (it checks the
// code exists on chain); roles/limits are only written when they differ from the desired state. A finished
// run writes deployments/<network>.json and keeps the previous one as <network>.previous.json.
//
// TESTNETS ONLY. The script refuses to run against any chain not in TESTNET_CHAIN_IDS: the mock USDC,
// the mock Functions router, the deployer's NATIVE_ISSUER_ROLE / ORACLE_REPORTER_ROLE, the deployer as CARB treasury
// and the placeholder price sources (https://example.invalid/...) must never reach a network that holds value.
//
// Optional env: KYC_GATE=true (turn the marketplace KYC gate on), USDC_MINT_TO=0xA,0xB (extra test wallets
// that get 1,000,000 test USDC), DON_ID / SUBSCRIPTION_ID (stored in the consumers; defaults are placeholders
// because the mock router ignores them). CARB stack parameters: same env names as the mainnet script
// (STAKING_*, BOND_*, GOV_*, TIMELOCK_*, GOVERNANCE_STAGE), see .env.example.

const {
  DEFAULTS,
  DEPLOYMENTS_DIR,
  POOLS,
  CONSTRUCTOR_ROLES,
  PAUSABLE,
  parseAddressList,
  parseDonId,
  parseSubscriptionId,
  openState,
  deployOnce,
  deployProtocol,
  grantRoleChecked,
  sendTx,
  configureFunctions,
  roleTableName,
  verifyWiring,
  configureMarketplace,
  publishedContracts,
  writeDeploymentFile,
  buildMetadata,
  minDeployBlock,
  makeLogger,
  configureSources,
  configurePriceSources,
  grantReporters,
  verifyOracleState,
  TEST_ONLY_PRICE_SOURCES,
  readTokenConfig,
  deployTokenStack,
  wireTokenStack,
  verifyTokenStack,
} = require("../lib/deploy-core");
const { resolveExternalToken, externalSummary, assertConfigFitsSupply } = require("../lib/external-token");
const fs = require("node:fs");

/** hardhat (31337), Robinhood Chain testnet, Sepolia, Mumbai, Amoy. Everything else is refused. */
const TESTNET_CHAIN_IDS = new Set([31337n, 46630n, 11155111n, 80001n, 80002n]);
const USDC_DECIMALS = 6;
const TEST_USDC_PER_WALLET = 1_000_000n;
const TEST_DON_ID = "fun-testnet-mock";

/**
 * @param {object} opts
 * @param {import("hardhat/types").HardhatRuntimeEnvironment} opts.hre
 * @param {string} [opts.outDir] where deployments/<network>.json is written (default: ../../deployments)
 * @param {NodeJS.ProcessEnv} [opts.env] defaults to process.env
 * @param {boolean} [opts.quiet] suppress progress output
 * @param {number} [opts.confirmations] block confirmations to wait per tx (default 1)
 */
async function deployAll({ hre, outDir = DEPLOYMENTS_DIR, env = process.env, quiet = false, confirmations = 1 }) {
  const { ethers } = hre;
  const log = makeLogger(quiet);
  const network = hre.network.name;
  const chainId = (await ethers.provider.getNetwork()).chainId;

  if (!TESTNET_CHAIN_IDS.has(chainId)) {
    throw new Error(
      `10_deploy_all.js deploys MOCKS and is testnet-only; chain ${chainId} (${network}) is not allowed. ` +
        "Use scripts/deploy/20_deploy_mainnet.js for Robinhood Chain mainnet.",
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer available: set PRIVATE_KEY in .env");
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  log(`Network ${network} (chain ${chainId}); deployer ${deployerAddress}; balance ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) throw new Error("Deployer has no gas funds");

  const donId = parseDonId(ethers, env.DON_ID || TEST_DON_ID);
  const subscriptionId = env.SUBSCRIPTION_ID ? parseSubscriptionId(env.SUBSCRIPTION_ID) : 1n;
  const kycGateEnabled = /^(1|true|yes|on)$/i.test(env.KYC_GATE ?? "");
  // Validate the CARB parameters up front: a bad value must fail before a single transaction is sent.
  // CARB_TOKEN_ADDRESS = external (launchpad) token: attached instead of deploying CarbToken. It is read and
  // CONFIRM_TOKEN=<symbol>-checked first; its decimals scale the thresholds. Unset = the usual CarbToken.
  const external = await resolveExternalToken({ ethers, env, log, requireConfirm: true });
  const tokenCfg = readTokenConfig(ethers, env, {
    timelockDelayFloor: 2 * 24 * 60 * 60,
    bondRequiredDefault: true,
    decimals: external?.decimals ?? 18,
  });
  if (external) {
    tokenCfg.external = external;
    assertConfigFitsSupply(tokenCfg, external);
  }
  const mintRecipients = [deployerAddress, ...parseAddressList(ethers, env.USDC_MINT_TO, "USDC_MINT_TO")];

  const store = openState({ dir: outDir, network, chainId: Number(chainId), deployer: deployerAddress, log });
  const run = (key, factoryName, args) => deployOnce({ hre, store, key, factoryName, args, confirmations, log });

  log("[mocks] test USDC + Functions router");
  const usdcDeploy = await run("USDC", "MockERC20", ["USD Coin", "USDC", USDC_DECIMALS]);
  const routerDeploy = await run("FunctionsRouter", "MockFunctionsRouter", []);
  const usdc = usdcDeploy.contract;
  if (Number(await usdc.decimals()) !== USDC_DECIMALS) throw new Error("Mock USDC must have 6 decimals");

  const { contracts, info } = await deployProtocol({
    hre,
    store,
    paymentToken: usdcDeploy.address,
    functionsRouter: routerDeploy.address,
    adminForRegistry: deployerAddress,
    log,
    confirmations,
  });

  log("[config] Functions config, sources, roles, marketplace parameters");
  await configureFunctions({ contracts, donId, subscriptionId, gasLimit: DEFAULTS.functionsGasLimit, log });
  // Reference JavaScript for the three consumers (what the DON would run), and TEST-ONLY data source URLs.
  await configureSources({ contracts, log });
  await configurePriceSources({ oracle: contracts.CarbonPriceOracle, urls: TEST_ONLY_PRICE_SOURCES, log });
  // Testnet only: the deployer may call CarbonPriceOracle.reportPrice (the mock router never answers).
  await grantReporters({ oracle: contracts.CarbonPriceOracle, reporters: [deployerAddress], log });

  // Issuance: only NATIVE_ISSUER_ROLE can mint credits. The EmissionVerifier is the production issuer; on a
  // testnet the deployer also gets the role so the pipeline can be exercised end to end.
  const nft = contracts.CarbonCreditNFT;
  await grantRoleChecked(nft, "CarbonCreditNFT", "NATIVE_ISSUER_ROLE", info.EmissionVerifier.address, log);
  await grantRoleChecked(nft, "CarbonCreditNFT", "NATIVE_ISSUER_ROLE", deployerAddress, log);

  // The marketplace constructor already grants KYC_ROLE / FEE_MANAGER_ROLE to the deployer; assert it.
  const market = contracts.CarbonMarketplace;
  await grantRoleChecked(market, "CarbonMarketplace", "KYC_ROLE", deployerAddress, log);
  await grantRoleChecked(market, "CarbonMarketplace", "FEE_MANAGER_ROLE", deployerAddress, log);
  await configureMarketplace({
    market,
    tradingFeeBps: DEFAULTS.tradingFeeBps,
    minPricePerTonne: ethers.parseUnits("0.01", USDC_DECIMALS),
    kycGateEnabled,
    log,
  });

  const mintAmount = ethers.parseUnits(TEST_USDC_PER_WALLET.toString(), USDC_DECIMALS);
  for (const to of mintRecipients) {
    if ((await usdc.balanceOf(to)) < mintAmount) {
      await sendTx(`MockUSDC.mint(${to}, ${TEST_USDC_PER_WALLET})`, () => usdc.mint(to, mintAmount), log, confirmations);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // CARB utility stack. Testnet: the deployer is the treasury (receives the whole supply) and keeps every role.
  // ---------------------------------------------------------------------------------------------
  log("[token] CARB stack");
  const tokenDeploy = await deployTokenStack({
    hre,
    store,
    deployerAddress,
    recipient: deployerAddress,
    nft: info.CarbonCreditNFT.address,
    market: info.CarbonMarketplace.address,
    cfg: tokenCfg,
    log,
    confirmations,
  });
  const tokens = tokenDeploy.contracts;
  const wired = await wireTokenStack({ ethers, contracts, tokens, cfg: tokenCfg, deployerSigner: deployer, links: true, log });
  await verifyTokenStack({
    ethers,
    contracts,
    tokens,
    cfg: tokenCfg,
    recipient: deployerAddress,
    deployerAddress,
    plan: wired.plan,
    requireLinks: true,
  });
  await verifyOracleState({
    contracts,
    enabled: true,
    donId,
    subscriptionId,
    gasLimit: DEFAULTS.functionsGasLimit,
  });
  for (const key of ["CarbStaking", "IssuerBond"]) {
    for (const roleName of CONSTRUCTOR_ROLES[key]) {
      const role = roleName === "DEFAULT_ADMIN_ROLE" ? `0x${"00".repeat(32)}` : await tokens[key][roleName]();
      if (!(await tokens[key].hasRole(role, deployerAddress))) throw new Error(`${key}: deployer lacks ${roleName}`);
    }
  }

  log("[verify] read-back checks");
  await verifyWiring({
    contracts,
    info,
    paymentToken: usdcDeploy.address,
    paymentDecimals: USDC_DECIMALS,
    functionsRouter: routerDeploy.address,
  });
  for (const [key, c] of Object.entries(contracts)) {
    const table = CONSTRUCTOR_ROLES[roleTableName(key)];
    for (const roleName of table) {
      const role = roleName === "DEFAULT_ADMIN_ROLE" ? `0x${"00".repeat(32)}` : await c[roleName]();
      if (!(await c.hasRole(role, deployerAddress))) throw new Error(`${key}: deployer lacks ${roleName}`);
    }
  }
  for (const key of Object.keys(contracts)) {
    if (PAUSABLE.includes(roleTableName(key)) && (await contracts[key].paused())) throw new Error(`${key} is paused`);
  }

  const allInfo = { ...info, ...tokenDeploy.info, USDC: usdcDeploy, FunctionsRouter: routerDeploy };
  const deployBlock = minDeployBlock(allInfo);
  const latest = await ethers.provider.getBlockNumber();

  const deployment = {
    schemaVersion: 2,
    ...(external ? { externalToken: true } : {}),
    network,
    chainId: Number(chainId),
    isTestnet: true,
    usesMocks: true,
    deployer: deployerAddress,
    admin: deployerAddress,
    timestamp: new Date().toISOString(),
    deployBlock,
    lastKnownBlock: latest,
    decimals: { payment: USDC_DECIMALS, carbon: 18 },
    paymentToken: { address: usdcDeploy.address, symbol: "USDC", decimals: USDC_DECIMALS, isMock: true },
    contracts: publishedContracts({
      info,
      paymentTokenAddress: usdcDeploy.address,
      routerAddress: routerDeploy.address,
      tokenInfo: tokenDeploy.info,
      externalToken: external,
    }),
    deployBlocks: Object.fromEntries(Object.entries(allInfo).map(([k, v]) => [k, v.block])),
    constructorArgs: Object.fromEntries(Object.entries(allInfo).map(([k, v]) => [k, v.constructorArgs])),
    functions: {
      router: routerDeploy.address,
      routerIsMock: true,
      donId,
      subscriptionId: subscriptionId.toString(),
      gasLimit: DEFAULTS.functionsGasLimit,
    },
    config: {
      tradingFeeBps: DEFAULTS.tradingFeeBps,
      minPricePerTonne: (await market.minPricePerTonne()).toString(),
      kycGateEnabled,
      oracle: {
        enabled: true,
        note: "TESTNET ONLY: mock router; price sources are https://example.invalid placeholders; the deployer holds ORACLE_REPORTER_ROLE.",
        priceSources: TEST_ONLY_PRICE_SOURCES,
      },
      token: {
        treasury: external ? null : deployerAddress,
        decimals: tokenCfg.decimals,
        ...(external ? { external: externalSummary(external) } : {}),
        stage: tokenCfg.stage,
        timelockMinDelay: tokenCfg.timelock.minDelay,
        governance: Object.fromEntries(Object.entries(tokenCfg.governance).map(([k, v]) => [k, v.toString()])),
        staking: {
          warmup: tokenCfg.staking.warmup,
          cooldown: tokenCfg.staking.cooldown,
          thresholds: tokenCfg.staking.thresholds.map(String),
          discountsBps: tokenCfg.staking.discountsBps,
        },
        bond: {
          minBond: tokenCfg.bond.minBond.toString(),
          unbondDelay: tokenCfg.bond.unbondDelay,
          disputeWindow: tokenCfg.bond.disputeWindow,
          bondRequired: tokenCfg.bond.bondRequired,
          slashTreasury: tokenCfg.bond.slashTreasury,
        },
      },
    },
    roles: {
      note: "Testnet: the deployer holds every admin/operational role, NATIVE_ISSUER_ROLE, ORACLE_REPORTER_ROLE and the whole CARB supply. The EmissionVerifier holds NATIVE_ISSUER_ROLE; IssuerBond holds ISSUER_ADMIN_ROLE.",
      holder: deployerAddress,
      issuers: [info.EmissionVerifier.address, deployerAddress],
    },
    build: buildMetadata(hre),
  };

  const written = writeDeploymentFile({ dir: outDir, network, data: deployment });
  fs.rmSync(store.file, { force: true });
  log(`\nDeployment complete. Wrote ${written.target}${written.previous ? ` (previous kept at ${written.previous})` : ""}`);
  log(`Pools: ${POOLS.map((p) => p.symbol).join(", ")}; deployBlock ${deployBlock}`);
  return {
    deployment,
    contracts: { ...contracts, USDC: usdc, FunctionsRouter: routerDeploy.contract },
    tokens,
    deployer,
    file: written.target,
  };
}

module.exports = { deployAll, TESTNET_CHAIN_IDS, USDC_DECIMALS };

if (require.main === module) {
  deployAll({ hre: require("hardhat") })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
