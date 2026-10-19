# Security policy

Carbonized is **controlled-mainnet beta software that has not had an independent audit.** The contracts have had internal reviews, and every confirmed finding from them was fixed in code. That is not a substitute for an independent audit. Do not deploy the contracts with real value, or rely on them, before one has been done.

## Reporting a vulnerability

Please report privately, not through public issues or pull requests.

- Use GitHub's **private vulnerability reporting** on this repository (Security tab, "Report a vulnerability").
- Or message [@CarbonizedApp](https://x.com/CarbonizedApp) and ask for a private channel. Do not include exploit details in public posts.

Include what you found, how to reproduce it, and the impact. We aim to acknowledge reports quickly and will credit you if you wish.

## Scope

In scope: the Solidity contracts under `contracts/contracts` (except mocks), the deployment scripts, and the web app in `src/`.

Out of scope: the mock contracts under `contracts/contracts/tests`, third-party services (Reown, Alchemy, Cloudflare, Robinhood Chain), social engineering, and denial of service.

## For people contributing or forking: keep secrets out of git

This is a public repository. A secret that is committed once is compromised forever, even if you delete it later, because it stays in git history and in every clone.

**Never commit:**

- private keys, seed phrases, keystores, `.pem` / `.key` files
- `.env` or `.env.local` files (only `.env.example`, with empty values, belongs in git)
- API tokens (Cloudflare, GitHub, Sumsub, Reown secrets, database URLs with passwords)
- deployment logs, deployment manifests that name operator wallets, or release approvals
- identity or KYC data of any user

**How this repository defends itself:**

1. `scripts/security-gate.py` scans every tracked file for secret shapes and forbidden file types, and fails closed. It runs in a **pre-commit hook** (lefthook) and in **CI on every pull request**.
2. `.gitignore` excludes env files, keys, logs and deployment artefacts.
3. Mainnet deployment uses a **fresh, single-purpose deployer key** that holds only gas, renounces every role at the end, and is never the admin.

**If you ever commit a secret by mistake:**

1. Treat it as compromised immediately: move funds, rotate or revoke it.
2. Do not just delete the file in a new commit. Removing it from history requires rewriting history and force-pushing, and anyone who already cloned still has it.
3. Tell the maintainers so the repository history can be cleaned.
