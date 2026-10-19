const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * [AUD-WEBAPP-02] The marketplace UI converts typed decimals to wei with IEEE-754 doubles:
 *     BigInt(quantity * 1e18)                    (use-contract-interaction.ts: fillOrder / createSellOrder / createBuyOrder / ...)
 *     BigInt(Math.floor(amount * 1e18))          (use-contract-interaction.ts: approveErc20)
 *     Number(wei) / 1e18  ->  amount - filled    (market-utils.ts toOrderRow -> fill-dialog "Max" button)
 * Those expressions are copied verbatim below and replayed against the real CarbonMarketplace on a local chain.
 *
 * (a) Approval shortfall -> permanent revert loop. For ~28% of (quantity, price) pairs with 2 decimals the UI approves a
 *     few wei LESS than fillOrder pulls ((amountWei*priceWei)/1e18). fillOrder reverts after the approval tx was already
 *     paid for, and the UI's retry check `allowance >= needed` (floats) is TRUE, so the next click skips the approval and
 *     reverts again, forever, for that input.
 * (b) The "Max" button fills a number that differs from the onchain remainder by tens of wei -> "Invalid fill amount"
 *     in roughly half of partially-filled orders (or leaves un-fillable dust when the double rounds down).
 * Preconditions: normal user typing ordinary 2-decimal amounts. No attacker needed. Impact: core purchase flow reverts,
 * wasted gas, orders that cannot be completed through the app. No direct loss of funds (reverts are fail-safe).
 */
describe("[AUD-WEBAPP-02] float arithmetic in the trade flow", function () {
  const E18 = 10n ** 18n;

  async function deploy() {
    const [owner, seller, buyer] = await ethers.getSigners();
    const nft = await (await ethers.getContractFactory("CarbonCreditNFT")).deploy();
    const token = await (
      await ethers.getContractFactory("CarbonCreditToken")
    ).deploy("Carbonized CCT", "CCT-VCS", await nft.getAddress(), "VERRA_VCS");
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 18);
    const market = await (
      await ethers.getContractFactory("CarbonMarketplace")
    ).deploy(await usdc.getAddress(), await token.getAddress(), await nft.getAddress());

    await nft.grantRole(await nft.NATIVE_ISSUER_ROLE(), owner.address);
    await usdc.mint(buyer.address, ethers.parseEther("1000000"));
    await nft.mintCredit(
      seller.address, "P1", "Proj", "VCS-1", "VERRA_VCS", ethers.parseEther("1000"), 2024, "IN",
      ethers.keccak256(ethers.toUtf8Bytes("p")), "cid", "ipfs://x"
    );
    await nft.connect(seller).approve(await token.getAddress(), 1);
    await token.connect(seller).wrapCredit(1);
    await token.connect(seller).approve(await market.getAddress(), ethers.MaxUint256);
    return { market, usdc, token, seller, buyer };
  }

  // ---- exact copies of the app's conversions ----
  const uiWei = (x) => BigInt(x * 1e18); // fillOrder/createSellOrder/createBuyOrder args
  const uiApproveWei = (x) => BigInt(Math.floor(x * 1e18)); // approveErc20 args
  const uiToNumber = (w) => Number(w) / 1e18; // getOrderById consumers

  it("[AUD-WEBAPP-02] approval is a few wei short -> fill reverts, retry skips approval and reverts again", async function () {
    const { market, usdc, seller, buyer } = await deploy();
    const qty = 0.01;
    const price = 1.74;
    await market.connect(seller).createSellOrder(uiWei(qty), uiWei(price), 0, false);

    const needed = qty * price; // use-marketplace.ts ensureApproval: `amount * listing.pricePerTonne`
    const mktAddr = await market.getAddress();
    const exactCost = (uiWei(qty) * uiWei(price)) / E18;

    // 1st click: allowance 0 < needed -> UI approves floor(needed*1e18)
    await usdc.connect(buyer).approve(mktAddr, uiApproveWei(needed));
    const allowance = await usdc.allowance(buyer.address, mktAddr);
    console.log(`      typed ${qty} t @ ${price} -> approved ${allowance} wei, contract pulls ${exactCost} wei (short by ${exactCost - allowance})`);
    expect(allowance).to.be.lt(exactCost);

    await expect(market.connect(buyer).fillOrder(1, uiWei(qty))).to.be.reverted; // ERC20InsufficientAllowance

    // 2nd click: UI check `getErc20Allowance(...) >= needed` where getErc20Allowance returns Number(allowance)/1e18
    const uiAllowanceCheck = uiToNumber(allowance) >= needed;
    expect(uiAllowanceCheck).to.equal(true); // -> ensureApproval returns early, NO new approval
    await expect(market.connect(buyer).fillOrder(1, uiWei(qty))).to.be.reverted; // stuck: same revert forever
  });

  it("[AUD-WEBAPP-02] the typed amount is not what is sent (0.07 t -> 70000000000000008 wei) and 'Max' reverts on the remainder", async function () {
    const { market, usdc, seller, buyer } = await deploy();
    expect(uiWei(0.07)).to.equal(70000000000000008n); // not 7e16

    await market.connect(seller).createSellOrder(uiWei(1), uiWei(10), 0, false); // order 1: 1.0 t
    const mktAddr = await market.getAddress();
    await usdc.connect(buyer).approve(mktAddr, ethers.MaxUint256);

    await market.connect(buyer).fillOrder(1, uiWei(0.43)); // partial fill via the dialog

    // marketplace page: toOrderRow -> available = Number(amount) - Number(filled), each already divided by 1e18
    const o = await market.getOrder(1);
    const available = Math.max(0, uiToNumber(o.amount) - uiToNumber(o.filled));
    const remainder = o.amount - o.filled;
    const maxClickWei = uiWei(Number.parseFloat(String(available))); // fill-dialog.tsx:186 setAmount(String(listing.available))
    console.log(`      onchain remainder ${remainder} wei, UI "Max" sends ${maxClickWei} wei (available=${available})`);
    expect(maxClickWei).to.be.gt(remainder);

    await expect(market.connect(buyer).fillOrder(1, maxClickWei)).to.be.revertedWith("Invalid fill amount");
    // the user can only finish the order by typing the amount by hand, the one-click path is broken
    await market.connect(buyer).fillOrder(1, remainder);
    expect((await market.getOrder(1)).isActive).to.equal(false);
  });
});

/**
 * [AUD-WEBAPP-04] (production-only) The app hard-codes 18 decimals for the payment token and never reads `decimals()`.
 * With real 6-decimal USDC (the production target named in the brief) every approval the UI requests is 10^12 times
 * the intended amount: a $10 purchase grants the marketplace an allowance of 10,000,000,000,000 USDC, i.e. an
 * effectively unlimited approval that persists after the trade. (The marketplace contract also assumes 1e18 pricing; the
 * contract side is covered by the other audit areas.)
 */
describe("[AUD-WEBAPP-04] production-only: 18-decimals assumption over-approves 6-decimals USDC", function () {
  it("[AUD-WEBAPP-04] approving $10 through approveErc20's expression grants 10^13 USDC", async function () {
    const [, buyer, marketplaceStandIn] = await ethers.getSigners();
    const usdc6 = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    const uiApproveWei = (x) => BigInt(Math.floor(x * 1e18));

    const wanted = 10; // $10
    await usdc6.connect(buyer).approve(marketplaceStandIn.address, uiApproveWei(wanted));
    const allowanceRaw = await usdc6.allowance(buyer.address, marketplaceStandIn.address);
    const allowanceUsdc = allowanceRaw / 10n ** 6n;
    console.log(`      user intended $${wanted}; allowance granted = ${allowanceUsdc} USDC`);
    expect(allowanceUsdc).to.equal(10_000_000_000_000n);
  });
});
