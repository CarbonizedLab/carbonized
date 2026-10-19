const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const MARKET_ABI = [
  "function setKYCStatus(address user,bool status)",
  "function createAuction(uint256 amount,uint256 startPrice,uint256 endTime) returns (uint256)",
  "function placeBid(uint256 auctionId,uint256 bidAmount)",
  "function getAuction(uint256 auctionId) view returns (uint256,address,uint256,uint256,uint256,address,uint256,uint256,bool)",
  "function nextAuctionId() view returns (uint256)",
];
const ERC20_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];
const POOL_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

const receipt = async (tx) => {
  const result = await tx.wait();
  if (result.status !== 1) throw new Error(`reverted ${tx.hash}`);
  return result;
};

async function main() {
  const root = path.resolve(__dirname, "..", "..");
  const deployment = JSON.parse(fs.readFileSync(path.join(root, "contracts/deployments/robinhood.json"), "utf8"));
  if (deployment.chainId !== 46630) throw new Error("auction rehearsal is restricted to Robinhood testnet");
  const testers = JSON.parse(fs.readFileSync(path.join(root, ".secrets/robinhood-testnet-testers.json"), "utf8"));
  const env = Object.fromEntries(fs.readFileSync(path.join(root, "contracts/.env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#")).map((line) => line.split("=", 2)));
  const provider = new ethers.JsonRpcProvider(env.ROBINHOOD_RPC);
  if ((await provider.getNetwork()).chainId !== 46630n) throw new Error("testnet RPC required");
  const walletFor = (role) => new ethers.Wallet(testers.find((tester) => tester.role === role).private_key, provider);
  const deployer = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const seller = walletFor("seller-2");
  const bidder1 = walletFor("bidder-1");
  const bidder2 = walletFor("bidder-2");
  const c = deployment.contracts;
  const market = new ethers.Contract(c.CarbonMarketplace, MARKET_ABI, deployer);
  const payment = new ethers.Contract(c.USDC, ERC20_ABI, deployer);
  const pool = new ethers.Contract(c.CarbonCreditTokens.VERRA_VCS, POOL_ABI, deployer);
  const amount = ethers.parseEther("5");
  const bid1 = 30_000_000n;
  const bid2 = 40_000_000n;
  if ((await pool.balanceOf(seller.address)) < amount) throw new Error("seller needs at least 5 CCT from the rehearsal allocation");

  await receipt(await market.setKYCStatus(seller.address, true));
  await receipt(await market.setKYCStatus(bidder1.address, true));
  await receipt(await market.setKYCStatus(bidder2.address, true));
  await receipt(await pool.connect(seller).approve(c.CarbonMarketplace, amount));
  await receipt(await payment.connect(bidder1).approve(c.CarbonMarketplace, bid1));
  await receipt(await payment.connect(bidder2).approve(c.CarbonMarketplace, bid2));

  const endTime = Math.floor(Date.now() / 1000) + 3700;
  const auctionId = await market.nextAuctionId();
  const create = await receipt(await market.connect(seller).createAuction(amount, 25_000_000n, endTime));
  const beforeRefund = await payment.balanceOf(bidder1.address);
  const firstBid = await receipt(await market.connect(bidder1).placeBid(auctionId, bid1));
  const secondBid = await receipt(await market.connect(bidder2).placeBid(auctionId, bid2));
  const afterRefund = await payment.balanceOf(bidder1.address);
  if (afterRefund !== beforeRefund) throw new Error("outbid refund was not restored exactly");
  const auction = await market.getAuction(auctionId);
  if (auction[5].toLowerCase() !== bidder2.address.toLowerCase() || auction[4] !== bid2) throw new Error("highest bid readback failed");

  const state = { auctionId: auctionId.toString(), endTime, seller: seller.address, bidder1: bidder1.address, bidder2: bidder2.address, createTx: create.hash, firstBidTx: firstBid.hash, secondBidTx: secondBid.hash };
  const file = path.join(root, ".secrets/testnet-auction-lifecycle.json");
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  console.log(`AUCTION_ID=${state.auctionId}`);
  console.log(`AUCTION_END_UNIX=${endTime}`);
  console.log(`CREATE_AUCTION_TX=${create.hash}`);
  console.log(`FIRST_BID_TX=${firstBid.hash}`);
  console.log(`OUTBID_TX=${secondBid.hash}`);
  console.log("OUTBID_REFUND=PASS");
}
main().catch((error) => { console.error(error); process.exit(1); });
