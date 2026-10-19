# Chainlink Functions for the Carbonized oracle layer

`CarbonPriceOracle`, `EmissionVerifier` and `RegistrySync` are Chainlink Functions consumers
(`contracts/oracle/FunctionsConsumer.sol`). The JavaScript that runs on the DON is **not** embedded in Solidity any more:
the admin uploads it with `setSource(string)` and the contract exposes `source()` and `sourceHash()`.

| File | Contract | Purpose |
| --- | --- | --- |
| `price.js` | `CarbonPriceOracle` | median price of 1..5 operator-provided sources |
| `emission.js` | `EmissionVerifier` | emission measurement of a project, optional cross-check |
| `registry-check.js` | `RegistrySync` | status of a credit serial at an external registry |
| `sources.js` | | `loadSource(name)`, `sourceHashOf(text)`, `SOURCE_FOR_CONTRACT` (text to upload and its hash) |
| `simulate.js` | | runs the sources locally against a mock HTTP server and decodes the bytes like the contracts |
| `lib/runtime.js`, `lib/mock-server.js` | | the simulation engines (toolkit or shim) and the mock server (node `http`) |

No data source is hard-coded. Every URL is **operator-provided** and stored onchain by an admin (or by a project registrar for
a project). Below, `PRICE_API_URL`, `IOT_API_URL`, `CROSS_CHECK_API_URL` and `REGISTRY_API_URL` are placeholders for
the endpoints your operator chooses. The contracts do not know or assume any provider.

## Chainlink availability on Robinhood Chain - verify first

**This repository does not assume that Chainlink Functions (or Automation) is live on Robinhood Chain (chain id 4663).**
Before any deployment, check Chainlink's official documentation for the target chain
(<https://docs.chain.link/chainlink-functions/supported-networks>) and take from it, for that exact chain:

- the **Functions Router address** (constructor argument of the three contracts),
- the **DON id** (`bytes32`, e.g. the encoded string Chainlink lists, argument of `setFunctionsConfig`),
- the LINK token address, the subscription registry and the maximum callback gas limit / request size of that DON.

None of these values appear in this repository. If Functions is not available on the chain:

- `CarbonPriceOracle` keeps working through the manual reporter fallback (`reportPrice`, below),
- `EmissionVerifier` and `RegistrySync` cannot run; credits are then issued only through the NFT's separate `NATIVE_ISSUER_ROLE` path. External registry credits must remain disabled because their attestation path is unavailable.

## What each contract sends and expects

Arguments are built **onchain** from validated state; the response is decoded strictly (any other length / out-of-range value
is recorded as a failure and never changes a price, a verdict or mints a credit).

### `price.js` - `CarbonPriceOracle`

| args | |
| --- | --- |
| `args[0]` | methodology (`ICM_COMPLIANCE`, `VERRA_VCS`, `GOLD_STANDARD`) |
| `args[1]` | `maxSourceSpreadBps` (admin, default 2000 = 20 %) - largest allowed spread between sources |
| `args[2..]` | the URL templates set with `setPriceSources(string[])` (1..5, `https://`, `{methodology}` is substituted) |

Each source endpoint must answer HTTP 200 with JSON `{ "price": <USD per tonne>, "volume24h": <USD, optional> }`
(numbers or decimal strings). If your provider uses another schema, put a thin adapter you operate in front of it.

Response, 128 bytes `abi.encode(uint256 price, uint256 volume24h, uint256 confidence, uint256 dataPoints)`:
price = USD/tonne with **8 decimals** (median of the valid sources), volume24h = USD with 8 decimals, confidence =
`round(100 * validSources / configuredSources)`, dataPoints = number of valid sources. Onchain checks: price within
`[minPrice, maxPrice]`, `confidence >= minConfidence`, `dataPoints` in 1..5.

### `emission.js` - `EmissionVerifier`

| args | |
| --- | --- |
| `args[0]` | project id |
| `args[1]` | `project.iotEndpoint`: primary measurement URL template (`https://`, set by the registrar in `registerProject`) |
| `args[2]` | `project.satelliteRegion`: optional cross-check URL template (`""` = none). Legacy field name; it holds a URL |
| `args[3]` | `crossCheckToleranceBps` (admin, default 1500 = 15 %) |
| `args[4]`, `args[5]` | measurement window start (`lastVerificationTime`) and end (request time), unix seconds |

`{projectId}`, `{from}` and `{to}` are substituted in both templates. Each endpoint must answer HTTP 200 with JSON
`{ "tonnesCO2e": <emissions of the window in tonnes CO2e> }` on the same time basis as the project's onchain baseline.

Response, 64 bytes `abi.encode(uint256 measuredEmissions, uint256 confidence)`: tonnes CO2e with **18 decimals** (the higher of the
two sources when both are used) and confidence 100 (two sources agree) or 70 (single source). Credits can only be claimed at
confidence >= 90 (`MIN_CLAIM_CONFIDENCE`), so a project without a cross-check URL is measured but never minted.

### `registry-check.js` - `RegistrySync`

| args | |
| --- | --- |
| `args[0]` | registry name |
| `args[1]` | serial number |
| `args[2]` | the registry's `apiEndpoint`: `https://` URL template containing `{serial}` (admin: `addRegistry` / `setRegistryEndpoint`) |

The endpoint must answer HTTP 404 for an unknown serial and otherwise HTTP 200 with JSON `{ "status": "ACTIVE" | "RETIRED" }`.
Response, 32 bytes `abi.encode(uint256 status)`: `0` NOT_FOUND, `1` ACTIVE, `2` RETIRED. The three default registries
(`VERRA`, `GOLD_STANDARD`, `ICM`) are created **inactive and without endpoint**: call `setRegistryEndpoint(name, REGISTRY_API_URL)` and then
`setRegistryStatus(name, true)`.

## Setup steps

1. **Verify the chain** (section above) and collect the Router address and DON id from Chainlink's docs.
2. **Deploy** the contracts with the Router address as constructor argument (done by the deploy scripts).
3. **Create and fund a Functions subscription** (<https://functions.chain.link> or the toolkit's `SubscriptionManager`:
   `createSubscription`, `fundSubscription` with LINK, `addConsumer`). The subscription id is a `uint64`.
4. **Add the three contracts as consumers** of that subscription (`EmissionVerifier`, `RegistrySync`, `CarbonPriceOracle`).
   A request from a contract that is not a consumer reverts at the router.
5. **Configure each contract** (admin = multisig after handoff, so do it before handing over or through the multisig):

   ```js
   await oracle.setFunctionsConfig(DON_ID_FROM_CHAINLINK_DOCS, SUBSCRIPTION_ID, 300000); // callback gas 200k..1M
   ```

   The callback gas limit must not exceed what the DON/router allows (see the DON's `maxCallbackGasLimits` in the docs);
   measured callback cost is about 140k (price, registry) and 165k (emission) gas.
6. **Upload the sources** and check the hash:

   ```js
   const { loadSource, sourceHashOf } = require("./scripts/functions/sources");
   await oracle.setSource(loadSource("price"));       // CarbonPriceOracle
   await verifier.setSource(loadSource("emission"));  // EmissionVerifier
   await sync.setSource(loadSource("registry"));      // RegistrySync
   // anyone can verify what runs: contract.sourceHash() === sourceHashOf(loadSource(name))
   ```

   `node scripts/functions/sources.js` prints size and hash of each source. The text is limited to 16,000 bytes
   (`MAX_SOURCE_LENGTH`); the references are about 1.2-2.5 KB. A source change emits `SourceUpdated(sourceHash, length)`;
   requests already in flight keep the source they were sent with.
7. **Provide the data sources** (operator decisions, not defaults): `oracle.setPriceSources([PRICE_API_URL_1, ...])`
   (and optionally `setMaxSourceSpread`), `verifier.registerProject(..., IOT_API_URL, CROSS_CHECK_API_URL, ...)`
   (and optionally `setCrossCheckTolerance`), `sync.setRegistryEndpoint(name, REGISTRY_API_URL)` +
   `sync.setRegistryStatus(name, true)`.
8. **Automation** (if available on the chain): register a time-based or custom-logic upkeep for `CarbonPriceOracle` and
   `EmissionVerifier`, then `grantAutomationRole(forwarderAddress)`.
9. **Hand the admin / operational roles to the multisig** and verify nobody else holds them. `ORACLE_REPORTER_ROLE` is never
   granted by a constructor: the admin grants it to the reporting multisig.

## Secrets (optional, DON-hosted)

The reference sources need **no secrets**. If a provider requires an API key:

1. Encrypt and upload the secrets to the DON with the toolkit's `SecretsManager`
   (`encryptSecrets({ apiKey, allowedUrlPrefix })`, `uploadEncryptedSecretsToDON({ ..., slotId, minutesUntilExpiration })`).
   The upload returns a `version`.
2. Attach them to every request of a contract: `contract.setDONHostedSecrets(slotId, version)` (admin).
   `version = 0` detaches them. Secrets expire (`minutesUntilExpiration`): upload again and set the new version.
3. The sources read these optional keys: `secrets.apiKey` (sent as `Authorization: Bearer <key>`, or in the header named
   `secrets.apiKeyHeader` as the raw key) and **`secrets.allowedUrlPrefix`**. The key is only sent to URLs that start with
   `allowedUrlPrefix`. For `EmissionVerifier` the URLs come from project registrars, so always set `allowedUrlPrefix` to
   the single host that deserves the key. One key per request is supported; use an adapter for several providers.

Remote (URL-hosted) encrypted secrets are not supported by these contracts; only the DON-hosted reference (`slotId` + `version`) is.

## Manual reporter fallback (price)

`CarbonPriceOracle.reportPrice(methodology, price, volume24h, observedAt)` for `ORACLE_REPORTER_ROLE` (a multisig). It needs
no Functions configuration. Checks: observation not older than 1 hour and not in the future, price within
`[minPrice, maxPrice]`, at least 5 minutes after the previous price of that methodology, and if the previous price is fresh
(younger than `maxStaleness`) a change of at most `maxReportDeviationBps` (default 10 %, admin-tunable 0.1-50 %).
A stale or missing previous price has no anchor, so the feed can be restarted after an outage. Events: `PriceReported` and
`PriceUpdated`; `lastPriceManual(methodology)` tells whether the current price is manual. Consumers keep using
`getLatestPrice` / `getPrice` / `getPriceData`.

## Local simulation

```bash
node scripts/functions/simulate.js              # price, emission and registry against a local mock HTTP server
node scripts/functions/simulate.js price
FUNCTIONS_ENGINE=shim node scripts/functions/simulate.js   # force the built-in shim
```

The engine is `@chainlink/functions-toolkit` `simulateScript` when `deno` is on the `PATH` (the toolkit requires Deno),
otherwise a minimal in-process shim of `Functions.makeHttpRequest` / `encodeUint256` / `encodeInt256` / `encodeString` with the
documented limits (5 HTTP requests, 256-byte response, 10 s). The shim is **not** a sandbox and does not replace a simulation in
the Chainlink Functions playground against your real endpoints. The endpoints used by the script (`https://price-a.test/...`)
are demo fixtures served by the local process, not real data sources.

`test/functions/simulate-e2e.test.js` proves the format: it takes the source and arguments out of the request a contract sends,
runs them, and feeds the simulated bytes into the contract's fulfil path through `MockFunctionsRouter`.

## Limits worth knowing

- A run may make at most 5 HTTP requests (hence at most 5 price sources), the response is limited to 256 bytes and an error
  payload is limited as well; the onchain decoders reject anything that is not exactly the documented length.
- The callback only stores data (price / measurement / verdict). Minting credits is a separate transaction
  (`EmissionVerifier.claimCredits`) because it costs more than a Functions callback may use.
- The simulation uses plain `fetch`; on a DON, HTTP behaviour (timeouts, redirects, allowed content) follows Chainlink's
  runtime. Simulate against your real endpoints before relying on them.
