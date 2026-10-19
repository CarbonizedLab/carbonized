# Carbonized smart contracts

Solidity 0.8.20 contracts for the Carbonized carbon credit marketplace, built with Hardhat and OpenZeppelin.

| Contract | Purpose |
|---|---|
| `CarbonCreditNFT` | ERC-721 credit with project data, double-counting protection and retirement certificates |
| `CarbonCreditToken` | ERC-20 pooled token (one per methodology) backed 1:1 by wrapped NFTs |
| `CarbonMarketplace` | order book, auctions and AMM pool, settled in USDC, with a minimum price |
| `CarbonRegistry` | company / trader registry, emissions totals, KYB verification flag |
| `CarbonPriceOracle`, `EmissionVerifier`, `RegistrySync` | Chainlink Functions integrations (mocked on testnet) |

Full reference: the **Smart contracts** section of the docs in this repository (`/docs/contracts`).

## Use

```bash
cd contracts
npm install --ignore-scripts
npx hardhat compile
npx hardhat test
```

Deploy (Robinhood Chain Testnet, id 46630): create `.env` from the variables below, fund the deployer from the testnet faucet, then run `npx hardhat run scripts/deploy/10_deploy_all.js --network robinhood` (testnet; mainnet uses `20_deploy_mainnet.js` and `21_deploy_token_mainnet.js`, see `DEPLOY.md`), followed by `npm run update:carb` to write the addresses into the web app's `.env.local` (repository root).

```
PRIVATE_KEY=<testnet deployer key, never commit>
ROBINHOOD_RPC=https://rpc.testnet.chain.robinhood.com/rpc
```

`deployments/robinhood.json` records the public addresses and deploy blocks. The contracts are **not audited**; oracle and USDC are mocks on testnet.
