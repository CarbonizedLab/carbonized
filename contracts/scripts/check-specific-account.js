const hre = require("hardhat");

async function main() {
  // The account shown in your screenshot
  const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const NFT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  
  console.log("\n🔍 Detailed Credit Check for:", ACCOUNT);
  console.log("=".repeat(80));

  const CarbonCreditNFT = await hre.ethers.getContractAt("CarbonCreditNFT", NFT_ADDRESS);

  // (no registration flag any more: credits are only issued by NATIVE_ISSUER_ROLE)

  // Check balance
  const balance = await CarbonCreditNFT.balanceOf(ACCOUNT);
  console.log("✅ NFT Balance:", balance.toString());

  // List all tokens
  if (balance > 0) {
    console.log(`\n📋 Your ${balance} Carbon Credit NFTs:\n`);
    
    for (let i = 0; i < balance; i++) {
      const tokenId = await CarbonCreditNFT.tokenOfOwnerByIndex(ACCOUNT, i);
      const credit = await CarbonCreditNFT.credits(tokenId);
      
      console.log(`Token #${tokenId}:`);
      console.log(`  Project ID: ${credit.projectId}`);
      console.log(`  Project Name: ${credit.projectName}`);
      console.log(`  Methodology: ${credit.methodology}`);
      console.log(`  CO2 Tonnes: ${hre.ethers.formatEther(credit.co2Tonnes)}`);
      console.log(`  Vintage Year: ${credit.vintageYear}`);
      console.log(`  Geography: ${credit.geography}`);
      console.log(`  Is Retired: ${credit.isRetired}`);
      console.log(`  Issuance Date: ${new Date(Number(credit.issuanceDate) * 1000).toISOString()}`);
      console.log(`  Serial Number: ${credit.serialNumber || "(none)"}`);
      console.log("");
    }

    // Check if approved for CCT wrapper
    const CCT_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
    const isApproved = await CarbonCreditNFT.isApprovedForAll(ACCOUNT, CCT_ADDRESS);
    console.log(`📝 Approved for CCT Wrapping: ${isApproved}`);
    
  } else {
    console.log("\n❌ ERROR: Blockchain shows credits but balance is 0!");
  }

  console.log("\n" + "=".repeat(80));
  console.log("🔧 Frontend Debug Info:");
  console.log("   If you see credits above but frontend shows 0, the issue is in:");
  console.log("   📁 frontend/src/hooks/useContractInteraction.ts");
  console.log("   📍 Function: getUserCredits()");
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
