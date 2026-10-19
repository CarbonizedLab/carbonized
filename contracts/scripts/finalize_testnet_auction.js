const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const ABI = [
  "function finalizeAuction(uint256 auctionId)",
  "function getAuction(uint256 auctionId) view returns (uint256,address,uint256,uint256,uint256,address,uint256,uint256,bool)",
];

async function main() {
  const root = path.resolve(__dirname, "..", "..");
  const deployment = JSON.parse(fs.readFileSync(path.join(root, "contracts/deployments/robinhood.json"), "utf8"));
  const state = JSON.parse(fs.readFileSync(path.join(root, ".secrets/testnet-auction-lifecycle.json"), "utf8"));
  const env = Object.fromEntries(fs.readFileSync(path.join(root, "contracts/.env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#")).map((line) => line.split("=", 2)));
  const provider = new ethers.JsonRpcProvider(env.ROBINHOOD_RPC);
  if ((await provider.getNetwork()).chainId !== 46630n || deployment.chainId !== 46630) throw new Error("Robinhood testnet required");
  if (Math.floor(Date.now() / 1000) < state.endTime) throw new Error("auction has not ended yet");
  const signer = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const market = new ethers.Contract(deployment.contracts.CarbonMarketplace, ABI, signer);
  const before = await market.getAuction(state.auctionId);
  if (!before[8]) throw new Error("auction is not active");
  const tx = await market.finalizeAuction(state.auctionId);
  const receipt = await tx.wait();
  const after = await market.getAuction(state.auctionId);
  if (receipt.status !== 1 || after[8]) throw new Error("auction finalization readback failed");
  console.log(`FINALIZE_AUCTION_TX=${tx.hash}`);
  console.log(`AUCTION_ID=${state.auctionId}`);
  console.log("AUCTION_FINALIZATION=PASS");
}
main().catch((error) => { console.error(error.message || error); process.exit(1); });
