# Security policy

## Status

Carbonized is **controlled-mainnet beta software that has not had an independent audit.** The contracts have had internal reviews; every confirmed finding from that review was fixed in code, and the proof-of-concept tests were converted into regression tests. That review is not a substitute for an independent audit. Do not deploy the contracts with real value, or rely on them, before one has been done.

## Reporting a vulnerability

Please report privately, not through public issues or pull requests:

- Use GitHub's **private vulnerability reporting** on this repository (Security tab, "Report a vulnerability"), or
- email the maintainer at the address on the maintainer's GitHub profile.

Include the affected file or contract, a description, steps or a proof of concept, and the impact you expect. You will get an acknowledgement as soon as the maintainer can respond; this is a solo-maintained project, so response times are best effort. There is **no bug bounty** at this time.

## Scope

In scope: the Solidity contracts in `contracts/contracts`, the deploy scripts in `contracts/scripts`, and the web app in `src/`.

Out of scope: the mock contracts under `contracts/contracts/tests` (testnet only), third-party services (Reown, Alchemy, Vercel, Robinhood Chain), social engineering, denial of service by volume, and issues that need a compromised admin or multisig key (note them as centralization risks instead).

## Safe handling

- Do not test against other users' funds or accounts.
- Do not publish details before a fix is available or 90 days have passed, whichever comes first.
- Never commit private keys, RPC keys or `.env` files. Rotate anything that was exposed.
