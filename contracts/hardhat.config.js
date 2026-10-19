require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-contract-sizer");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("dotenv").config();

/** PRIVATE_KEY from .env, with or without the 0x prefix; no accounts when unset (read-only networks). */
const deployerAccounts = process.env.PRIVATE_KEY
  ? [process.env.PRIVATE_KEY.startsWith("0x") ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`]
  : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
      evmVersion: "paris",
      viaIR: true, // Enable IR-based code generation for better optimization
    },
  },

  networks: {
    // Local development
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: true,  // Allow large contracts for local testing
      forking: {
        url: process.env.POLYGON_MAINNET_RPC || "",
        enabled: false,
      },
      accounts: {
        count: 20,
        accountsBalance: "10000000000000000000000", // 10,000 ETH
      },
    },

    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      allowUnlimitedContractSize: true,  // Allow large contracts for local testing
    },

    // Testnets
    mumbai: {
      url: process.env.POLYGON_MUMBAI_RPC || "https://rpc-mumbai.maticvigil.com",
      chainId: 80001,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 30000000000, // 30 gwei
      gas: 8000000,
    },

    sepolia: {
      url: process.env.SEPOLIA_RPC || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 20000000000, // 20 gwei
    },

    // Mainnets
    polygon: {
      url: process.env.POLYGON_MAINNET_RPC || "https://polygon-rpc.com",
      chainId: 137,
      accounts: process.env.MAINNET_PRIVATE_KEY ? [process.env.MAINNET_PRIVATE_KEY] : [],
      gasPrice: 50000000000, // 50 gwei
    },

    // Robinhood Chain testnet (mock USDC / mock Functions router; scripts/deploy/10_deploy_all.js)
    robinhood: {
      url: process.env.ROBINHOOD_RPC || "https://rpc.testnet.chain.robinhood.com/rpc",
      chainId: 46630,
      accounts: deployerAccounts,
    },

    // Robinhood Chain MAINNET (real USDC / real Functions router; scripts/deploy/20_deploy_mainnet.js).
    // Fallback RPC: https://robinhood-rpc.publicnode.com (set ROBINHOOD_MAINNET_RPC to use it).
    robinhoodMainnet: {
      url: process.env.ROBINHOOD_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts: deployerAccounts,
    },

    arbitrum: {
      url: process.env.ARBITRUM_RPC || "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts: process.env.MAINNET_PRIVATE_KEY ? [process.env.MAINNET_PRIVATE_KEY] : [],
    },
  },

  etherscan: {
    apiKey: {
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      arbitrumOne: process.env.ARBISCAN_API_KEY || "",
      // Blockscout ignores the key but hardhat-verify needs a non-empty value.
      robinhood: process.env.BLOCKSCOUT_API_KEY || "blockscout",
      robinhoodMainnet: process.env.BLOCKSCOUT_API_KEY || "blockscout",
    },
    customChains: [
      {
        network: "robinhood",
        chainId: 46630,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com",
        },
      },
      {
        network: "robinhoodMainnet",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com",
        },
      },
    ],
  },

  sourcify: {
    enabled: false,
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || "",
    token: "MATIC",
    gasPriceApi: "https://api.polygonscan.com/api?module=proxy&action=eth_gasPrice",
    outputFile: "gas-report.txt",
    noColors: true,
    excludeContracts: ["test/", "mock/"],
  },

  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: false,  // Allow contracts over size limit for local testing
    only: ["CarbonCredit", "Marketplace", "Verifier", "Oracle"],
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 200000, // 200 seconds for Chainlink oracle tests
    parallel: false,
  },
};
