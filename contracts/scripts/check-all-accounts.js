const hre = require("hardhat");

async function main() {
  console.log("\n🔍 Checking ALL accounts for registered credits...\n");

  const NFT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const CarbonCreditNFT = await hre.ethers.getContractAt("CarbonCreditNFT", NFT_ADDRESS);

  // Check first 5 Hardhat accounts
  const signers = await hre.ethers.getSigners();
  
  console.log("Checking first 5 Hardhat accounts:");
  console.log("=" .repeat(80));

  for (let i = 0; i < Math.min(5, signers.length); i++) {
    const account = signers[i];
    const balance = await CarbonCreditNFT.balanceOf(account.address);
    
    console.log(`\nAccount #${i}: ${account.address}`);
    console.log(`  NFT Balance: ${balance.toString()}`);
    
    if (balance > 0) {
      console.log(`  ✅ THIS ACCOUNT HAS ${balance} CREDITS!`);
      console.log("  Token IDs owned:");
      for (let j = 0; j < balance; j++) {
        const tokenId = await CarbonCreditNFT.tokenOfOwnerByIndex(account.address, j);
        console.log(`    - Token #${tokenId}`);
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  
  // Get global stats
  const totalMinted = await CarbonCreditNFT.totalMintedTonnes();
  const totalActive = await CarbonCreditNFT.totalActiveCredits();
  console.log(`\n📊 Total Credits Minted: ${totalActive.toString()} (${hre.ethers.formatEther(totalMinted)} tonnes)`);
  console.log("\n💡 If you don't see your account above, you might be using a different wallet in MetaMask.");
  console.log("   Copy your MetaMask wallet address and I'll check that specific one.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
