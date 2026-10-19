// Verifies every contract of deployments/<network>.json on the chain's Blockscout explorer.
//
//   npx hardhat run scripts/verify/verify_deployment.js --network robinhoodMainnet
//   npx hardhat run scripts/verify/verify_deployment.js --network robinhood
//
// Needs the same compiler settings the deployment was built with (hardhat.config.js, unchanged since the
// deploy) and the `etherscan.customChains` entries in hardhat.config.js. Blockscout needs no API key.

const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

/** Fully qualified names, only where several artifacts could match the same bytecode. */
const QUALIFIED = {
  USDC: "contracts/tests/MockERC20.sol:MockERC20",
  FunctionsRouter: "contracts/tests/MockFunctionsRouter.sol:MockFunctionsRouter",
};

function addressOf(deployment, key) {
  const c = deployment.contracts;
  if (key.startsWith("CCT_")) return c.CarbonCreditTokens[key.slice(4)];
  return c[key];
}

async function main() {
  const network = hre.network.name;
  const file = path.join(__dirname, "../../deployments", `${network}.json`);
  if (!fs.existsSync(file)) throw new Error(`${file} not found`);
  const deployment = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!deployment.constructorArgs) throw new Error(`${file} has no constructorArgs (deployed with an older script)`);

  let failures = 0;
  for (const [key, args] of Object.entries(deployment.constructorArgs)) {
    const address = addressOf(deployment, key);
    if (!address) throw new Error(`no address for ${key}`);
    process.stdout.write(`Verifying ${key} ${address} ... `);
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: args,
        ...(QUALIFIED[key] ? { contract: QUALIFIED[key] } : {}),
      });
      process.stdout.write("ok\n");
    } catch (error) {
      if (/already verified/i.test(error.message)) {
        process.stdout.write("already verified\n");
      } else {
        failures += 1;
        process.stdout.write(`FAILED: ${error.message}\n`);
      }
    }
  }
  if (failures > 0) throw new Error(`${failures} contract(s) failed verification`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
