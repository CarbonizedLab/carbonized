"use strict";
// GovernanceSetup: deploys CarbTimelock + CarbGovernor and describes / applies / verifies which roles the
// timelock receives and which roles the multisig keeps. No network access of its own: every helper receives the
// ethers instance (hre.ethers) and signers/contracts from the caller, like scripts/lib/deploy-core.js.
//
// Boundary (see contracts/docs/TOKEN.md): governance gets PARAMETER-grade and SLASHER permissions only. It never
// receives issuance (NFT NATIVE_ISSUER_ROLE / ISSUER_ADMIN_ROLE), pause, KYC, fee-withdrawal, user-escrow or any
// DEFAULT_ADMIN_ROLE power in stages 0-2.

const DAY = 24 * 60 * 60;
const E18 = 10n ** 18n;
const DEFAULT_ADMIN_ROLE = `0x${"00".repeat(32)}`;

/** Sane defaults (seconds; the token clock is the block timestamp). All are bounded again onchain. */
const DEFAULT_GOVERNANCE_PARAMS = {
  timelockDelay: 2 * DAY,
  votingDelay: 1 * DAY,
  votingPeriod: 5 * DAY,
  proposalThreshold: 1_000_000n * E18, // owner parameter: 0.1% of a 1e9 supply
  quorumPercent: 4,
};

/**
 * Staged decentralisation (the plan documented in TOKEN.md).
 *  0 bootstrap : multisig holds every role (incl. PARAMETER_ROLE / SLASHER_ROLE). Governance contracts may be
 *                deployed but hold nothing.
 *  1 dual      : timelock ALSO receives the plan's PARAMETER/SLASHER roles; multisig keeps its copies (can veto by
 *                revoking, and keeps pause/KYC/fees/issuer admin).
 *  2 governed  : multisig revokes its own PARAMETER_ROLE / SLASHER_ROLE copies. It still holds DEFAULT_ADMIN_ROLE
 *                everywhere (guardian: can re-grant / revoke) plus pause, KYC, fee withdrawal, issuer admin.
 *  3 optional  : the owner may, with legal advice, move more roles to the timelock. NEVER issuance or escrow.
 */
const STAGES = ["bootstrap", "dual", "governed", "optional"];

async function roleId(contract, roleName) {
  return roleName === "DEFAULT_ADMIN_ROLE" ? DEFAULT_ADMIN_ROLE : contract[roleName]();
}

/**
 * Deploys the timelock and governor and wires them: governor = PROPOSER + CANCELLER (+ EXECUTOR unless
 * `openExecutor`, which grants EXECUTOR to address(0) so anyone can execute a queued proposal). The deployer's
 * temporary TIMELOCK_ADMIN_ROLE is renounced, leaving the timelock self-administered.
 */
async function deployGovernance(ethers, { token, deployer, targets, params = {}, openExecutor = true }) {
  const p = { ...DEFAULT_GOVERNANCE_PARAMS, ...params };
  const tokenAddress = await token.getAddress();

  const timelock = await (
    await ethers.getContractFactory("CarbTimelock", deployer)
  ).deploy(p.timelockDelay, [], [], deployer.address);
  await timelock.waitForDeployment();

  const targetAddresses = await Promise.all(targets.map((t) => t.getAddress()));
  const governor = await (
    await ethers.getContractFactory("CarbGovernor", deployer)
  ).deploy(
    tokenAddress,
    await timelock.getAddress(),
    p.votingDelay,
    p.votingPeriod,
    p.proposalThreshold,
    p.quorumPercent,
    targetAddresses
  );
  await governor.waitForDeployment();

  const governorAddress = await governor.getAddress();
  await (await timelock.grantRole(await timelock.PROPOSER_ROLE(), governorAddress)).wait();
  await (await timelock.grantRole(await timelock.CANCELLER_ROLE(), governorAddress)).wait();
  await (
    await timelock.grantRole(
      await timelock.EXECUTOR_ROLE(),
      openExecutor ? ethers.ZeroAddress : governorAddress
    )
  ).wait();
  await (await timelock.renounceRole(await timelock.TIMELOCK_ADMIN_ROLE(), deployer.address)).wait();

  return { timelock, governor, params: p };
}

/**
 * Pure description of the role split. `contracts` = { market, staking, bond, nft, token721? }.
 * Returns { grantToTimelock, keptByMultisig, forbiddenForTimelock } as arrays of
 * { contract, name, role, why }.
 */
function governanceRolePlan({ market, staking, bond, nft }) {
  const entry = (contract, name, role, why) => ({ contract, name, role, why });
  return {
    // Granted to the timelock at stage 1 (PARAMETER-grade + slashing only)
    grantToTimelock: [
      entry(market, "CarbonMarketplace", "PARAMETER_ROLE", "fee bps (<=1%), min price, KYC gate, fee-discount provider"),
      entry(staking, "CarbStaking", "PARAMETER_ROLE", "tier thresholds and tier discounts (hard-bounded)"),
      entry(bond, "IssuerBond", "PARAMETER_ROLE", "minimum bond, bond path switch, slash treasury"),
      entry(bond, "IssuerBond", "SLASHER_ROLE", "propose / cancel / confirm slashes of bonded issuers"),
    ],
    // Stay with the multisig throughout stages 0-2
    keptByMultisig: [
      entry(nft, "CarbonCreditNFT", "DEFAULT_ADMIN_ROLE", "guardian: role management"),
      entry(nft, "CarbonCreditNFT", "ISSUER_ADMIN_ROLE", "trusted-issuer grants (and the IssuerBond contract also holds it)"),
      entry(nft, "CarbonCreditNFT", "PAUSER_ROLE", "emergency pause"),
      entry(market, "CarbonMarketplace", "DEFAULT_ADMIN_ROLE", "guardian: role management"),
      entry(market, "CarbonMarketplace", "PAUSER_ROLE", "emergency pause"),
      entry(market, "CarbonMarketplace", "KYC_ROLE", "compliance (KYC status)"),
      entry(market, "CarbonMarketplace", "FEE_MANAGER_ROLE", "fee withdrawal to the treasury"),
      entry(staking, "CarbStaking", "DEFAULT_ADMIN_ROLE", "guardian: role management"),
      entry(bond, "IssuerBond", "DEFAULT_ADMIN_ROLE", "guardian: role management, issuer block-list"),
    ],
    // The timelock must NEVER hold these (asserted by assertGovernanceBoundaries)
    forbiddenForTimelock: [
      entry(nft, "CarbonCreditNFT", "DEFAULT_ADMIN_ROLE", "credit issuance / role control"),
      entry(nft, "CarbonCreditNFT", "ISSUER_ADMIN_ROLE", "credit issuance control"),
      entry(nft, "CarbonCreditNFT", "NATIVE_ISSUER_ROLE", "credit issuance"),
      entry(nft, "CarbonCreditNFT", "PAUSER_ROLE", "emergency pause stays with the multisig"),
      entry(nft, "CarbonCreditNFT", "ORACLE_ROLE", "oracle writes"),
      entry(nft, "CarbonCreditNFT", "VERIFIER_ROLE", "verification"),
      entry(market, "CarbonMarketplace", "DEFAULT_ADMIN_ROLE", "role management"),
      entry(market, "CarbonMarketplace", "KYC_ROLE", "compliance"),
      entry(market, "CarbonMarketplace", "FEE_MANAGER_ROLE", "fee withdrawal"),
      entry(market, "CarbonMarketplace", "PAUSER_ROLE", "emergency pause"),
      entry(staking, "CarbStaking", "DEFAULT_ADMIN_ROLE", "role management"),
      entry(bond, "IssuerBond", "DEFAULT_ADMIN_ROLE", "role management / block-list"),
    ],
  };
}

/** Stage 1: grant the timelock its roles. `admin` must hold DEFAULT_ADMIN_ROLE on market / staking / bond. */
async function applyGovernanceSetup(plan, timelockAddress, admin) {
  for (const { contract, role } of plan.grantToTimelock) {
    const id = await roleId(contract, role);
    if (!(await contract.hasRole(id, timelockAddress))) {
      await (await contract.connect(admin).grantRole(id, timelockAddress)).wait();
    }
  }
}

/** Stage 2: the multisig drops its own PARAMETER_ROLE / SLASHER_ROLE copies (keeps DEFAULT_ADMIN_ROLE). */
async function handOverToGovernance(plan, multisigSigner) {
  for (const { contract, role } of plan.grantToTimelock) {
    const id = await roleId(contract, role);
    if (await contract.hasRole(id, multisigSigner.address)) {
      await (await contract.connect(multisigSigner).renounceRole(id, multisigSigner.address)).wait();
    }
  }
}

/** Throws if the timelock holds any role it must never hold; returns the list of verified roles. */
async function assertGovernanceBoundaries(plan, timelockAddress) {
  const checked = [];
  for (const { contract, name, role } of plan.forbiddenForTimelock) {
    const id = await roleId(contract, role);
    if (await contract.hasRole(id, timelockAddress)) {
      throw new Error(`timelock must not hold ${name}.${role}`);
    }
    checked.push(`${name}.${role}`);
  }
  return checked;
}

module.exports = {
  DEFAULT_GOVERNANCE_PARAMS,
  STAGES,
  deployGovernance,
  governanceRolePlan,
  applyGovernanceSetup,
  handOverToGovernance,
  assertGovernanceBoundaries,
};
