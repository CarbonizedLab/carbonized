const fs = require('fs');
const path = require('path');

// Read Sepolia deployment
const deploymentPath = path.join(__dirname, '../../deployments/sepolia.json');

if (!fs.existsSync(deploymentPath)) {
  console.error('❌ Deployment file not found. Deploy to Sepolia first:');
  console.error('   npm run deploy:sepolia');
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const contracts = deployment.contracts;

console.log('📝 Verifying contracts on Sepolia Etherscan...\n');

const verifyCommands = [
  {
    name: 'CarbonCreditNFT',
    address: contracts.CarbonCreditNFT,
    args: []
  },
  {
    name: 'CarbonCreditToken (VERRA_VCS)',
    address: contracts.CarbonCreditTokens.VERRA_VCS,
    args: [
      '"Carbonized Credit - Verra"',
      '"CCT-VCS"',
      contracts.CarbonCreditNFT,
      '"VERRA_VCS"'
    ]
  },
  {
    name: 'CarbonMarketplace',
    address: contracts.CarbonMarketplace,
    args: [
      contracts.USDC,
      contracts.CarbonCreditTokens.VERRA_VCS,
      contracts.CarbonCreditNFT
    ]
  },
  {
    name: 'EmissionVerifier',
    address: contracts.EmissionVerifier,
    args: [
      deployment.chainlink.functionsRouter,
      contracts.CarbonCreditNFT
    ]
  },
  {
    name: 'RegistrySync',
    address: contracts.RegistrySync,
    args: [
      deployment.chainlink.functionsRouter,
      contracts.CarbonCreditNFT
    ]
  },
  {
    name: 'CarbonPriceOracle',
    address: contracts.CarbonPriceOracle,
    args: [
      deployment.chainlink.functionsRouter
    ]
  }
];

console.log('Copy and run these commands:\n');

verifyCommands.forEach(contract => {
  const argsString = contract.args.length > 0 
    ? ` ${contract.args.join(' ')}` 
    : '';
    
  console.log(`# ${contract.name}`);
  console.log(`npx hardhat verify --network sepolia ${contract.address}${argsString}`);
  console.log('');
});

console.log('Or verify on Etherscan web interface:');
console.log('https://sepolia.etherscan.io/verifyContract');
