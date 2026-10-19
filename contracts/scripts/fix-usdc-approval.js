const hre = require("hardhat");

async function main() {
  console.log("\n🔄 Resetting USDC approval with correct decimals...\n");

  const USDC_ADDRESS = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
  const MARKETPLACE_ADDRESS = "0x0165878A594ca255338adfa4d48449f69242Eb8F";
  const YOUR_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  // Impersonate your account
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [YOUR_WALLET],
  });

  const userSigner = await hre.ethers.getSigner(YOUR_WALLET);
  const MockUSDC = await hre.ethers.getContractAt("MockERC20", USDC_ADDRESS, userSigner);

  // Check current allowance
  const oldAllowance = await MockUSDC.allowance(YOUR_WALLET, MARKETPLACE_ADDRESS);
  console.log(`Old Allowance: ${hre.ethers.formatUnits(oldAllowance, 6)} USDC`);

  // Reset to 0 first
  console.log("\n1️⃣ Resetting allowance to 0...");
  const resetTx = await MockUSDC.approve(MARKETPLACE_ADDRESS, 0);
  await resetTx.wait();
  console.log("   ✅ Reset to 0");

  // Approve with correct decimals (USDC has 6 decimals)
  // Approve 100,000 USDC to cover any buy orders
  const approvalAmount = hre.ethers.parseUnits("100000", 6); // 100k USDC with 6 decimals
  
  console.log("\n2️⃣ Approving 100,000 USDC (with 6 decimals)...");
  const approveTx = await MockUSDC.approve(MARKETPLACE_ADDRESS, approvalAmount);
  await approveTx.wait();
  console.log("   ✅ Approved!");

  // Verify
  const newAllowance = await MockUSDC.allowance(YOUR_WALLET, MARKETPLACE_ADDRESS);
  console.log(`\n📊 New Allowance: ${hre.ethers.formatUnits(newAllowance, 6)} USDC`);
  console.log(`   (Raw: ${newAllowance.toString()})`);

  // Now test creating a buy order
  console.log("\n3️⃣ Testing buy order creation...");
  const Marketplace = await hre.ethers.getContractAt("CarbonMarketplace", MARKETPLACE_ADDRESS, userSigner);
  
  try {
    const amount = hre.ethers.parseEther("1"); // 1 tonne
    const price = hre.ethers.parseEther("50"); // $50 per tonne
    
    const tx = await Marketplace.createBuyOrder(amount, price, 0, false);
    const receipt = await tx.wait();
    
    console.log("   ✅ Buy order created successfully!");
    console.log(`   📄 Transaction: ${receipt.hash}`);
    console.log(`   🆔 Order ID: Check the OrderCreated event`);
    
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
  }

  await hre.network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [YOUR_WALLET],
  });

  console.log("\n✅ All done! The frontend should now work.");
  console.log("   Refresh your browser and try submitting a credit request.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
