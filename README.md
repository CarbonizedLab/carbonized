<p align="center">
  <img src="https://raw.githubusercontent.com/CarbonizedLab/carbonized/main/public/banner.png" alt="Carbonized: carbon credits, issued and retired onchain" width="100%">
</p>

<p align="center">
  <a href="https://carbonized.app">Website</a> ·
  <a href="https://carbonized.app/docs">Docs</a> ·
  <a href="./docs/FORKING.md">Fork it</a> ·
  <a href="./SECURITY.md">Security</a> ·
  <a href="https://x.com/CarbonizedApp">X</a>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-4ade80?style=flat-square&labelColor=000"></a>
  <img alt="Solidity 0.8.20" src="https://img.shields.io/badge/solidity-0.8.20-4ade80?style=flat-square&labelColor=000">
  <img alt="Next.js 16" src="https://img.shields.io/badge/next.js-16-4ade80?style=flat-square&labelColor=000">
  <img alt="Robinhood Chain 4663" src="https://img.shields.io/badge/chain-robinhood%204663-4ade80?style=flat-square&labelColor=000">
  <img alt="Status: unaudited" src="https://img.shields.io/badge/status-unaudited-lightgrey?style=flat-square&labelColor=000">
</p>

# Carbonized

An open-source **onchain marketplace for carbon credits**. A credit is issued by an approved issuer as an NFT, can be pooled into a fungible token per methodology, is traded on an order book or in an auction, and is finally **retired** with a public certificate. Every step is an onchain record anyone can follow.

> **Unaudited software.** The reference deployment is a controlled mainnet release on Robinhood Chain (chain id `4663`) with USDG settlement, a KYC gate and a Safe as admin. No independent security audit has been completed. A credit here is a token created by an approved issuer: the contracts check formats and uniqueness, not facts about the underlying project. Read [`SECURITY.md`](./SECURITY.md) before deploying anything with real value.

## How a credit moves

<p align="center">
  <img src="https://raw.githubusercontent.com/CarbonizedLab/carbonized/main/public/how-a-credit-moves.png" alt="How a credit moves: issue, pool, trade and retire, with the onchain record created at each step" width="100%">
</p>

| Step | What happens | Contract |
| --- | --- | --- |
| Issue | A role-gated issuer mints one NFT per registry serial with an evidence hash. A serial can be tokenized once. | `CarbonCreditNFT` |
| Pool | Eligible credits that match a methodology can be wrapped 1:1 by tonne into a fungible token. | `CarbonCreditToken` |
| Trade | Order book and timed auctions, settled in the payment token, with an optional KYC gate. | `CarbonMarketplace` |
| Record | Company and trader profiles, plus permanent retirement records. | `CarbonRegistry` |
| Retire | The credit is burned and a certificate is stored onchain. | `CarbonCreditNFT` |

Optional lanes (price oracle, emission attestation, registry sync) are off by default: `CarbonPriceOracle`, `EmissionVerifier`, `RegistrySync`. A CARB utility stack (`CarbStaking`, `IssuerBond`, `CarbGovernor`, `CarbTimelock`, `CarbVotes`) exists for fee tiers, an optional issuer bond and bounded parameter governance. It is not live yet.

## Repository layout

```
.
├── src/                 Next.js 16 app: landing, /app dashboard, /docs, blog
├── content/             Docs (Fumadocs MDX) and blog posts
├── contracts/           Solidity 0.8.20, Hardhat, OpenZeppelin
│   ├── contracts/       core/ token/ oracle/ interfaces/
│   ├── test/            unit/ integration/ fuzzing/
│   └── scripts/         deploy, verify and release tooling
├── docs/                Guides for teams forking the project
├── scripts/             Security gate, link checks, static page build
└── drizzle/             Optional accounts and comments schema
```

## Quick start

Requirements: Node 22+ and pnpm 10.

```bash
git clone https://github.com/CarbonizedLab/carbonized.git
cd carbonized
pnpm install
cp .env.example .env.local   # fill in the NEXT_PUBLIC_* variables
pnpm dev                     # http://localhost:3000
```

The app only needs public `NEXT_PUBLIC_*` variables: network, RPC, contract addresses and a Reown project id. Accounts and blog comments are optional and need Postgres and Google OAuth; without them those features show a "not enabled" state.

### Contracts

The Hardhat suite (unit, integration and fuzz tests) currently reports **595 passing, 0 failing** on a clean run.

```bash
cd contracts
npm install --ignore-scripts
npx hardhat compile
npm run test:unit
npm run test:integration
npm run test:fuzzing
```

### Useful scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local dev server |
| `pnpm check` / `pnpm typecheck` | Lint (Biome via Ultracite) and TypeScript |
| `pnpm check:links` / `pnpm check:spelling` | Docs link and spelling checks |
| `python3 scripts/security-gate.py` | Fails if secrets, keys or internal files are tracked |
| `pnpm cf:build` | Production build for Cloudflare Workers, with prerendered pages as static assets |

## Official CARB contract

| | |
| --- | --- |
| Token | CARB |
| Network | Robinhood Chain (`4663`) |
| Address | [`0x48d134b04238ab7fb9134e6fc47149c39f3d022c`](https://robinhoodchain.blockscout.com/address/0x48d134b04238ab7fb9134e6fc47149c39f3d022c) |

CARB is an external token that Carbonized does not control. Any other address attributed to CARB is not ours. Its utilities are not live yet.

## Run your own marketplace

Carbon markets are regulated differently in almost every country, so this repository is a **complete, inspectable base** rather than one platform trying to comply everywhere. The settlement layer is shared. Who may trade, how identity is verified and which registries and credit types you accept are configuration and operator responsibility.

1. Read [`docs/FORKING.md`](./docs/FORKING.md): what to change, in what order.
2. Read [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md): what to settle with your regulator and lawyer before anyone trades.
3. Rehearse on a testnet with `contracts/scripts/deploy/10_deploy_all.js`.
4. Commission an independent security audit. Mainnet deployment here is gated by an approved release manifest on purpose.

## Contributing and security

- Issues and pull requests are welcome. Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- Found a vulnerability? Do **not** open a public issue. See [`SECURITY.md`](./SECURITY.md).
- Release history lives in [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT, see [`LICENSE`](./LICENSE). The web app started from the MIT-licensed [shadcn-saas-landing](https://github.com/techwithanirudh/shadcn-saas-landing) template; see [`ATTRIBUTION.md`](./ATTRIBUTION.md). The license covers the code, not the Carbonized name or logo: forks should use their own branding.
