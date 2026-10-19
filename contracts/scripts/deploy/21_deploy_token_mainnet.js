// Robinhood Chain MAINNET: deploy the CARB utility stack AFTER the protocol (20_deploy_mainnet.js with DEPLOY_TOKEN=no).
//
//   npx hardhat run scripts/deploy/21_deploy_token_mainnet.js --network robinhoodMainnet            # dry run
//   CONFIRM_MAINNET=yes npx hardhat run scripts/deploy/21_deploy_token_mainnet.js --network robinhoodMainnet
//
// INTERNAL REVIEW ONLY: get a professional audit and legal advice before the token exists on chain.
//
// Reads deployments/robinhoodMainnet.json (written by 20_deploy_mainnet.js), deploys CarbToken (the whole fixed
// supply goes to TREASURY_MULTISIG), CarbStaking, IssuerBond, CarbTimelock and CarbGovernor, wires the timelock
// and hands staking / bond over to the multisig recorded in the deployment file (`admin`). The deployer holds NO role
// on the marketplace any more, so two steps are MULTISIG transactions. The script prints their calldata and
// writes deployments/robinhoodMainnet.token-multisig-txs.json:
//   1. CarbonMarketplace.setFeeDiscountProvider(CarbStaking)
//   2. CarbonMarketplace.grantRole(PARAMETER_ROLE, CarbTimelock)         (GOVERNANCE_STAGE=dual only)
//
// BRING YOUR OWN TOKEN (CARB_TOKEN_ADDRESS): when set, CarbToken is NOT deployed; the script attaches the token that
// already exists at that address (e.g. launched through a launchpad):
//   - the address must have code; symbol / name / decimals / totalSupply are read and printed (run
//     22_attach_token_check.js first for the full go / no-go table);
//   - CONFIRM_TOKEN=<symbol> is REQUIRED to broadcast (a typo'd address can never be deployed against by accident);
//   - staking thresholds, minimum bond and proposal threshold default to the usual WHOLE-token amounts scaled by the
//     token's decimals; the *_CARB env overrides are whole tokens too, bound-checked against the onchain bounds and
//     the token's supply;
//   - governance: CarbGovernor is wired to the token itself if it is ERC-5805 votes with a TIMESTAMP clock,
//     otherwise to a freshly deployed CarbVotes (1:1 voting wrapper, vCARB). CARB_VOTES_MODE=auto|native|wrapper;
//   - deployments/robinhoodMainnet.json gets `externalToken: true`, contracts.CarbToken = the address and, when
//     needed, contracts.CarbVotes. TREASURY_MULTISIG is not used (there is no supply to receive).
//
// Re-running after a successful deployment (the token is in the deployment file) does not deploy anything: it
// re-verifies the whole stack from chain and lists the multisig transactions that are still open.
//
// Env: PRIVATE_KEY, TREASURY_MULTISIG (contract, receives the supply; own token only), CARB_TOKEN_ADDRESS /
// CONFIRM_TOKEN / CARB_VOTES_MODE (external token), and the same CARB variables as 20_deploy_mainnet.js
// (GOVERNANCE_STAGE, TIMELOCK_*, GOV_*, STAKING_*, BOND_*). CONFIRM_MAINNET=yes broadcasts.

const fs = require("node:fs");
const path = require("node:path");
const {
  DEPLOYMENTS_DIR,
  MAINNET_MIN_TIMELOCK_DELAY,
  EXTERNAL_ERC20_ABI,
  deployedTokenKeys,
  requireAddress,
  openState,
  deployTokenStack,
  wireTokenStack,
  protocolLinkActions,
  verifyTokenStack,
  assertDeployerHoldsNothing,
  handOverTable,
  readTokenConfig,
  writeDeploymentFile,
  buildMetadata,
  makeLogger,
  gasTally,
  resetGasTally,
} = require("../lib/deploy-core");
const { resolveExternalToken, externalSummary, externalFromSummary, assertConfigFitsSupply } = require("../lib/external-token");
const { DEPLOYMENT_NAME, preflightChain, requireMultisig } = require("./20_deploy_mainnet");
const { assertReleaseManifest } = require("./release-manifest");

const TOKEN_STATE_NAME = `${DEPLOYMENT_NAME}.token`;

const tokenSummaryOf = (cfg, treasury) => ({
  deployed: true,
  treasury,
  decimals: cfg.decimals,
  ...(cfg.external ? { external: externalSummary(cfg.external) } : {}),
  stage: cfg.stage,
  timelockMinDelay: cfg.timelock.minDelay,
  timelockExecutors: cfg.timelock.executors,
  timelockExtraProposers: cfg.timelock.extraProposers,
  governance: Object.fromEntries(Object.entries(cfg.governance).map(([k, v]) => [k, v.toString()])),
  staking: {
    warmup: cfg.staking.warmup,
    cooldown: cfg.staking.cooldown,
    thresholds: cfg.staking.thresholds.map(String),
    discountsBps: cfg.staking.discountsBps,
  },
  bond: {
    minBond: cfg.bond.minBond.toString(),
    unbondDelay: cfg.bond.unbondDelay,
    disputeWindow: cfg.bond.disputeWindow,
    bondRequired: cfg.bond.bondRequired,
    slashTreasury: cfg.bond.slashTreasury,
  },
});

/** Rebuilds the token-stack config of an existing deployment file (check mode). */
function cfgFromDeployment(ethers, deployment) {
  const t = deployment.config?.token;
  if (!t?.deployed) throw new Error("deployment file has no config.token; cannot re-verify");
  return {
    stage: t.stage,
    decimals: t.decimals ?? 18,
    external: t.external ? externalFromSummary(t.external) : null,
    staking: {
      warmup: t.staking.warmup,
      cooldown: t.staking.cooldown,
      thresholds: t.staking.thresholds.map(BigInt),
      discountsBps: t.staking.discountsBps,
    },
    bond: {
      minBond: BigInt(t.bond.minBond),
      unbondDelay: t.bond.unbondDelay,
      disputeWindow: t.bond.disputeWindow,
      bondRequired: t.bond.bondRequired,
      slashTreasury: t.bond.slashTreasury,
    },
    governance: {
      votingDelay: Number(t.governance.votingDelay),
      votingPeriod: Number(t.governance.votingPeriod),
      proposalThreshold: BigInt(t.governance.proposalThreshold),
      quorumPercent: Number(t.governance.quorumPercent),
    },
    timelock: { minDelay: t.timelockMinDelay, extraProposers: t.timelockExtraProposers, executors: t.timelockExecutors },
  };
}

function writeMultisigTxs({ dir, actions, multisig }) {
  const file = path.join(dir, `${DEPLOYMENT_NAME}.token-multisig-txs.json`);
  const body = {
    note: "Execute these from the admin multisig (Safe transaction builder: to / value / data). Re-run 21_deploy_token_mainnet.js to re-check.",
    from: multisig,
    transactions: actions.map((a) => ({ label: a.label, to: a.to, value: "0", data: a.data, done: a.done })),
  };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  return file;
}

async function deployTokenMainnet({ hre, outDir = DEPLOYMENTS_DIR, env = process.env, quiet = false, confirmations = 1 }) {
  const { ethers } = hre;
  const log = makeLogger(quiet);
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer available: set PRIVATE_KEY in .env");
  const deployerAddress = await deployer.getAddress();
  const { chainId, override } = await preflightChain({ hre, env });

  const file = path.join(outDir, `${DEPLOYMENT_NAME}.json`);
  if (!fs.existsSync(file)) throw new Error(`${file} not found: run 20_deploy_mainnet.js first`);
  const deployment = JSON.parse(fs.readFileSync(file, "utf8"));
  if (deployment.chainId !== Number(chainId) && env.ALLOW_CHAINID_OVERRIDE_HARDHAT !== "1") {
    throw new Error(`${file} is for chain ${deployment.chainId}, connected chain is ${chainId}`);
  }
  if (deployment.usesMocks) throw new Error(`${file} was deployed with mocks`);
  const multisig = requireAddress(ethers, deployment.admin, "deployment.admin");

  const nftAddress = deployment.contracts.CarbonCreditNFT;
  const marketAddress = deployment.contracts.CarbonMarketplace;
  const nft = await ethers.getContractAt("CarbonCreditNFT", nftAddress);
  const market = await ethers.getContractAt("CarbonMarketplace", marketAddress);
  const protocol = { CarbonCreditNFT: nft, CarbonMarketplace: market };

  // ---- check mode: the token is already in the deployment file ------------------------------------
  if (deployment.contracts.CarbToken) {
    log("Token stack already deployed: re-verifying from chain (nothing is sent).");
    const cfg = cfgFromDeployment(ethers, deployment);
    const requested = (env.CARB_TOKEN_ADDRESS ?? "").trim();
    if (requested && requested.toLowerCase() !== deployment.contracts.CarbToken.toLowerCase()) {
      throw new Error(`CARB_TOKEN_ADDRESS ${requested} differs from the token in the deployment file (${deployment.contracts.CarbToken})`);
    }
    const tokens = {};
    for (const key of deployedTokenKeys(cfg.external)) tokens[key] = await ethers.getContractAt(key, deployment.contracts[key]);
    if (cfg.external) tokens.CarbToken = await ethers.getContractAt(EXTERNAL_ERC20_ABI, deployment.contracts.CarbToken);
    const { governanceRolePlan } = require("../lib/governance-setup");
    const plan = governanceRolePlan({ market, staking: tokens.CarbStaking, bond: tokens.IssuerBond, nft });
    const { pending } = await verifyTokenStack({
      ethers,
      contracts: protocol,
      tokens,
      cfg,
      recipient: deployment.config.token.treasury,
      deployerAddress,
      plan,
      requireLinks: false,
    });
    const txFile = writeMultisigTxs({ dir: outDir, actions: await actionsOf({ protocol, tokens, cfg }), multisig });
    for (const p of pending) log(`  OPEN multisig transaction: ${p.label}\n    to ${p.to}\n    data ${p.data}`);
    log(pending.length ? `${pending.length} multisig transaction(s) still open; see ${txFile}` : "All multisig links are in place.");
    return { deployed: false, pending, file: txFile };
  }

  // ---- deploy mode -----------------------------------------------------------------------------------
  const confirm = env.CONFIRM_MAINNET === "yes";
  // External token: read + validated + (when broadcasting) confirmed by symbol BEFORE anything is sent.
  const external = await resolveExternalToken({ ethers, env, log, requireConfirm: confirm });
  let treasury = null;
  let treasuryIsContract = false;
  if (!external) {
    treasury = requireAddress(ethers, env.TREASURY_MULTISIG, "TREASURY_MULTISIG");
    treasuryIsContract = await requireMultisig({ hre, env, address: treasury, label: "TREASURY_MULTISIG", deployerAddress });
  }
  const cfg = readTokenConfig(ethers, env, {
    timelockDelayFloor: MAINNET_MIN_TIMELOCK_DELAY,
    bondRequiredDefault: false,
    decimals: external?.decimals ?? 18,
  });
  if (external) {
    cfg.external = external;
    assertConfigFitsSupply(cfg, external);
  }
  const balance = await ethers.provider.getBalance(deployerAddress);
  const fmt = (v) => ethers.formatUnits(v, cfg.decimals);

  log("\n==================== CARB TOKEN STACK: SUMMARY ====================");
  log("INTERNAL REVIEW ONLY. Get an audit and legal advice before the token exists on chain.");
  log(`  chain id            ${chainId}`);
  log(`  deployer            ${deployerAddress} (${ethers.formatEther(balance)} ETH)`);
  log(`  admin multisig      ${multisig} (from ${DEPLOYMENT_NAME}.json)`);
  if (external) {
    log(`  CARB                EXTERNAL ${external.symbol} (${external.name}) ${external.address}`);
    log(`  decimals / supply   ${external.decimals} / ${fmt(external.totalSupply)} ${external.symbol}`);
    log(`  burn on slash       ${external.hasBurn ? "token has burn(uint256): slashed bonds are burned" : "no burn(): slashed bonds go to the slash sink (0x...dEaD)"}`);
    log(`  governance votes    ${external.votes === "native" ? "the token itself (ERC-5805, timestamp clock)" : "CarbVotes wrapper (vCARB) will be deployed"}`);
    log(`  tiers / min bond    ${cfg.staking.thresholds.map(fmt).join(" / ")} / ${fmt(cfg.bond.minBond)} ${external.symbol}`);
    log(`  proposal threshold  ${fmt(cfg.governance.proposalThreshold)} ${external.symbol}`);
  } else {
    log(`  CARB recipient      ${treasury}${treasuryIsContract ? "" : "  (NO CODE, test override)"}`);
  }
  log(`  stage               ${cfg.stage}; timelock delay ${cfg.timelock.minDelay} s; quorum ${cfg.governance.quorumPercent} %`);
  log(`  bond path           ${cfg.bond.bondRequired ? "OPEN" : "CLOSED (bondRequired=false)"}`);
  log(confirm ? "  CONFIRM_MAINNET=yes -> BROADCASTING." : "  DRY RUN: nothing was sent. Re-run with CONFIRM_MAINNET=yes to broadcast.");
  log("====================================================================\n");
  if (!confirm) return { dryRun: true, summary: { chainId: Number(chainId), deployer: deployerAddress, treasury, external, cfg } };
  if (!override) assertReleaseManifest({ env });
  if (balance === 0n) throw new Error("Deployer has no gas funds");

  resetGasTally();
  const store = openState({ dir: outDir, network: TOKEN_STATE_NAME, chainId: Number(chainId), deployer: deployerAddress, log });
  const deployed = await deployTokenStack({
    hre,
    store,
    deployerAddress,
    recipient: treasury,
    nft: nftAddress,
    market: marketAddress,
    cfg,
    log,
    confirmations,
  });
  const tokens = deployed.contracts;

  // Deployer-side wiring (it administers staking / bond / timelock only); NFT + marketplace links are multisig steps.
  const { plan } = await wireTokenStack({ ethers, contracts: protocol, tokens, cfg, deployerSigner: deployer, links: false, log });
  const roleContracts = { CarbStaking: tokens.CarbStaking, IssuerBond: tokens.IssuerBond };
  log("[handover] staking / bond roles -> multisig, deployer renounces");
  await handOverTable({ contracts: roleContracts, deployerAddress, multisig, log });

  const { pending } = await verifyTokenStack({
    ethers,
    contracts: protocol,
    tokens,
    cfg,
    recipient: treasury,
    deployerAddress,
    plan,
    requireLinks: false,
  });
  await assertDeployerHoldsNothing({ roleContracts, timelock: tokens.CarbTimelock, deployerAddress });
  log("  ok  token stack verified from chain; deployer holds NO role on staking, bond or timelock");

  const keys = deployedTokenKeys(external);
  const next = {
    ...deployment,
    ...(external ? { externalToken: true } : {}),
    timestamp: new Date().toISOString(),
    lastKnownBlock: await ethers.provider.getBlockNumber(),
    contracts: {
      ...deployment.contracts,
      ...(external ? { CarbToken: external.address } : {}),
      ...Object.fromEntries(keys.map((k) => [k, deployed.info[k].address])),
    },
    deployBlocks: { ...deployment.deployBlocks, ...Object.fromEntries(keys.map((k) => [k, deployed.info[k].block])) },
    constructorArgs: { ...deployment.constructorArgs, ...Object.fromEntries(keys.map((k) => [k, deployed.info[k].constructorArgs])) },
    config: { ...deployment.config, token: tokenSummaryOf(cfg, treasury) },
    tokenGas: { total: gasTally.gas.toString(), transactions: gasTally.txs },
    build: buildMetadata(hre),
  };
  const written = writeDeploymentFile({ dir: outDir, network: DEPLOYMENT_NAME, data: next });
  fs.rmSync(store.file, { force: true });
  const txFile = writeMultisigTxs({ dir: outDir, actions: pending, multisig });

  log(`\nToken stack deployed. Wrote ${written.target} (previous kept at ${written.previous}).`);
  log(`Gas used by the deployer: ${gasTally.gas} in ${gasTally.txs} transactions`);
  log(`Open MULTISIG transactions (${pending.length}), also in ${txFile}:`);
  for (const p of pending) log(`  - ${p.label}\n      to   ${p.to}\n      data ${p.data}`);
  log("After the multisig executed them, re-run this script (no CONFIRM needed) to verify the links.");
  return { deployed: true, deployment: next, tokens, pending, file: written.target };
}

/** All three multisig actions with their current `done` flags (check mode). */
async function actionsOf({ protocol, tokens, cfg }) {
  return protocolLinkActions({
    nft: protocol.CarbonCreditNFT,
    market: protocol.CarbonMarketplace,
    bond: tokens.IssuerBond,
    staking: tokens.CarbStaking,
    timelock: tokens.CarbTimelock,
    stage: cfg.stage,
  });
}

module.exports = { deployTokenMainnet, cfgFromDeployment };

if (require.main === module) {
  deployTokenMainnet({ hre: require("hardhat") })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
