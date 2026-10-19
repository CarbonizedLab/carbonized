#!/usr/bin/env node

/**
 * Update Frontend .env.local with Localhost Deployment Addresses
 * Run after: npx hardhat run scripts/deploy/01_deploy_local.js --network localhost
 */

const fs = require('fs');
const path = require('path');

const DEPLOYMENT_FILE = path.join(__dirname, '../deployments/localhost.json');
const ENV_EXAMPLE = path.join(__dirname, '../frontend/.env.example');
const ENV_FILE = path.join(__dirname, '../frontend/.env.local');

console.log('🔄 Updating frontend .env.local with localhost addresses...\n');

if (!fs.existsSync(DEPLOYMENT_FILE)) {
  console.error('❌ deployments/localhost.json not found. Run redeploy.bat first.');
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8'));
const c = deployment.contracts;

// Use VERRA_VCS - this is the token the CarbonMarketplace trades
const carbonCreditToken = c.CarbonCreditTokens?.VERRA_VCS || c.CarbonCreditToken;
const usdcAddress = c.MockUSDC || c.USDC;

const envVars = {
  NEXT_PUBLIC_NETWORK: 'hardhat',
  NEXT_PUBLIC_CHAIN_ID: '31337',
  NEXT_PUBLIC_RPC_URL: 'http://127.0.0.1:8545',
  NEXT_PUBLIC_CARBON_CREDIT_NFT: c.CarbonCreditNFT,
  NEXT_PUBLIC_CARBON_CREDIT_TOKEN: carbonCreditToken,
  NEXT_PUBLIC_CARBON_MARKETPLACE: c.CarbonMarketplace,
  NEXT_PUBLIC_CARBON_PRICE_ORACLE: c.CarbonPriceOracle,
  NEXT_PUBLIC_EMISSION_VERIFIER: c.EmissionVerifier,
  NEXT_PUBLIC_USDC_ADDRESS: usdcAddress,
  NEXT_PUBLIC_BACKEND_URL: 'http://localhost:4000',
};

let content = '';
if (fs.existsSync(ENV_EXAMPLE)) {
  content = fs.readFileSync(ENV_EXAMPLE, 'utf8');
  for (const [key, value] of Object.entries(envVars)) {
    const regex = new RegExp(`^(${key})=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `$1=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
} else {
  content = Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

fs.writeFileSync(ENV_FILE, content.trim() + '\n');

console.log('✅ frontend/.env.local updated');
console.log('   CarbonCreditToken (VERRA_VCS):', carbonCreditToken);
console.log('   CarbonMarketplace:', c.CarbonMarketplace);
console.log('   USDC:', usdcAddress);
console.log('');
