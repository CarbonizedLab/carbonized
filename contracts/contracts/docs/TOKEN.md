# CARB — utility token specification

Status: design + implementation spec for the contracts in `contracts/token/`. It is a technical document, **not** an
offer, prospectus, whitepaper or marketing material, and it makes no statement about value, price or returns.

CARB can exist in two modes: **own-token mode** (the repository's `CarbToken` is deployed) and **external-token
mode** (CARB is launched separately through a third-party launchpad and the protocol is attached to its address; see
§9). Statements below apply to both modes unless marked otherwise.

> **Legal notice.** Issuing, distributing, listing or promoting a token can be regulated as an offer of securities,
> a crypto-asset, a commodity or a payment instrument in some jurisdictions (for example under MiCA in the EU, US
> federal and state securities / commodities / money-transmission law, and the rules of any exchange or
> launchpad). Whether CARB falls under any of them depends on facts outside these contracts (who sells it, how it is
> described, what buyers expect). **The owner must obtain qualified legal advice in every jurisdiction in which the
> token will be offered, sold or used, before any launch.** Nothing in this repository is legal advice.

---

## 1. What CARB does (utility)

| # | Utility | Contract | Mechanism |
|---|---|---|---|
| 1 | **Access tiers → trading-fee discount** | `CarbStaking` + `CarbonMarketplace` | Stake CARB, hold a tier (0–3), pay a reduced marketplace fee (discount ≤ 50 % **of the fee**, never more) on order-book and auction sales. No payout of any kind. |
| 2 | **Issuer bond** | `IssuerBond` + `CarbonCreditNFT` | An issuer locks a CARB bond to be granted `ISSUER_ROLE` through the *bond path*. The bond is slashable (burned if the token can burn, otherwise sent to a slash sink; see 3.4) and withdrawable only after a long unbonding delay. |
| 3 | **Parameter governance** | `CarbGovernor` + `CarbTimelock` | CARB holders vote on bounded protocol parameters (fee, min price, KYC gate, discount provider, staking thresholds, bond minimum, slashing). |

### What CARB deliberately does NOT do

- No profit share, revenue share, buy-back, dividend, fee distribution or any other payment to holders or stakers.
- No staking rewards, emissions, inflation, reward token, "APY" or lock-up bonus.
- No rebasing, no reflection, no transfer tax, no mint function, no owner, no pause, no blacklist, no upgradeability on
  the token itself (**own-token mode** only; an external token is outside Carbonized's control, see §9).
- No control over **credit issuance** (the NFT `ISSUER_ROLE` / `ISSUER_ADMIN_ROLE` is never given to governance) and no
  control over **user escrow** (nothing in the marketplace can move escrow; governance holds no role that could).
- No discount on AMM swap fees (those stay with liquidity providers).
- The token is not a claim on carbon credits, on the protocol's treasury, on fees or on any asset.

---

## 2. Contracts

| Contract | Purpose | Key external API |
|---|---|---|
| `CarbToken` | **Own-token mode only.** ERC-20 + ERC-2612 permit + ERC-5805 votes (**timestamp clock**) + burn. Fixed supply minted once in the constructor. | `constructor(address recipient)`, `INITIAL_SUPPLY`, `burn`, `burnFrom`, `delegate`, `clock()`, `CLOCK_MODE()` |
| `CarbVotes` | **External-token mode, when the token has no usable votes.** vCARB: ERC20Votes + ERC20Permit + ERC20Wrapper over the external CARB (§9.3). | `depositFor(address,uint256)`, `withdrawTo(address,uint256)`, `delegate`, `clock()`, `CLOCK_MODE()` |
| `TokenChecks` | Library used by staking, bond and wrapper: `readDecimals`, `pullExact` (§9.2). | internal |
| `CarbStaking` | Tier staking; also the marketplace's `IFeeDiscount` provider. | `stake(uint256)`, `unstake(uint256)`, `withdraw()`, `tierOf(address)`, `discountBps(address)`, `effectiveStake(address)`, `positionOf(address)`, `setTierThresholds(uint256[3])`, `setTierDiscounts(uint16[4])` |
| `IssuerBond` | Bond-gated issuer role, unbonding, dispute window, slashing. | `bond(uint256)`, `startUnbond()`, `withdraw()`, `proposeSlash(address,uint256,string)`, `disputeSlash(uint256,bytes32)`, `cancelSlash(uint256)`, `executeSlash(uint256)`, `setMinBond`, `setBondRequired`, `setSlashTreasury`, `setIssuerBlocked`, `bonds(address)`, `hasActiveSlash(address)` |
| `CarbGovernor` | OpenZeppelin Governor (Settings, CountingSimple, Votes, VotesQuorumFraction, TimelockControl) with bounds and a target allowlist. | standard Governor API + `allowedTargets(address)`, `setTargetAllowed(address,bool)` |
| `CarbTimelock` | `TimelockController` with delay bounds (1 – 30 days). | standard TimelockController API |
| `CarbonMarketplace` (changed) | Adds `PARAMETER_ROLE`, `feeDiscountProvider`, `setFeeDiscountProvider`, `feeDiscountBpsOf`, events `FeeDiscountApplied`, `FeeDiscountProviderUpdated`. | see `ICarbonMarketplace` |
| `CarbonCreditNFT` (changed) | Adds `ISSUER_ADMIN_ROLE` as admin of `ISSUER_ROLE`. | `ISSUER_ADMIN_ROLE()` |
| `IFeeDiscount` | `discountBps(address user) → uint256` (bps *of the fee*, 5000 = 50 % off). | |

OpenZeppelin Contracts **4.9.3** APIs are used. Compiler 0.8.20, `viaIR`, optimizer runs 1 (project settings).
Runtime sizes (limit 24,576 B): CarbToken 8,876 · CarbStaking 6,755 · IssuerBond 10,575 · CarbGovernor 17,731 ·
CarbTimelock 7,610 · CarbonMarketplace 19,752 · CarbonCreditNFT 19,616.

---

## 3. Mechanics

### 3.1 Token
- Supply `INITIAL_SUPPLY = 1_000_000_000e18` is a **parameter chosen by the owner** (change the constant before
  deployment if another supply is wanted). All of it is minted once to `recipient` (use a multisig / treasury). The
  token has 18 decimals. (Own-token mode; an external token brings its own supply and decimals, 0–24.)
- Supply can only decrease, via `burn` / `burnFrom` (holders) and slashing (IssuerBond burns when the token can burn).
- Voting power counts only after `delegate(...)` (self-delegation is enough). Tokens held by `CarbStaking` and
  `IssuerBond` do **not** vote (those contracts delegate nowhere): staking/bonding trades voting power for the tier /
  issuer role. This is intentional; document it in any user-facing text.
- Clock = `block.timestamp` (`CLOCK_MODE = "mode=timestamp"`). Robinhood Chain is an Arbitrum Orbit L2 where
  `block.number` is not a wall-clock proxy, so every governance and timelock duration is in **seconds**.

### 3.2 Staking tiers and flash-stake protection
- `stake` puts CARB in a *pending* bucket. Only *matured* stake (pending that has aged ≥ `WARMUP`) counts for
  `tierOf`. **Choice: warm-up period (default 3 days), not block-count snapshots**, because it is clock-based like the
  rest of the system and cannot be gamed by borrowing capital inside one transaction or one block (tested with a
  contract that stakes and reads its tier in a single tx: no uplift).
- A top-up restarts the age of the pending bucket only; already-matured stake keeps its tier.
- `unstake` takes effect on the tier **immediately** (pending is consumed first, then matured), starts the
  `COOLDOWN` (default 7 days) and a further unstake restarts the cooldown for the whole cooling amount. `withdraw`
  releases cooled tokens. Unstaking twice the same tokens or withdrawing twice reverts.
- Thresholds (tier 1/2/3) and per-tier discounts are changeable through `PARAMETER_ROLE` only, strictly increasing,
  bounded (`1 ≤ t1 < t2 < t3 ≤ 50,000,000` **whole tokens**, i.e. multiples of `10**decimals` in base units via the
  immutable `MIN_THRESHOLD` / `MAX_THRESHOLD`; tier-0 discount 0, non-decreasing, ≤ 5000 bps). `WARMUP`
  (1 h – 14 d) and `COOLDOWN` (1 d – 30 d) are immutable. `stake` pulls an exact amount (§9.2).
- No role can move, freeze or seize staked tokens; there is no rescue function.

### 3.3 Marketplace fee discount
- Optional provider (`feeDiscountProvider`, `address(0)` = off), set by `PARAMETER_ROLE` / admin, must be a contract.
- The fee is always paid by the **CCT seller**: the maker of a sell order, the taker of a buy order, the seller of an
  auction. That party's discount is read at settlement with a `staticcall` limited to 60,000 gas and 32 bytes of
  return data. A provider that reverts, burns gas, returns short / empty data or is not a contract means **no
  discount**; trading is never blocked (tested with five failure modes).
- Discount is clamped to `MAX_FEE_DISCOUNT_BPS = 5000` (50 % of the fee) regardless of what the provider returns.
- **Not retroactive:** the base fee is still snapshotted per order/auction at creation (`orderFeeBps` /
  `auctionFeeBps`); the discount multiplies that snapshot, so it can only lower, never raise, the fee, and later
  `setTradingFee` calls do not touch open orders. Because the discount follows the seller's *current* tier, a seller
  who unstakes stops getting it on fills that happen afterwards.
- `FeeDiscountApplied(payer, discountBps, feeCharged)` is emitted when a discount applies. AMM swap fees are not
  discounted.

### 3.4 Issuer bond (mixed issuer model)
- **Trusted issuers:** the multisig holds the NFT's `ISSUER_ADMIN_ROLE` and grants `ISSUER_ROLE` directly. No bond.
  `IssuerBond` never touches those roles (a trusted issuer that also bonds keeps the role when unbonding).
- **Bonded issuers:** anyone may `bond` ≥ `minBond` CARB; `IssuerBond` (which must hold `ISSUER_ADMIN_ROLE`) grants
  `ISSUER_ROLE`. `bondRequired` is the gate of **this path only**: `true` = path open (minimum enforced), `false` = no
  new bonding (existing bonds can still unbond / be slashed). It never affects trusted issuers.
  *Risk:* an open bond path lets anyone willing to lock the bond mint credits. The bond is a deterrent, not a
  verification. Keep the path closed (`bondRequired=false`) until off-chain verification and an appeals process back
  the slasher.
- `startUnbond` revokes the bond-granted role **immediately**; `withdraw` is possible after `UNBOND_DELAY` (default 30
  days; bounds 7–90) and never while a slash proposal is active.
- **Slashing** (`SLASHER_ROLE`, intended for the governance timelock): `proposeSlash(issuer, amount, reason)` →
  `DISPUTE_WINDOW` (default 7 days; 1–30) → `executeSlash`. During a proposal the issuer cannot start unbonding or
  withdraw. The issuer can `disputeSlash` (records an evidence hash; a disputed proposal then needs a `SLASHER_ROLE`
  holder to execute instead of anyone). Undisputed proposals are executable by anyone after the window (liveness).
  A proposal lapses after a further 14 days, so a vanished slasher cannot lock a bond forever. The slasher can
  `cancelSlash`. Slashed CARB goes, in order, to `slashTreasury` if set; else is **burned** if the token has a working
  `burn(uint256)` (verified by a balance decrease, via try/catch); else is sent to `slashSink` (default
  `0x000000000000000000000000000000000000dEaD`, settable by `PARAMETER_ROLE` via `setSlashSink`, never zero). A slash
  never reverts because of a missing or failing burn. `Slashed(id, issuer, amount, sink, burned)`: `sink = address(0)`
  and `burned = true` when burned, otherwise the actual destination and `burned = false`. If the remaining bond falls
  below `minBond` the bonded role is revoked until topped up. Slashing never reverts because of a missing NFT role.
- `setMinBond` (bounded 1 – 100,000,000 **whole tokens**, scaled by decimals via `MIN_BOND_FLOOR` / `MAX_MIN_BOND`)
  applies to new bonding/top-ups only; existing bonds are grandfathered. `bond` pulls an exact amount (§9.2).
- `setIssuerBlocked` (admin only, not a governance power) bars an address from the bond path, so a multisig-revoked
  issuer cannot simply re-bond.
- **NFT change:** `ISSUER_ROLE`'s admin is now `ISSUER_ADMIN_ROLE`, granted to the deployer in the constructor
  (and administered by `DEFAULT_ADMIN_ROLE`). Existing behaviour is unchanged for a deployer that holds both.
  **Deployment scripts must hand `ISSUER_ADMIN_ROLE` to the multisig and renounce it from the deployer** (add it to
  the NFT role tables in `scripts/lib/deploy-core.js`), otherwise the deployer retains issuer-admin power.

### 3.5 Governance
- `CarbGovernor`: GovernorSettings + CountingSimple (for / against / abstain) + Votes + VotesQuorumFraction +
  TimelockControl. Defaults used by `scripts/lib/governance-setup.js` (all are **owner parameters**, bounded
  onchain): voting delay 1 day, voting period 5 days, proposal threshold 1,000,000 CARB (whole tokens, scaled by
  decimals), quorum 4 % of the votes supply at the snapshot, timelock delay 2 days.
- Hard bounds (re-checked on every update): delay 1 h – 7 d; period 1 – 14 d; threshold ≤ 50,000,000 whole votes-tokens
  (`MAX_PROPOSAL_THRESHOLD`); quorum 1 – 20 %; timelock delay 1 – 30 d.
- **Least privilege:** the timelock holds `PARAMETER_ROLE` on marketplace / staking / bond and `SLASHER_ROLE` on
  bond — nothing else. Defence in depth: proposals may only call allowlisted contracts (marketplace, staking, bond,
  governor, timelock) and may not carry ETH. Even if governance voted to allowlist the NFT, executing an issuance
  grant fails because the timelock holds no NFT role (tested).
- Quorum is a fraction of the **total** supply of the votes token at the snapshot. In own-token mode that includes
  tokens that cannot vote (treasury, staking, bonds); calibrate `quorumPercent` against the real distribution of
  *delegated* tokens or governance will stall. In external-token wrapper mode the votes token is vCARB, so quorum is a
  fraction of the **wrapped** supply (§9.3).

---

## 4. Parameters (owner decisions; defaults are test/launch suggestions, not recommendations)

| Parameter | Where | Default in tests/helpers | Bounds (onchain) | Changeable by |
|---|---|---|---|---|
| Total supply | `CarbToken.INITIAL_SUPPLY` | 1,000,000,000 CARB | constant | redeploy only |
| Warm-up | `CarbStaking.WARMUP` | 3 days | 1 h – 14 d | immutable |
| Cooldown | `CarbStaking.COOLDOWN` | 7 days | 1 d – 30 d | immutable |
| Tier thresholds | `CarbStaking.tierThresholds` | 1,000 / 5,000 / 25,000 CARB (whole tokens) | 1 ≤ t1 < t2 < t3 ≤ 50,000,000 whole tokens | `PARAMETER_ROLE` |
| Tier discounts | `CarbStaking.tierDiscountBps` | 0 / 10 % / 25 % / 50 % of the fee | tier 0 = 0, non-decreasing, ≤ 50 % | `PARAMETER_ROLE` |
| Discount cap | `CarbonMarketplace.MAX_FEE_DISCOUNT_BPS` | 50 % of the fee | constant | redeploy only |
| Discount provider | `CarbonMarketplace.feeDiscountProvider` | staking contract | contract or 0 | `PARAMETER_ROLE` / admin |
| Discount gas cap | `DISCOUNT_GAS_LIMIT` | 60,000 | constant | redeploy only |
| Min bond | `IssuerBond.minBond` | 10,000 CARB (whole tokens) | 1 – 100,000,000 whole tokens | `PARAMETER_ROLE` |
| Unbond delay | `IssuerBond.UNBOND_DELAY` | 30 days | 7 – 90 d | immutable |
| Dispute window | `IssuerBond.DISPUTE_WINDOW` | 7 days | 1 – 30 d | immutable |
| Execution window | `IssuerBond.EXECUTION_WINDOW` | 14 days | constant | redeploy only |
| Bond path open | `IssuerBond.bondRequired` | owner choice (recommend `false` until verification exists) | bool | `PARAMETER_ROLE` |
| Slash treasury | `IssuerBond.slashTreasury` | 0 (= burn, or the sink if the token cannot burn) | any address | `PARAMETER_ROLE` |
| Slash sink | `IssuerBond.slashSink` | `0x…dEaD` | any non-zero address | `PARAMETER_ROLE` (`setSlashSink`) |
| Trading fee | `CarbonMarketplace.tradingFeePercent` | 25 bps | ≤ 100 bps | `PARAMETER_ROLE` / admin |
| Min price | `CarbonMarketplace.minPricePerTonne` | 0.01 USDC | ≤ 1,000,000 USDC | `PARAMETER_ROLE` / admin |
| Voting delay / period | `CarbGovernor` | 1 d / 5 d | 1 h–7 d / 1–14 d | governance |
| Proposal threshold | `CarbGovernor` | 1,000,000 CARB (whole tokens) | ≤ 50,000,000 whole tokens | governance |
| Quorum | `CarbGovernor` | 4 % | 1 – 20 % | governance |
| Timelock delay | `CarbTimelock` | 2 days | 1 – 30 d | governance (self) |

### Distribution / allocation (owner to complete — **no figures are asserted here**)

| Bucket | Share of supply | Vesting / lock | Recipient address | Notes / legal review |
|---|---|---|---|---|
| _to be defined by the owner_ | `{{PERCENT}}` | `{{SCHEDULE}}` | `{{ADDRESS}}` | `{{NOTE}}` |
| _to be defined by the owner_ | `{{PERCENT}}` | `{{SCHEDULE}}` | `{{ADDRESS}}` | `{{NOTE}}` |
| _to be defined by the owner_ | `{{PERCENT}}` | `{{SCHEDULE}}` | `{{ADDRESS}}` | `{{NOTE}}` |

---

## 5. Roles: who holds what

| Contract | Role | Multisig | Timelock (stage ≥ 1) | Notes |
|---|---|---|---|---|
| `CarbonCreditNFT` | `DEFAULT_ADMIN_ROLE`, `ISSUER_ADMIN_ROLE`, `PAUSER_ROLE`, `ORACLE_ROLE`, `VERIFIER_ROLE` | ✔ | ✘ never | issuance stays off-governance |
| `CarbonCreditNFT` | `ISSUER_ADMIN_ROLE` | ✔ | ✘ | also granted to `IssuerBond` |
| `CarbonMarketplace` | `DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`, `KYC_ROLE`, `FEE_MANAGER_ROLE` | ✔ | ✘ | admin is the guardian |
| `CarbonMarketplace` | `PARAMETER_ROLE` | ✔ at stages 0–1 | ✔ | not granted by the constructor |
| `CarbStaking` | `DEFAULT_ADMIN_ROLE` | ✔ | ✘ | |
| `CarbStaking` | `PARAMETER_ROLE` | ✔ at stages 0–1 | ✔ | |
| `IssuerBond` | `DEFAULT_ADMIN_ROLE` | ✔ | ✘ | block-list, role management |
| `IssuerBond` | `PARAMETER_ROLE`, `SLASHER_ROLE` | ✔ at stages 0–1 | ✔ | |

`scripts/lib/governance-setup.js` encodes this table: `deployGovernance`, `governanceRolePlan`,
`applyGovernanceSetup` (stage 1), `handOverToGovernance` (stage 2), `assertGovernanceBoundaries` (fails if the
timelock ever holds a forbidden role).

---

## 6. Staged decentralisation plan

| Stage | State | Multisig | Governance |
|---|---|---|---|
| **0 Bootstrap** | Token launched, staking and (optionally) bond deployed. Marketplace discount provider set by the multisig. | Holds every role incl. `PARAMETER_ROLE` / `SLASHER_ROLE`. | Governor + timelock may be deployed but hold nothing. |
| **1 Dual control** | Voting live; delegation and real turnout observed. | Keeps all roles. | Timelock additionally receives the plan's `PARAMETER_ROLE` / `SLASHER_ROLE` grants (`applyGovernanceSetup`). Parameter changes can pass by vote; the multisig can still act and can revoke the timelock's roles. |
| **2 Governed parameters** | After a trial period without incident and with a sufficiently distributed, delegated supply. | Renounces its own `PARAMETER_ROLE` / `SLASHER_ROLE` (`handOverToGovernance`); keeps `DEFAULT_ADMIN_ROLE` everywhere (guardian), pause, KYC, fee withdrawal, `ISSUER_ADMIN_ROLE`. | Controls the bounded parameters and slashing. |
| **3 Optional** | Only with legal advice and community support. | Moves further low-risk roles (for example `FEE_MANAGER_ROLE` destination, treasury) to the timelock. | **Never** issuance (`ISSUER_*`), oracle writes, or anything able to touch user escrow. |

Emergency powers (`PAUSER_ROLE`) intentionally stay with a fast multisig at every stage; a governance delay of days is
too slow for incident response. Document this as a deliberate centralisation.

---

## 7. Deployment order and checklist

1. `CarbToken(recipient = treasury multisig)`.
2. `CarbStaking(carb, admin = multisig, warmup, cooldown, thresholds, discounts)`.
3. `IssuerBond(carb, nft, admin = multisig, minBond, unbondDelay, disputeWindow, bondRequired, slashTreasury)` and
   `nft.grantRole(ISSUER_ADMIN_ROLE, bond)` (by the NFT admin).
4. `marketplace.setFeeDiscountProvider(staking)` (admin).
5. Stage-0 → 1: `deployGovernance(...)`, `applyGovernanceSetup(...)`, run `assertGovernanceBoundaries(...)`.
6. Update `scripts/lib/deploy-core.js` role tables for `ISSUER_ADMIN_ROLE` (see 3.4) and verify the deployer holds no
   roles afterwards.
7. Verify on the block explorer; publish the parameter table of §4 with the real values.

---

## 8. Risks and limitations

- **Governance capture.** One-token-one-vote. If the owner/treasury or a few holders control most delegated supply,
  governance is theirs. Bounds and the least-privilege timelock limit what a captured vote can do (fee ≤ 1 %,
  discount ≤ 50 %, no issuance, no escrow) but not that it can slash bonded issuers or change KYC-gate / min-price
  parameters.
- **Slashing is a powerful, centralised-by-design lever** and an issuer's loss of a bond is real money. Run it behind
  evidence, a documented appeals path and, at first, the multisig. The dispute flag only forces explicit slasher
  confirmation; it is not adjudication.
- **Open bond path.** See 3.4: a bond is not verification of credit quality.
- **Quorum vs. non-voting supply** (treasury, staked, bonded tokens) can stall governance.
- **Quorum vs. wrapped supply** (external-token wrapper mode). See §9.5.
- **Staked / bonded tokens carry no votes.** Users choosing a tier give up that voting power.
- **Discount follows current tier**, per address. Splitting stake across addresses does not increase the discount;
  wash-trading between own addresses only reduces fee revenue by the discount. Event volume is not a trustworthy
  metric (pre-existing marketplace note).
- **Provider gas bound.** The 60k-gas `staticcall` follows the EIP-150 63/64 rule; a transaction sent with
  barely enough gas could run out of gas after a failed provider call. Use normal gas estimation.
- **Timestamps.** Governance uses `block.timestamp`; on an L2 the sequencer sets it (bounded drift). Durations are
  days, so drift is immaterial, but a sequencer outage delays proposal progress.
- **No upgradeability.** Bugs require migrating to new contracts (the Carbonized contracts, and in own-token mode the token, are immutable by design; an external token may be upgradeable, see §9.5).
- **Single-developer key risk.** Until stage 2 a compromised multisig compromises the parameter set, the issuer
  allowlist and pause. Use a hardware-secured Safe with several independent signers and keep an off-chain runbook.
- **Regulatory.** See the legal notice at the top. Do not describe CARB as an investment, do not imply yield,
  profit, price support or buy-backs, and keep user-facing copy consistent with §1.

---

## 9. External-token mode (CARB launched through a third-party launchpad)

### 9.1 Design
CARB may be launched later through a third-party launchpad, in which case it is an **unknown external ERC-20**, not
`CarbToken`. `CarbStaking`, `IssuerBond` and the governor are then deployed against that address (deploy scripts
accept `CARB_TOKEN_ADDRESS`; `CarbToken` is not deployed and `TREASURY_MULTISIG` is not used). Requirements for the
token: contract code, standard ERC-20 reads, `decimals()` in 0–24, **no fee-on-transfer**, **no rebasing**. A working
`burn(uint256)` is optional (slashing falls back to the sink) and ERC-5805 votes are optional (a wrapper is used).
All amounts in constructors and setters are token **base units**; bounds are defined in **whole tokens** and scaled
by decimals.

### 9.2 `TokenChecks` guarantees and limits
- `readDecimals(token)` reverts `Token has no decimals()` or `Token decimals unsupported` (> 24).
- `pullExact(token, from, amount)` compares the contract's balance before and after and reverts `Received amount
  differs (fee-on-transfer unsupported)` unless exactly `amount` arrived. Used by `CarbStaking.stake`,
  `IssuerBond.bond` and `CarbVotes.depositFor`: **taxed deposits are rejected onchain.**
- Limits: withdrawals are plain transfers, so a tax enabled later hits the recipient, never the protocol's
  accounting. **Rebasing tokens are unsupported**: a negative rebase leaves the contracts short of what they owe.
  The guard does not make a taxable or changeable token safe; it only blocks deposits that would break accounting.
- `CarbStaking` and `IssuerBond` store `tokenDecimals()` (immutable, read at construction, display only).

### 9.3 `CarbVotes` (vCARB)
ERC20Votes + ERC20Permit + ERC20Wrapper over the external CARB. 1:1 `depositFor(account, amount)` (needs prior
approval, exact-amount) and `withdrawTo(account, amount)` at any time; no lock, fee, admin, owner, upgrade or pause;
same decimals; timestamp clock (`mode=timestamp`); reentrancy-guarded. Votes must be delegated (`delegate(self)`) and
count from the next second. CARB held in `CarbStaking` / `IssuerBond` or un-wrapped in a wallet carries **no votes**.

### 9.4 Deploy-flow choice of the governor's votes token
Own-token mode: `CarbToken`. External mode: the external token itself if it is ERC-5805 votes with a **timestamp**
clock (`CARB_VOTES_MODE=auto` resolves to `native`); otherwise a newly deployed `CarbVotes` (`wrapper`). A token with
votes on a block-number clock is wrapped, because governor durations are in seconds.

### 9.5 Security considerations
- **Quorum of wrapped supply.** Quorum is a percentage of the wrapped vCARB supply at the snapshot, not of the CARB
  total supply. A small wrapped supply means a small quorum: a governance-capture risk early on. The proposal
  threshold is an absolute amount.
- **Malicious or upgradeable token.** Owner powers, mint authority, tax and blacklist switches, pausing, upgradeability
  and liquidity-pool locks of the external token are outside Carbonized's control. The contracts cannot protect against a
  token that changes behaviour later (balance freezes, blacklisting of the staking contract, minting that dilutes
  votes, tax on withdrawals). Do not present CARB as backed or controlled by the Carbonized contracts.
- **Admin surface unchanged.** Roles, the timelock's least-privilege boundary, the staged plan (§5, §6) and the
  governance bounds are the same in both modes. External mode adds one admin setting, `setSlashSink`
  (`PARAMETER_ROLE`).
- Fee-on-transfer cannot be simulated read-only; `scripts/deploy/22_attach_token_check.js` flags risks heuristically
  and the contracts enforce exactness onchain. Check this manually before attaching a payment token.
