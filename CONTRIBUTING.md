# Contributing

Thanks for helping. Carbonized is a small-team open-source project, so please keep changes small and focused.

## Before you start

- Open an issue to discuss anything larger than a small fix.
- Security problems go through [`SECURITY.md`](./SECURITY.md), not public issues.
- If you want to run your own marketplace, start with [`docs/FORKING.md`](./docs/FORKING.md) and [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md).

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Contracts live in `contracts/` (`npm install --ignore-scripts`, then `npx hardhat test`).

## Standards

- Web app: TypeScript, formatted and linted with Biome through Ultracite. Run `pnpm check` and `pnpm typecheck` before committing. New user-facing text needs English copy.
- Contracts: Solidity 0.8.20, OpenZeppelin. Every behavior change needs tests, and tests must run with both 6- and 18-decimal payment tokens where money is involved. Run the full `npx hardhat test`.
- No marketing claims the code does not back (no "audited", "trustless" or return promises).
- Never commit secrets, private keys, `.env` files, deployment logs or identity data.
- Commit messages follow Conventional Commits, header at most 100 characters.

## Pull requests

- One topic per pull request; describe what changed and how you tested it.
- By contributing you agree that your contribution is licensed under the MIT License.
