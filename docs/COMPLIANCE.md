# Compliance notes for operators

> **This is not legal advice.** Carbon credits, tokenised assets and trading platforms are regulated differently in every country, and the rules change. This page lists the **questions you must answer with a qualified local lawyer and your regulator before you let anyone trade.** It does not tell you the answers.

Carbonized is software. Whoever deploys it is the operator and carries the legal responsibility for that deployment.

## What the software does and does not do

| The software does | The software does **not** do |
|---|---|
| Keep an on-chain allowlist of wallets (`kycVerified`) and enforce it on liquidity, swaps, auctions and bids, and on order-book orders that opt in | Verify anyone's identity by itself |
| Let you switch the KYC gate on or off (`setKYCGate`) | Decide who is eligible in your country |
| Restrict credit creation to role-holders | Check that a credit is real, unique or unretired elsewhere |
| Record retirements permanently with a certificate | Make a retirement count under any national scheme |
| Take a configurable trading fee | Handle tax, VAT, reporting or invoicing |
| Include a reference KYC integration (Sumsub, wallet-bound, signed webhooks) | Store, review or guarantee the quality of KYC documents |

## Questions to settle before launch

### Licensing and classification
- Is a marketplace for tokenised carbon credits a regulated activity in your jurisdiction (exchange, trading venue, broker, virtual asset service provider, commodity or environmental-instrument market)?
- Is a credit token a security, a commodity, a financial instrument or an environmental instrument for your regulator?
- Do you need a licence, registration, a local entity, or a local representative?
- Are there limits on offering to retail users, or to residents of specific countries?

### Identity and AML
- Which customer due diligence is mandatory (individuals, companies, beneficial owners)?
- Sanctions and PEP screening, ongoing monitoring, record retention periods.
- Transaction monitoring and suspicious activity reporting duties.
- Travel-rule obligations for transfers of virtual assets.

### Credits and registries
- Which registries and standards do you accept, and under which terms of use?
- Are you allowed to represent a registry credit as a token? Many registries restrict re-tokenisation or require the original credit to be locked or retired.
- How do you prevent **double counting** (the same credit tokenised twice, or tokenised and also retired in the registry)?
- Does a retirement here satisfy any compliance or reporting scheme, or is it voluntary only?

### Consumer and marketing rules
- Claims such as "verified", "audited", "offset" or "net zero" are tightly regulated in many countries. Back every claim with evidence you hold.
- Risk disclosures, terms of service, privacy policy and data-protection duties (identity data is sensitive personal data).

### Custody and operations
- Who controls the admin keys, and what happens if they are lost?
- Incident response, pausing and user communication.
- Insurance and financial resources, if required.

## How to wire the gate in practice

1. Run identity checks off-chain with a provider or process your regulator accepts.
2. When a user passes, the holder of `KYC_ROLE` calls `setKYCStatus(wallet, true)`. When they fail or expire, call it with `false`.
3. Keep `kycGateEnabled` on until your legal position allows otherwise, and remember that order-book orders are only gated when the maker sets `requiresKYC`.
4. Keep evidence off-chain, in a system built for personal data, not in this repository and not on-chain.

## Phasing we recommend

1. **Closed testnet.** Test flows with internal users only.
2. **Controlled mainnet.** Allowlisted participants, gate on, small limits, clear beta disclosure.
3. **Independent audit** of the exact commit you deploy.
4. **Regulatory sign-off** for your jurisdiction.
5. **Wider access.**

Skipping steps 3 and 4 is the most common way projects like this get into trouble.
