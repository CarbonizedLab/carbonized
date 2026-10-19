# Forking Carbonized for your own market

This guide is for a team that wants to run its own carbon credit marketplace on this architecture, in its own jurisdiction, under its own brand and its own legal responsibility.

Carbonized the project does **not** operate your marketplace, hold your keys or take responsibility for your compliance. You fork the code; you are the operator.

## What is shared and what is yours

| Layer | Shared (use as is) | Yours to decide |
|---|---|---|
| Credit model | One NFT per serial, pooled ERC-20 per methodology, retirement certificates | Which methodologies and registries you accept |
| Settlement | Order book, auctions, AMM, fees, payment-token handling | Payment token, fee level, minimum price |
| Access control | Role-gated issuers, KYC gate in the marketplace, pausing | **Who** may trade, **how** identity is verified |
| Web app | Marketplace, portfolio, retirement, docs, blog | Brand, language, legal pages, hosting |
| Oracle and attestation | Optional lanes, off by default | Whether you connect any registry or price source |

## Step by step

### 1. Pick a chain and a payment token

The contracts are plain EVM Solidity (0.8.20). They deploy on any EVM chain that has the payment token you want. The reference deployment uses USDG on Robinhood Chain.

Check the payment token before you attach it. `contracts/scripts/verify/check_payment_token.js` inspects decimals, proxy status and unusual behaviours. Tokens with transfer fees, rebasing or blocklists need a deliberate decision.

### 2. Rehearse on a testnet

```bash
cd contracts
npm install --ignore-scripts
npx hardhat test
npx hardhat run scripts/deploy/10_deploy_all.js --network <your-testnet>
```

Run the whole flow end to end: issue, wrap, list, buy, retire. Do this before you spend real gas.

### 3. Decide your identity model

The marketplace holds an on-chain allowlist, `kycVerified[address]`, and a switch, `kycGateEnabled`.

- With the gate **on**, only allowlisted wallets can add liquidity, swap, create auctions or bid.
- Order-book orders are **not** covered by the global gate. A maker opts in per order with the `requiresKYC` flag, and only then must the taker be allowlisted. If you need every order-book trade to be KYC-only, enforce it in your fork (for example by rejecting orders created without the flag) before launch.
- Exiting positions is never gated.
- An account with `KYC_ROLE` calls `setKYCStatus(address,bool)` to add or remove a wallet.

The contracts do not care **how** a wallet earned its place on the list. That is your identity process. The web app includes one reference integration (Sumsub, wallet-bound, with signed webhooks) in `src/server/kyc/`. You can keep it, replace it with a local provider, or run a manual process. Whatever you choose, an identity check is performed **off-chain by you**; the chain only stores the yes or no.

### 4. Decide who may issue

Credits can only be created by an address holding `NATIVE_ISSUER_ROLE` on the NFT contract. At deployment you pass `ISSUER_ADDRESS`. Treat issuer onboarding as a legal and operational process: who they are, what they may issue, and how you verify the underlying credit.

Do not list demo or unverified credits next to real ones without clear labels. The reference deployment labels its demo inventory with a `CBZ-SEED-` serial and a `demo_inventory` attribute for exactly this reason.

### 5. Put administration behind a real multisig

The deploy script refuses an admin address that is not a contract. For anything with real value use a multisig with at least two independent signers and hardware wallets. A single-signer wallet is acceptable only for a rehearsal.

### 6. Deploy with the release gate

Real deployments need an approved release manifest binding the exact git commit and an audit report hash. That gate is deliberate. Replace the example manifest with your own approval process; do not weaken the check to save time.

```bash
cd contracts
MAINNET_USDG=0x... ADMIN_MULTISIG=0x... ISSUER_ADDRESS=0x... \
RELEASE_MANIFEST=./your-manifest.json \
npx hardhat run scripts/deploy/20_deploy_mainnet.js --network <your-network>      # dry run
```

Add `CONFIRM_MAINNET=yes` to broadcast. The script re-reads every role from chain and fails on the first mismatch. The final check proves the deployer holds nothing.

### 7. Configure the web app

```bash
node contracts/scripts/update-carb-env.js --network <your-network> --env-file ./.env.local
```

This writes the `NEXT_PUBLIC_*` contract addresses. Then set your own RPC, Reown project id and app URL (see `.env.example`).

### 8. Make it yours

- Replace the name, logo, domains and social links. The MIT license covers the code, **not** the Carbonized name or logo.
- Rewrite the legal pages, risk disclosures and the banner text so they describe **your** deployment truthfully.
- Review `content/` (blog and docs): much of it describes the reference deployment and must not be copied as if it were yours.

## What not to do

- Do not claim your deployment is audited until an independent firm has audited **your** exact commit.
- Do not describe credits as verified emissions reductions unless you have verified them.
- Do not deploy to production with a single-signer admin.
- Do not store identity documents on-chain or in the public repository.
