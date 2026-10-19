"use strict";
// Read-only inspection of a CARB token that Carbonized did NOT deploy (e.g. launched through a third-party launchpad on
// Robinhood Chain). Used by 22_attach_token_check.js (diagnostic) and by the deploy scripts (10 / 20 / 21) when
// CARB_TOKEN_ADDRESS is set. Nothing in here sends a transaction.
//
// What can and cannot be checked off-chain:
//  - CAN: code present, ERC-20 reads, decimals, supply, optional burn(uint256), ERC-5805 votes + timestamp clock,
//         bytecode heuristics for tax / blacklist / mint / rebase selectors.
//  - CANNOT: whether a transfer is taxed. `eth_call` returns return data, never balance deltas, and the check needs
//         a funded holder anyway. The contracts therefore enforce it ON-CHAIN: CarbStaking.stake, IssuerBond.bond
//         and CarbVotes.depositFor revert with "Received amount differs (fee-on-transfer unsupported)" unless
//         exactly the requested amount arrived (balance before / after). Test with a small amount first.
//  - CANNOT: rebasing (balances moving without transfers) or an owner who can switch behaviour later. Review the
//         token's source / launchpad terms; see contracts/docs/TOKEN.md.

const { requireAddress, EXTERNAL_ERC20_ABI, MAX_TOKEN_DECIMALS, ZERO_ADDRESS } = require("./deploy-core");

const UINT128_MAX = (1n << 128n) - 1n;
const UINT224_MAX = (1n << 224n) - 1n;
const DAY_SECONDS = 86_400;
const PROBE_FROM = "0x000000000000000000000000000000000000dEaD";
const VOTES_MODES = ["auto", "native", "wrapper"];

const VOTES_ABI = [
  "function clock() view returns (uint48)",
  "function CLOCK_MODE() view returns (string)",
  "function getVotes(address) view returns (uint256)",
  "function getPastTotalSupply(uint256) view returns (uint256)",
  "function delegates(address) view returns (address)",
];
const OPTIONAL_ABI = ["function owner() view returns (address)", "function paused() view returns (bool)", "function burn(uint256)"];

/** Function signatures whose presence in the bytecode deserves a manual review (heuristic, NOT proof). */
const RISK_SIGNATURES = {
  "transfer tax / fee": [
    "taxFee()", "_taxFee()", "buyFee()", "sellFee()", "transferFee()", "feeBps()", "setFee(uint256)", "setFees(uint256,uint256)",
    "setTaxFee(uint256)", "setBuyFee(uint256)", "setSellFee(uint256)", "excludeFromFee(address)", "excludeFromFee(address,bool)",
    "isExcludedFromFee(address)", "setTaxes(uint256,uint256)",
  ],
  "blacklist / trading gate": [
    "blacklist(address)", "addBlacklist(address)", "setBlacklist(address,bool)", "isBlacklisted(address)", "blacklisted(address)",
    "tradingEnabled()", "enableTrading()", "setTradingEnabled(bool)", "setMaxTxAmount(uint256)", "maxTxAmount()",
  ],
  "owner can mint": ["mint(address,uint256)", "mint(uint256)", "mintTo(address,uint256)"],
  "rebasing / reflection": ["rebase(uint256)", "scaledBalanceOf(address)", "gonsPerFragment()", "tokenFromReflection(uint256)", "reflect(uint256)"],
};

async function attempt(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: error.shortMessage ?? error.message };
  }
}

/**
 * Collects facts about `address`. Never throws for a misbehaving token: every failed read is recorded.
 * @returns {Promise<object>} report consumed by `evaluateToken` / `printTokenReport`.
 */
async function inspectToken({ ethers, address }) {
  const provider = ethers.provider;
  const code = await provider.getCode(address);
  const report = { address, hasCode: code !== "0x", codeSize: Math.max(0, (code.length - 2) / 2), chainId: Number((await provider.getNetwork()).chainId) };
  if (!report.hasCode) return { ...report, erc20: false };

  const token = new ethers.Contract(address, [...EXTERNAL_ERC20_ABI, ...VOTES_ABI, ...OPTIONAL_ABI], provider);
  const [name, symbol, decimals, totalSupply, balanceOf] = await Promise.all([
    attempt(() => token.name()),
    attempt(() => token.symbol()),
    attempt(() => token.decimals()),
    attempt(() => token.totalSupply()),
    attempt(() => token.balanceOf(PROBE_FROM)),
  ]);
  Object.assign(report, {
    name: name.ok ? name.value : null,
    symbol: symbol.ok && symbol.value ? symbol.value : null,
    decimals: decimals.ok ? Number(decimals.value) : null,
    totalSupply: totalSupply.ok ? totalSupply.value : null,
    erc20: decimals.ok && totalSupply.ok && balanceOf.ok,
    erc20Errors: Object.fromEntries(
      Object.entries({ name, symbol, decimals, totalSupply, balanceOf })
        .filter(([, r]) => !r.ok)
        .map(([k, r]) => [k, r.error]),
    ),
  });

  // burn(uint256): selector in the bytecode, or an eth_call of burn(0) that does not revert.
  const hasSelector = (signature) => code.toLowerCase().includes(ethers.id(signature).slice(2, 10));
  const burnCall = await attempt(() =>
    provider.call({ to: address, from: PROBE_FROM, data: token.interface.encodeFunctionData("burn", [0n]) }),
  );
  report.burn = { selectorInCode: hasSelector("burn(uint256)"), callOk: burnCall.ok };
  report.burn.likely = report.burn.selectorInCode || report.burn.callOk;

  // ERC-5805 votes with a TIMESTAMP clock (the governor's durations are seconds).
  const [clockMode, clock, votes, delegates] = await Promise.all([
    attempt(() => token.CLOCK_MODE()),
    attempt(() => token.clock()),
    attempt(() => token.getVotes(ZERO_ADDRESS)),
    attempt(() => token.delegates(ZERO_ADDRESS)),
  ]);
  const block = await provider.getBlock("latest");
  let pastSupplyOk = false;
  if (clock.ok && BigInt(clock.value) > 0n) {
    pastSupplyOk = (await attempt(() => token.getPastTotalSupply(BigInt(clock.value) - 1n))).ok;
  }
  const clockNear = clock.ok && Math.abs(Number(clock.value) - block.timestamp) <= DAY_SECONDS;
  report.votes = {
    getVotes: votes.ok,
    delegates: delegates.ok,
    clockMode: clockMode.ok ? clockMode.value : null,
    clock: clock.ok ? Number(clock.value) : null,
    pastSupplyOk,
    timestampClock: clockMode.ok && clockMode.value === "mode=timestamp" && clockNear,
  };
  report.votes.partial = (votes.ok || delegates.ok) && !(report.votes.timestampClock && pastSupplyOk && votes.ok && delegates.ok);
  report.votes.native = report.votes.timestampClock && pastSupplyOk && votes.ok && delegates.ok;

  const owner = await attempt(() => token.owner());
  const paused = await attempt(() => token.paused());
  report.owner = owner.ok ? owner.value : null;
  report.ownerRenounced = owner.ok && owner.value === ZERO_ADDRESS;
  report.paused = paused.ok ? paused.value : null;
  report.riskFlags = Object.entries(RISK_SIGNATURES)
    .map(([kind, signatures]) => [kind, signatures.filter(hasSelector)])
    .filter(([, found]) => found.length > 0)
    .map(([kind, found]) => ({ kind, signatures: found }));
  return report;
}

/**
 * Go / no-go rows: `[check, status, detail]`, status in OK | WARN | FAIL | INFO. `go` = no FAIL.
 * `votesMode` is what the deploy flow would do ("native" | "wrapper").
 */
function evaluateToken(report, { votesMode = "auto" } = {}) {
  const rows = [];
  const add = (check, status, detail) => rows.push({ check, status, detail });

  add("contract code", report.hasCode ? "OK" : "FAIL", report.hasCode ? `${report.codeSize} bytes` : "no code at this address on this chain");
  if (!report.hasCode) return { go: false, rows, votesMode: null };

  const missing = Object.keys(report.erc20Errors ?? {});
  const fatal = missing.filter((k) => ["decimals", "totalSupply", "balanceOf"].includes(k));
  add(
    "ERC-20 interface",
    fatal.length ? "FAIL" : missing.length ? "WARN" : "OK",
    fatal.length ? `reverts / missing: ${fatal.join(", ")}` : missing.length ? `optional reads missing: ${missing.join(", ")}` : "name, symbol, decimals, totalSupply, balanceOf",
  );
  if (report.symbol) add("symbol / name", "INFO", `${report.symbol} / ${report.name ?? "?"}`);

  if (report.decimals !== null) {
    add("decimals", report.decimals <= MAX_TOKEN_DECIMALS ? "OK" : "FAIL", `${report.decimals}${report.decimals <= MAX_TOKEN_DECIMALS ? " (any 0..24 works; thresholds are scaled)" : ` (contracts accept 0..${MAX_TOKEN_DECIMALS})`}`);
  }
  if (report.totalSupply !== null) {
    const supply = report.totalSupply;
    add("totalSupply", supply === 0n ? "FAIL" : supply > UINT128_MAX ? "FAIL" : "OK", supply === 0n ? "0: nothing minted yet" : supply > UINT128_MAX ? "does not fit the uint128 positions" : `${supply} base units`);
    if (supply > UINT224_MAX) add("supply vs ERC20Votes (uint224)", "FAIL", "the voting wrapper cannot hold this supply");
  }

  add("burn(uint256)", "INFO", report.burn.likely ? "present: slashed bonds are burned" : "not found: slashed bonds go to the slash sink (default 0x...dEaD); that is fine");

  let mode = votesMode;
  if (mode === "auto") mode = report.votes.native ? "native" : "wrapper";
  if (mode === "native" && !report.votes.native) {
    add("votes (ERC-5805, timestamp clock)", "FAIL", "CARB_VOTES_MODE=native but the token has no timestamp-clock votes");
  } else if (mode === "native") {
    add("votes (ERC-5805, timestamp clock)", "OK", "native: CarbGovernor is wired to the token itself; holders delegate on the token");
  } else {
    const why = report.votes.partial
      ? `token has vote functions but clock is "${report.votes.clockMode ?? "block number"}" (governor uses seconds)`
      : "no votes in the token";
    add("votes (ERC-5805, timestamp clock)", "INFO", `wrapper: ${why}; CarbVotes (vCARB) is deployed, holders deposit CARB to vote`);
  }

  add(
    "fee-on-transfer",
    "INFO",
    "cannot be simulated read-only (eth_call returns no balance deltas). Enforced onchain: stake / bond / deposit revert unless exactly the requested amount arrives",
  );
  add("rebasing", "INFO", "cannot be detected read-only; rebasing tokens are UNSUPPORTED (see TOKEN.md)");
  for (const flag of report.riskFlags ?? []) add(`heuristic: ${flag.kind}`, "WARN", `bytecode contains ${flag.signatures.join(", ")}: review the token source`);
  if (report.owner) add("owner()", report.ownerRenounced ? "OK" : "WARN", report.ownerRenounced ? "renounced (zero address)" : `${report.owner}: an owner can often change token behaviour`);
  if (report.paused === true) add("paused()", "FAIL", "token transfers are paused");

  return { go: rows.every((r) => r.status !== "FAIL"), rows, votesMode: mode };
}

function formatTable(rows) {
  const width = Math.max(...rows.map((r) => r.check.length));
  return rows.map((r) => `  [${r.status.padEnd(4)}] ${r.check.padEnd(width)}  ${r.detail}`).join("\n");
}

function printTokenReport(report, evaluation, log) {
  log("\n==================== CARB TOKEN (EXTERNAL): COMPATIBILITY ====================");
  log(`  address      ${report.address}`);
  log(`  chain id     ${report.chainId}`);
  if (report.hasCode) {
    log(`  symbol       ${report.symbol ?? "(none)"}`);
    log(`  name         ${report.name ?? "(none)"}`);
    log(`  decimals     ${report.decimals ?? "(unreadable)"}`);
    log(`  totalSupply  ${report.totalSupply ?? "(unreadable)"} base units`);
  }
  log(formatTable(evaluation.rows));
  log(`  VERDICT: ${evaluation.go ? "GO" : "NO-GO"}`);
  log("===============================================================================\n");
}

/**
 * CARB_TOKEN_ADDRESS handling for the deploy scripts. Returns null when it is not set.
 * Throws on a NO-GO token, and (when `requireConfirm`) unless CONFIRM_TOKEN equals the token's symbol.
 *
 * @returns {null | {address, symbol, name, decimals, totalSupply, hasBurn, votes, confirmed}}
 *          `votes` = "native" (token is IVotes with a timestamp clock) | "wrapper" (deploy CarbVotes)
 */
async function resolveExternalToken({ ethers, env, log, requireConfirm }) {
  const raw = (env.CARB_TOKEN_ADDRESS ?? "").trim();
  if (!raw) return null;
  const address = requireAddress(ethers, raw, "CARB_TOKEN_ADDRESS");
  const mode = (env.CARB_VOTES_MODE ?? "auto").trim().toLowerCase();
  if (!VOTES_MODES.includes(mode)) throw new Error(`CARB_VOTES_MODE must be one of ${VOTES_MODES.join(", ")} (got "${mode}")`);

  const report = await inspectToken({ ethers, address });
  const evaluation = evaluateToken(report, { votesMode: mode });
  printTokenReport(report, evaluation, log);
  if (!evaluation.go) {
    const failed = evaluation.rows.filter((r) => r.status === "FAIL").map((r) => `${r.check}: ${r.detail}`);
    throw new Error(`CARB_TOKEN_ADDRESS ${address} is not usable: ${failed.join("; ")}`);
  }

  const expected = report.symbol ?? address;
  const confirmed = (env.CONFIRM_TOKEN ?? "").trim() === expected;
  log(
    confirmed
      ? `  CONFIRM_TOKEN matches (${expected}).`
      : `  Not confirmed: set CONFIRM_TOKEN=${expected} to confirm that THIS is the token you mean (symbol shown above).`,
  );
  if (requireConfirm && !confirmed) {
    throw new Error(`CONFIRM_TOKEN=${expected} is required to proceed with the external token ${address}`);
  }
  return {
    address,
    symbol: report.symbol ?? "",
    name: report.name ?? "",
    decimals: report.decimals,
    totalSupply: report.totalSupply,
    hasBurn: report.burn.likely,
    votes: evaluation.votesMode,
    confirmed,
  };
}

/** JSON-safe record stored in deployments/<network>.json (config.token.external). */
function externalSummary(external) {
  return {
    address: external.address,
    symbol: external.symbol,
    name: external.name,
    decimals: external.decimals,
    totalSupply: external.totalSupply.toString(),
    burn: external.hasBurn,
    votes: external.votes,
  };
}

/** Inverse of `externalSummary` (check mode re-verifies a stored deployment). */
function externalFromSummary(summary) {
  return {
    address: summary.address,
    symbol: summary.symbol,
    name: summary.name,
    decimals: Number(summary.decimals),
    totalSupply: BigInt(summary.totalSupply),
    hasBurn: Boolean(summary.burn),
    votes: summary.votes,
    confirmed: true,
  };
}

/** The tier / bond / governance amounts must be reachable with this token's supply. Throws with the env to change. */
function assertConfigFitsSupply(cfg, external) {
  const supply = external.totalSupply;
  const fits = [
    ["STAKING_THRESHOLDS_CARB (highest tier)", cfg.staking.thresholds[2]],
    ["BOND_MIN_CARB", cfg.bond.minBond],
    ["GOV_PROPOSAL_THRESHOLD_CARB", cfg.governance.proposalThreshold],
  ];
  for (const [label, amount] of fits) {
    if (amount > supply) {
      throw new Error(`${label} (${amount} base units) exceeds the token's total supply (${supply}); lower it in whole tokens`);
    }
  }
}

module.exports = {
  VOTES_MODES,
  inspectToken,
  evaluateToken,
  formatTable,
  printTokenReport,
  resolveExternalToken,
  externalSummary,
  externalFromSummary,
  assertConfigFitsSupply,
};
