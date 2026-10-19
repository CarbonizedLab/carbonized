const hre = require("hardhat");

async function main() {
  console.log("\n🔍 Checking Carbon Credits...\n");

  // Get the contract addresses
  const NFT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  
  // Get first test account (the one you should be using)
  const [account0] = await hre.ethers.getSigners();
  
  console.log("Account Address:", account0.address);

  // Get the NFT contract
  const CarbonCreditNFT = await hre.ethers.getContractAt("CarbonCreditNFT", NFT_ADDRESS);


  // Get NFT balance
  const balance = await CarbonCreditNFT.balanceOf(account0.address);
  console.log("NFT Balance:", balance.toString());

  // Get token IDs owned
  if (balance > 0) {
    console.log("\n📋 Your Carbon Credits (NFTs):");
    for (let i = 0; i < balance; i++) {
      const tokenId = await CarbonCreditNFT.tokenOfOwnerByIndex(account0.address, i);
      const credit = await CarbonCreditNFT.credits(tokenId);
      console.log(`\n  Token ID: ${tokenId}`);
      console.log(`  Project: ${credit.projectName}`);
      console.log(`  CO2 Tonnes: ${hre.ethers.formatEther(credit.co2Tonnes)}`);
      console.log(`  Methodology: ${credit.methodology}`);
      console.log(`  Retired: ${credit.isRetired}`);
    }
  } else {
    console.log("\n❌ No credits found!");
    console.log("   Credits are only issued by NATIVE_ISSUER_ROLE (EmissionVerifier / operator); there is no free claim.");
  }

  // Get global stats
  console.log("\n📊 Global Statistics:");
  const totalMinted = await CarbonCreditNFT.totalMintedTonnes();
  const totalRetired = await CarbonCreditNFT.totalRetiredTonnes();
  const totalActive = await CarbonCreditNFT.totalActiveCredits();
  console.log(`  Total Minted: ${hre.ethers.formatEther(totalMinted)} tonnes`);
  console.log(`  Total Retired: ${hre.ethers.formatEther(totalRetired)} tonnes`);
  console.log(`  Total Active Credits: ${totalActive.toString()}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
