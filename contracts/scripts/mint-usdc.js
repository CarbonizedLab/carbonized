const hre = require("hardhat");

async function main() {
  console.log("\n💰 Giving you 10,000 USDC for testing...\n");

  const USDC_ADDRESS = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
  const RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Your wallet from screenshot
  
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deployer:", deployer.address);
  console.log("Recipient:", RECIPIENT);

  // Get the USDC contract
  const MockUSDC = await hre.ethers.getContractAt("MockERC20", USDC_ADDRESS);

  // Mint 10,000 USDC (6 decimals)
  const amount = hre.ethers.parseUnits("10000", 6);
  
  console.log("\nMinting 10,000 USDC...");
  const tx = await MockUSDC.mint(RECIPIENT, amount);
  await tx.wait();
  
  console.log("✅ Minted 10,000 USDC!");
  
  // Check balance
  const balance = await MockUSDC.balanceOf(RECIPIENT);
  console.log(`\n📊 Your USDC Balance: ${hre.ethers.formatUnits(balance, 6)} USDC`);
  
  console.log("\n✨ You can now create buy orders in the marketplace!");
  console.log("   Go to: http://localhost:3001/credit-requests");
  console.log("   Click 'Submit Request' tab");
  console.log("   Fill in the amount and price");
  console.log("   Click 'Submit Request'\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
