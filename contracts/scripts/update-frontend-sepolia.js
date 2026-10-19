#!/usr/bin/env node

/**
 * Update Frontend Environment with Sepolia Deployment Addresses
 * 
 * This script reads the Sepolia deployment data and updates the frontend .env.local file
 * with the deployed contract addresses.
 * 
 * Usage: node scripts/update-frontend-sepolia.js
 */

const fs = require('fs');
const path = require('path');

const DEPLOYMENT_FILE = path.join(__dirname, '../deployments/sepolia.json');
const ENV_FILE = path.join(__dirname, '../frontend/.env.local');

console.log('🔄 Updating frontend configuration with Sepolia addresses...\n');

// Check if deployment file exists
if (!fs.existsSync(DEPLOYMENT_FILE)) {
  console.error('❌ Error: Sepolia deployment file not found!');
  console.error('   Run: npm run deploy:sepolia');
  process.exit(1);
}

// Read deployment data
const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8'));
const contracts = deployment.contracts;

console.log('📄 Reading deployment from:', DEPLOYMENT_FILE);
console.log('   Network:', deployment.network);
console.log('   Chain ID:', deployment.chainId);
console.log('   Deployed at:', deployment.timestamp);
console.log('   Deployer:', deployment.deployer);
console.log('');

// Read current env file
let envContent = fs.existsSync(ENV_FILE) 
  ? fs.readFileSync(ENV_FILE, 'utf8') 
  : '';

// Function to update or add env variable
function updateEnvVar(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'gm');
  const line = `${key}=${value}`;
  
  if (regex.test(content)) {
    return content.replace(regex, line);
  } else {
    return content + '\n' + line;
  }
}

// Update contract addresses
envContent = updateEnvVar(envContent, 'NEXT_PUBLIC_CARBON_CREDIT_NFT', contracts.CarbonCreditNFT);
envContent = updateEnvVar(envContent, 'NEXT_PUBLIC_CARBON_CREDIT_TOKEN', contracts.CarbonCreditTokens.VERRA_VCS);
envContent = updateEnvVar(envContent, 'NEXT_PUBLIC_CARBON_MARKETPLACE', contracts.CarbonMarketplace);
envContent = updateEnvVar(envContent, 'NEXT_PUBLIC_CARBON_PRICE_ORACLE', contracts.CarbonPriceOracle);
envContent = updateEnvVar(envContent, 'NEXT_PUBLIC_EMISSION_VERIFIER', contracts.EmissionVerifier);
envContent = updateEnvVar(envContent, 'NEXT_PUBLIC_USDC_ADDRESS', contracts.USDC);

// Update network settings
envContent = updateEnvVar(envContent, 'NEXT_PUBLIC_NETWORK', 'sepolia');
envContent = updateEnvVar(envContent, 'NEXT_PUBLIC_CHAIN_ID', '11155111');

// Write updated env file
fs.writeFileSync(ENV_FILE, envContent);

console.log('✅ Frontend configuration updated!\n');
console.log('📋 Contract Addresses:');
console.log('   CarbonCreditNFT:', contracts.CarbonCreditNFT);
console.log('   CarbonCreditToken (VCS):', contracts.CarbonCreditTokens.VERRA_VCS);
console.log('   CarbonMarketplace:', contracts.CarbonMarketplace);
console.log('   CarbonPriceOracle:', contracts.CarbonPriceOracle);
console.log('   EmissionVerifier:', contracts.EmissionVerifier);
console.log('   Mock USDC:', contracts.USDC);
console.log('');
console.log('🔗 View on Etherscan:');
console.log('   https://sepolia.etherscan.io/address/' + contracts.CarbonMarketplace);
console.log('');
console.log('📝 Next Steps:');
console.log('   1. Restart frontend: ./run-dev.bat');
console.log('   2. Connect wallet to Sepolia network');
console.log('   3. Add consumer contracts to Chainlink subscription:');
console.log('      https://functions.chain.link/sepolia/' + deployment.chainlink.subscriptionId);
console.log('');
console.log('   Consumer addresses to add:');
console.log('   - ' + contracts.EmissionVerifier);
console.log('   - ' + contracts.RegistrySync);
console.log('   - ' + contracts.CarbonPriceOracle);
