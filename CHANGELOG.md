# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added
- Official CARB token contract address on the landing page, in the docs and in the app's Token page.
- `scripts/build-static-pages.mjs` and `worker-static.mjs`: prerendered pages, RSC payloads and segment prefetches are served from static assets, so the Next.js server only runs for APIs and uncached routes. Production CPU-limit errors dropped to zero in load testing.
- `pnpm cf:build` for the Cloudflare Workers production build.
- `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, Dependabot configuration and a CODEOWNERS file.

### Changed
- Marketplace and auction pages scan event history from the configured deploy block instead of a fixed 20,000-block window, so older orders are listed.
- Event log scans run in parallel and cache closed block windows, which makes page-to-page navigation faster.
- Issuer page copy uses plain language instead of raw role names for visitors. Role names stay in the admin panel.
- README rewritten with a credit lifecycle diagram, repository map and a scripts table. The banner now uses the supplied logo unchanged.

### Fixed
- Marketplace showed zero orders once the deployment was older than the scan window.

## [0.1.0]

### Added
- Next.js 16 web app: landing, `/app` dashboard, docs and blog.
- Solidity 0.8.20 contracts: `CarbonCreditNFT`, `CarbonCreditToken`, `CarbonMarketplace`, `CarbonRegistry`, optional oracle and attestation lanes, and the CARB utility stack.
- Hardhat unit, integration and fuzz tests, deployment scripts and a release-manifest gate for mainnet.
- Operator guides: `docs/FORKING.md` and `docs/COMPLIANCE.md`.
