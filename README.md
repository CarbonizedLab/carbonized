# Carbonized

Open-source architecture for an **onchain carbon credit marketplace**. Credits are issued as NFTs by approved issuers, pooled into fungible tokens per methodology, traded on an order book, in auctions and in an AMM, and permanently retired with a public certificate.

Live deployment: [carbonized.app](https://carbonized.app) on Robinhood Chain.

> **Status: controlled mainnet beta, unaudited.** The reference deployment runs on Robinhood Chain (chain id `4663`) with USDG settlement, a KYC gate and a Safe wallet as admin. No independent security audit has been completed. Do not treat anything here as audited, and do not treat listed credits as verified emissions reductions. Read [`SECURITY.md`](./SECURITY.md) before deploying with real value.

## Why this is open source

Carbon markets are national and regulated differently almost everywhere. Rather than one platform trying to be compliant in every country, this repository gives operators a **complete, inspectable base** to run their own marketplace:

- The settlement layer (contracts) is the same everywhere.
- The things that differ by country (who may trade, how identity is verified, which registries and credit types are accepted) are **configuration and operator responsibility**, not code you have to rewrite.

If you want to run a marketplace in your country, you fork, plug in your own identity provider and issuers, get the legal advice and licences your jurisdiction requires, and deploy. See [`docs/FORKING.md`](./docs/FORKING.md) and [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md).

## What is in this repository

| Path | What |
|---|---|
| `src/`, `content/` | Next.js 16 web app: landing, `/app` dashboard, `/docs` (Fumadocs), blog |
| `contracts/` | Solidity 0.8.20 contracts (Hardhat, OpenZeppelin), tests, deploy scripts |
| `docs/` | Guides for operators who want to fork and run their own marketplace |

Core contracts

| Contract | Role |
|---|---|
| `CarbonCreditNFT` | ERC-721 credit, one token per serial number, issued by role-gated issuers |
| `CarbonCreditToken` | Pooled ERC-20 per methodology (`1 token = 1 tonne`) |
| `CarbonMarketplace` | Order book, auctions, AMM, payment-token settlement, KYC gate |
| `CarbonRegistry` | Company and trader profiles, retirement records |
| `CarbonPriceOracle`, `EmissionVerifier`, `RegistrySync` | Optional price and attestation lanes (disabled by default) |

## Quick start

Requirements: Node 22+ and pnpm 10.

```bash
git clone https://github.com/CarbonizedLab/carbonized.git
cd carbonized
pnpm install
cp .env.example .env.local   # then fill in the NEXT_PUBLIC_* variables
pnpm dev                     # http://localhost:3000
```

The web app needs only public `NEXT_PUBLIC_*` variables (network, RPC, contract addresses, Reown project id). Accounts and blog comments are optional and need a Postgres database and Google OAuth; without them those features show a "not enabled" state.

Contracts:

```bash
cd contracts
npm install --ignore-scripts
npx hardhat test          # full suite
```

## Run your own marketplace

1. Read [`docs/FORKING.md`](./docs/FORKING.md): what to change, in what order.
2. Read [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md): what you must settle with your regulator and lawyer **before** you let anyone trade.
3. Rehearse on a testnet with `contracts/scripts/deploy/10_deploy_all.js`.
4. Commission an independent security audit. Mainnet deployment in this repository is gated by an approved release manifest on purpose.

## Contributing and security

- Issues and pull requests are welcome: see [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- Found a vulnerability? Do **not** open a public issue. See [`SECURITY.md`](./SECURITY.md).

## License

MIT. See [`LICENSE`](./LICENSE). The web app started from the MIT-licensed [shadcn-saas-landing](https://github.com/techwithanirudh/shadcn-saas-landing) template by Anirudh; see [`ATTRIBUTION.md`](./ATTRIBUTION.md). The license covers the code, not the Carbonized name or logo; forks should use their own branding.
