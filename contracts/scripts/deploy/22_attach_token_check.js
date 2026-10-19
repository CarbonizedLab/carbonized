// READ-ONLY diagnostic for a CARB token that Carbonized did not deploy (e.g. a launchpad token). Sends NO transaction,
// needs no private key, works on any network.
//
//   CARB_TOKEN_ADDRESS=0x... npx hardhat run scripts/deploy/22_attach_token_check.js --network robinhoodMainnet
//   (optional) CARB_VOTES_MODE=auto|native|wrapper   what the deploy scripts would do for governance (default auto)
//
// Prints a go / no-go table: code present, ERC-20 reads, decimals, supply, burn(uint256), votes (ERC-5805 + timestamp
// clock), bytecode heuristics (tax / blacklist / mint / rebase selectors), owner. Exit code 1 on NO-GO.
//
// NOT checkable read-only: fee-on-transfer. An `eth_call` returns return data, never the balance delta, and the check
// needs a funded holder. The contracts enforce it onchain instead: CarbStaking.stake, IssuerBond.bond and
// CarbVotes.depositFor revert with "Received amount differs (fee-on-transfer unsupported)" unless exactly the
// requested amount arrived. Try the smallest amount first after the deployment. Rebasing / an owner who can switch
// behaviour later cannot be detected either: read the token's source and the launchpad terms (contracts/docs/TOKEN.md).
//
// Next step when GO: 21_deploy_token_mainnet.js with CARB_TOKEN_ADDRESS and CONFIRM_TOKEN=<symbol>.

const { requireAddress, makeLogger } = require("../lib/deploy-core");
const { inspectToken, evaluateToken, printTokenReport, VOTES_MODES } = require("../lib/external-token");

async function attachTokenCheck({ hre, env = process.env, quiet = false }) {
  const { ethers } = hre;
  const log = makeLogger(quiet);
  const address = requireAddress(ethers, (env.CARB_TOKEN_ADDRESS ?? "").trim(), "CARB_TOKEN_ADDRESS");
  const mode = (env.CARB_VOTES_MODE ?? "auto").trim().toLowerCase();
  if (!VOTES_MODES.includes(mode)) throw new Error(`CARB_VOTES_MODE must be one of ${VOTES_MODES.join(", ")} (got "${mode}")`);

  const report = await inspectToken({ ethers, address });
  const evaluation = evaluateToken(report, { votesMode: mode });
  printTokenReport(report, evaluation, log);
  if (evaluation.go) {
    const expected = report.symbol ?? address;
    log(`Next: CARB_TOKEN_ADDRESS=${address} CONFIRM_TOKEN=${expected} ... 21_deploy_token_mainnet.js (dry run first).`);
  }
  return { go: evaluation.go, rows: evaluation.rows, report, votesMode: evaluation.votesMode };
}

module.exports = { attachTokenCheck };

if (require.main === module) {
  attachTokenCheck({ hre: require("hardhat") })
    .then(({ go }) => process.exit(go ? 0 : 1))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
