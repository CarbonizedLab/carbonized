const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const NFT_ABI = [
  "function tokenOfOwnerByIndex(address owner,uint256 index) view returns (uint256)",
  "function approve(address to,uint256 tokenId)",
];
const POOL_ABI = [
  "function wrapCredit(uint256 tokenId) returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];
const MARKET_ABI = [
  "function createSellOrder(uint256 amount,uint256 pricePerTonne,uint256 expiresIn,bool requiresKYC) returns (uint256)",
  "function fillOrder(uint256 orderId,uint256 amount)",
  "function createAuction(uint256 amount,uint256 startPrice,uint256 endTime) returns (uint256)",
  "function cancelAuction(uint256 auctionId)",
  "function getOrder(uint256 orderId) view returns (uint256,address,bool,uint256,uint256,uint256,bool,uint256,uint256,bool)",
  "function setKYCStatus(address user,bool status)",
  "function nextOrderId() view returns (uint256)",
  "function nextAuctionId() view returns (uint256)",
];
const ERC20_ABI = [
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
  const testers = JSON.parse(fs.readFileSync(path.join(root, ".secrets/robinhood-testnet-testers.json"), "utf8"));
  const env = Object.fromEntries(fs.readFileSync(path.join(root, "contracts/.env"), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#")).map((l) => l.split("=", 2)));
  const byRole = Object.fromEntries(testers.map((wallet) => [wallet.role, wallet]));
  const provider = new ethers.JsonRpcProvider(env.ROBINHOOD_RPC);
  const network = await provider.getNetwork();
  if (network.chainId !== 46630n || deployment.chainId !== 46630) {
    throw new Error("multi-user rehearsal is restricted to Robinhood testnet (chain 46630)");
  }
  const deployer = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const signer = (role) => new ethers.Wallet(byRole[role].private_key, provider);
  const c = deployment.contracts;
  const nft = new ethers.Contract(c.CarbonCreditNFT, NFT_ABI, deployer);
  const pool = new ethers.Contract(c.CarbonCreditTokens.VERRA_VCS, POOL_ABI, deployer);
  const market = new ethers.Contract(c.CarbonMarketplace, MARKET_ABI, deployer);
  const payment = new ethers.Contract(c.USDC, ERC20_ABI, deployer);
  const seller = signer("seller-1");
  const buyer = signer("buyer-1");
  const auctionSeller = signer("seller-2");
  const tokenId = await nft.tokenOfOwnerByIndex(seller.address, 0);
  const auctionTokenId = await nft.tokenOfOwnerByIndex(auctionSeller.address, 0);
  const amount = ethers.parseEther("5");
  const price = 5_000_000n;
  const cost = (amount * price) / ethers.parseEther("1");
  const sellerNft = nft.connect(seller);
  const sellerPool = pool.connect(seller);
  const sellerMarket = market.connect(seller);
  const buyerPayment = payment.connect(buyer);
  const buyerMarket = market.connect(buyer);

  await receipt(await sellerNft.approve(c.CarbonCreditTokens.VERRA_VCS, tokenId));
  await receipt(await sellerPool.wrapCredit(tokenId));
  await receipt(await sellerPool.approve(c.CarbonMarketplace, amount));
  const orderId = await market.nextOrderId();
  const createOrder = await receipt(await sellerMarket.createSellOrder(amount, price, 3600, false));
  await receipt(await buyerPayment.approve(c.CarbonMarketplace, cost));
  const buyerBefore = await pool.balanceOf(buyer.address);
  const fill = await receipt(await buyerMarket.fillOrder(orderId, amount));
  const buyerAfter = await pool.balanceOf(buyer.address);
  if (buyerAfter - buyerBefore !== amount) throw new Error("buyer did not receive exact CCT amount");
  const order = await market.getOrder(orderId);
  if (order[6] !== false || order[5] !== amount) throw new Error("order fill readback failed");

  await receipt(await market.setKYCStatus(auctionSeller.address, true));
  const auctionNft = nft.connect(auctionSeller);
  const auctionPool = pool.connect(auctionSeller);
  const auctionMarket = market.connect(auctionSeller);
  await receipt(await auctionNft.approve(c.CarbonCreditTokens.VERRA_VCS, auctionTokenId));
  await receipt(await auctionPool.wrapCredit(auctionTokenId));
  await receipt(await auctionPool.approve(c.CarbonMarketplace, amount));
  const auctionId = await market.nextAuctionId();
  const createAuction = await receipt(await auctionMarket.createAuction(amount, 25_000_000n, Math.floor(Date.now() / 1000) + 3700));
  const cancelAuction = await receipt(await auctionMarket.cancelAuction(auctionId));

  for (const [label, tx] of Object.entries({ createOrder, fill, createAuction, cancelAuction })) console.log(`${label.toUpperCase()}_TX=${tx.hash}`);
  console.log(`ORDER_ID=${orderId}`);
  console.log(`AUCTION_ID=${auctionId}`);
  console.log("MULTIUSER_MARKET_REHEARSAL=PASS");
}
main().catch((error) => { console.error(error); process.exit(1); });
