const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

async function main() {
  const root = path.resolve(__dirname, "..", "..");
  const deployment = JSON.parse(fs.readFileSync(path.join(root, "contracts/deployments/robinhood.json"), "utf8"));
  if (deployment.chainId !== 46630) throw new Error("testnet deployment metadata required");
  const provider = new ethers.JsonRpcProvider("https://rpc.testnet.chain.robinhood.com/rpc");
  const network = await provider.getNetwork();
  if (network.chainId !== 46630n) throw new Error(`unexpected chain ${network.chainId}`);
  const c = deployment.contracts;
  for (const [name, address] of Object.entries({ NFT: c.CarbonCreditNFT, Marketplace: c.CarbonMarketplace, VERRA_CCT: c.CarbonCreditTokens.VERRA_VCS })) {
    if ((await provider.getCode(address)) === "0x") throw new Error(`${name} has no code`);
  }
  const market = new ethers.Contract(c.CarbonMarketplace, ["function paused() view returns (bool)"], provider);
  if (await market.paused()) throw new Error("marketplace remains paused");
  const pool = new ethers.Contract(c.CarbonCreditTokens.VERRA_VCS, ["function isFullyBacked() view returns (bool)"], provider);
  if (!(await pool.isFullyBacked())) throw new Error("VERRA pool is not fully backed");
}
main().catch((error) => { console.error(`CARBONIZED TESTNET ALERT: ${error.message || error}`); process.exit(1); });
