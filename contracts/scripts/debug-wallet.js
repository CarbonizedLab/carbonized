const hre = require("hardhat");

async function main() {
  console.log("\n🔍 Complete Wallet Status Check\n");
  console.log("=".repeat(80));

  const YOUR_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const NFT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const USDC_ADDRESS = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
  const MARKETPLACE_ADDRESS = "0x0165878A594ca255338adfa4d48449f69242Eb8F";

  const provider = hre.ethers.provider;
  
  // Check ETH balance
  const ethBalance = await provider.getBalance(YOUR_WALLET);
  console.log(`\n💎 ETH Balance: ${hre.ethers.formatEther(ethBalance)} ETH`);

  // Check USDC balance
  const MockUSDC = await hre.ethers.getContractAt("MockERC20", USDC_ADDRESS);
  const usdcBalance = await MockUSDC.balanceOf(YOUR_WALLET);
  console.log(`💵 USDC Balance: ${hre.ethers.formatUnits(usdcBalance, 6)} USDC`);

  // Check USDC allowance for marketplace
  const usdcAllowance = await MockUSDC.allowance(YOUR_WALLET, MARKETPLACE_ADDRESS);
  console.log(`🔓 USDC Allowance (Marketplace): ${hre.ethers.formatUnits(usdcAllowance, 6)} USDC`);

  // Check NFT balance
  const CarbonCreditNFT = await hre.ethers.getContractAt("CarbonCreditNFT", NFT_ADDRESS);
  const nftBalance = await CarbonCreditNFT.balanceOf(YOUR_WALLET);
  console.log(`🌿 Carbon Credit NFTs: ${nftBalance.toString()}`);

  console.log("\n" + "=".repeat(80));
  
  // Diagnose
  console.log("\n📋 Diagnosis:");
  
  if (ethBalance < hre.ethers.parseEther("0.01")) {
    console.log("  ⚠️  WARNING: Low ETH balance. You need ETH for gas fees.");
  } else {
    console.log("  ✅ ETH balance is sufficient for gas fees");
  }
  
  if (usdcBalance == 0n) {
    console.log("  ❌ ERROR: No USDC! Run: npx hardhat run scripts/mint-usdc.js --network localhost");
  } else {
    console.log(`  ✅ You have ${hre.ethers.formatUnits(usdcBalance, 6)} USDC`);
  }
  
  if (nftBalance == 0n) {
    console.log("  ⚠️  You have no carbon credits (but that's OK for buying)");
  } else {
    console.log(`  ✅ You have ${nftBalance} carbon credit NFTs`);
  }

  console.log("\n📝 To create a buy order:");
  console.log("   1. Make sure you're connected with wallet: " + YOUR_WALLET);
  console.log("   2. Go to: http://localhost:3001/credit-requests");
  console.log("   3. Click 'Submit Request' tab");
  console.log("   4. Enter amount (e.g., 1) and max price (e.g., 50)");
  console.log("   5. Click 'Submit Request'");
  console.log("   6. Approve the USDC spend in MetaMask (1st transaction)");
  console.log("   7. Confirm the buy order creation (2nd transaction)");
  
  // Try to simulate the transaction
  console.log("\n🧪 Testing transaction simulation...");
  
  try {
    const [signer] = await hre.ethers.getSigners();
    const Marketplace = await hre.ethers.getContractAt("CarbonMarketplace", MARKETPLACE_ADDRESS);
    
    // Impersonate the user
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [YOUR_WALLET],
    });
    
    const userSigner = await hre.ethers.getSigner(YOUR_WALLET);
    
    // Try to create a buy order with 1 credit at $50/tonne
    const amount = hre.ethers.parseEther("1"); // 1 tonne
    const price = hre.ethers.parseEther("50"); // $50 per tonne
    const totalCost = hre.ethers.parseUnits("50", 6); // 50 USDC (6 decimals)
    
    // Check if USDC approval is needed
    const currentAllowance = await MockUSDC.allowance(YOUR_WALLET, MARKETPLACE_ADDRESS);
    
    if (currentAllowance < totalCost) {
      console.log("  ℹ️  Approving USDC...");
      const approveTx = await MockUSDC.connect(userSigner).approve(MARKETPLACE_ADDRESS, totalCost);
      await approveTx.wait();
      console.log("  ✅ USDC approved!");
    }
    
    console.log("  ℹ️  Creating buy order...");
    const tx = await Marketplace.connect(userSigner).createBuyOrder(amount, price, 0, false);
    const receipt = await tx.wait();
    
    console.log("  ✅ Buy order created successfully!");
    console.log(`  📄 Transaction hash: ${receipt.hash}`);
    
    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [YOUR_WALLET],
    });
    
    console.log("\n✅ All systems working! The issue might be in the frontend.");
    console.log("   Try these steps:");
    console.log("   1. Hard refresh the browser (Ctrl+Shift+R)");
    console.log("   2. Clear browser cache");
    console.log("   3. Open browser console (F12) and check for errors");
    
  } catch (error) {
    console.log(`  ❌ Transaction would fail: ${error.message}`);
    
    if (error.message.includes("insufficient funds")) {
      console.log("\n💡 Solution: You need more USDC or ETH");
    } else if (error.message.includes("ERC20: transfer amount exceeds balance")) {
      console.log("\n💡 Solution: Run mint-usdc.js script to get USDC");
    } else {
      console.log("\n💡 Error details:", error);
    }
  }
  
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
