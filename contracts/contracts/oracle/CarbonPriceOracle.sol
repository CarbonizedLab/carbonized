// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./FunctionsConsumer.sol";

/**
 * @title CarbonPriceOracle
 * @notice Price feed for carbon credits per methodology, fed by Chainlink Functions with a multisig
 *         manual-reporter fallback.
 *
 * ## Units
 * Prices are USD per tonne with 8 decimals (1 USD = 1e8), exactly as before. Volumes are USD with 8 decimals.
 *
 * ## Chainlink Functions path
 * The JavaScript is admin-uploaded (`setSource`, see `FunctionsConsumer`; reference file
 * `scripts/functions/price.js`). The contract builds the request arguments onchain:
 *
 *   args[0]    methodology (one of `methodologies`)
 *   args[1]    `maxSourceSpreadBps` as a decimal string
 *   args[2..]  the admin-configured `priceSourceUrls` (1..MAX_PRICE_SOURCES operator-provided https URL templates;
 *              the data sources are NOT hard-coded, `{methodology}` is substituted by the script)
 *
 * The DON must answer with exactly 128 bytes, `abi.encode(uint256 price, uint256 volume24h, uint256 confidence,
 * uint256 dataPoints)`:
 *   price       USD/tonne, 8 decimals, must be within [minPrice, maxPrice]
 *   volume24h   USD, 8 decimals, <= type(uint128).max
 *   confidence  0..100, share of the configured sources that answered; must be >= minConfidence
 *   dataPoints  number of sources aggregated, 1..MAX_PRICE_SOURCES
 * Anything else (error bytes, other length, out-of-range value) is dropped and `PriceRequestFailed` is emitted;
 * the callback never reverts on DON output.
 *
 * ## Manual fallback
 * Accounts with `ORACLE_REPORTER_ROLE` (a multisig; never granted at construction, the admin grants it) may post
 * a price with `reportPrice` so the marketplace does not depend on Functions availability. A report must be
 * a fresh observation (<= MAX_REPORT_AGE old), inside [minPrice, maxPrice], at least MIN_REPORT_SPACING after
 * the previous price of that methodology, and - when the previous price is still fresh (younger than
 * `maxStaleness`) - within `maxReportDeviationBps` of it. A stale or missing previous price has no deviation
 * anchor, so recovery after an outage is possible with an in-bounds price. Reports emit `PriceReported`
 * (and `PriceUpdated`), and `lastPriceManual(methodology)` tells whether the current price is manual.
 *
 * ## Integrity rules
 * - every request id is bound to the methodology it was sent for; the answer is stored under THAT methodology
 *   only (AUD-ORACLE-04), unknown / replayed request ids are rejected;
 * - `getLatestPrice` reverts on missing data or data older than `maxStaleness`;
 * - history is available through `PriceUpdated` events (no unbounded onchain array);
 * - the admin-set `updateInterval` is never overwritten; volatility only shortens the EFFECTIVE interval
 *   (`currentUpdateInterval`).
 * No contract currently consumes this oracle onchain; if one does, it must use `getLatestPrice` (staleness
 * checked) and never `getPrice`.
 *
 * Roles use OpenZeppelin AccessControl and can be granted to a multisig (`grantRole`).
 */
contract CarbonPriceOracle is FunctionsConsumer, AutomationCompatibleInterface {
    // ============ ROLES ============
    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER_ROLE");
    bytes32 public constant AUTOMATION_ROLE = keccak256("AUTOMATION_ROLE");
    /// @notice Multisig allowed to post prices manually (fallback when Functions is unavailable).
    bytes32 public constant ORACLE_REPORTER_ROLE = keccak256("ORACLE_REPORTER_ROLE");

    // ============ LIMITS ============
    uint256 public constant MIN_UPDATE_INTERVAL = 5 minutes;
    uint256 public constant MAX_UPDATE_INTERVAL = 24 hours;
    /// @notice Effective interval while any methodology is in high-volatility mode.
    uint256 public constant FAST_UPDATE_INTERVAL = 15 minutes;
    uint256 public constant MIN_STALENESS = 1 hours;
    uint256 public constant MAX_STALENESS = 7 days;
    /// @notice Hard ceiling for `maxPrice` (8 decimals): 10 million USD per tonne.
    uint256 public constant PRICE_CEILING = 1e15;
    /// @notice A Functions request may query at most this many sources (the DON allows 5 HTTP requests per run).
    uint256 public constant MAX_PRICE_SOURCES = 5;
    /// @notice Largest accepted `volume24h`.
    uint256 public constant MAX_VOLUME = type(uint128).max;
    /// @notice A manual report may describe an observation at most this old.
    uint256 public constant MAX_REPORT_AGE = 1 hours;
    /// @notice Minimum time between two prices of the same methodology accepted through `reportPrice`
    ///         (stops a reporter from walking the price by repeated max-deviation steps in one block).
    uint256 public constant MIN_REPORT_SPACING = 5 minutes;
    uint256 public constant BPS = 10_000;

    // ============ STATE VARIABLES ============

    /// @notice Price data structure
    struct PriceData {
        uint256 price;              // Price per tonne in USD (8 decimals)
        uint256 timestamp;          // block time the price was stored
        uint256 volume24h;          // 24h trading volume, USD (8 decimals)
        uint8 confidence;           // 0-100 confidence score (manual reports: 100)
        uint256 dataPoints;         // Number of sources aggregated (manual reports: 1)
    }

    /// @notice Methodology-specific pricing
    mapping(string => PriceData) public prices;      // "VERRA_VCS" => price

    string[] public methodologies = ["ICM_COMPLIANCE", "VERRA_VCS", "GOLD_STANDARD"];
    mapping(string => bool) public isSupportedMethodology;

    /// @notice Request id => methodology the request was sent for (cleared on fulfilment)
    mapping(bytes32 => string) public requestMethodology;

    /// @notice Operator-provided https URL templates queried by the Functions source (admin-set).
    string[] public priceSourceUrls;
    /// @notice Max allowed spread between the highest and lowest source (bps of the median); passed to the source.
    uint256 public maxSourceSpreadBps = 2000;

    /// @notice Admin-set base interval between automated updates (never modified by fulfilments)
    uint256 public updateInterval = 1 hours;
    uint256 public lastUpdateTime;
    uint256 public highVolatilityThreshold = 10; // 10% price change triggers fast updates

    /// @notice Per-methodology high-volatility flag and how many are currently flagged
    mapping(string => bool) public isVolatile;
    uint256 public volatileCount;

    // Sanity bounds for accepted answers (8 decimals, USD per tonne)
    uint256 public minPrice = 1e6;   // 0.01 USD
    uint256 public maxPrice = 1e12;  // 10,000 USD
    uint8 public minConfidence = 60; // e.g. >= 2 of the 3 configured sources must have answered
    uint256 public maxStaleness = 24 hours;

    /// @notice Max change (bps) of a manual report versus a still-fresh previous price.
    uint256 public maxReportDeviationBps = 1000; // 10%
    /// @notice The stored price of this methodology came from `reportPrice` (false: from Functions).
    mapping(string => bool) public lastPriceManual;

    // ============ EVENTS ============
    event PriceUpdated(
        string indexed methodology,
        uint256 price,
        uint256 volume24h,
        uint8 confidence,
        uint256 timestamp
    );

    /// @notice Manual fallback report (also emits `PriceUpdated`).
    event PriceReported(
        string indexed methodology,
        address indexed reporter,
        uint256 price,
        uint256 volume24h,
        uint256 observedAt
    );

    event HighVolatilityDetected(
        string indexed methodology,
        uint256 oldPrice,
        uint256 newPrice,
        uint256 changePercent
    );

    event PriceRequestFailed(string indexed methodology, string reason);

    event PriceRequested(bytes32 indexed requestId, string indexed methodology);

    event PriceSourcesUpdated(string[] urls);
    event MaxSourceSpreadChanged(uint256 maxSourceSpreadBps);
    event UpdateIntervalChanged(uint256 interval);
    event VolatilityThresholdChanged(uint256 threshold);
    event PriceBoundsChanged(uint256 minPrice, uint256 maxPrice);
    event MinConfidenceChanged(uint8 minConfidence);
    event MaxStalenessChanged(uint256 maxStaleness);
    event MaxReportDeviationChanged(uint256 maxReportDeviationBps);

    // ============ CONSTRUCTOR ============
    constructor(address functionsRouter_) FunctionsConsumer(functionsRouter_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PRICE_UPDATER_ROLE, msg.sender);

        for (uint256 i = 0; i < methodologies.length; i++) {
            isSupportedMethodology[methodologies[i]] = true;
        }
    }

    // ============ CHAINLINK AUTOMATION ============

    function checkUpkeep(bytes calldata /* checkData */)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        upkeepNeeded = (block.timestamp - lastUpdateTime) >= currentUpdateInterval();
        performData = "";
    }

    function performUpkeep(bytes calldata /* performData */)
        external
        override
        onlyRole(AUTOMATION_ROLE)
    {
        // Re-validate: performData is untrusted and upkeeps may be triggered late/twice.
        require((block.timestamp - lastUpdateTime) >= currentUpdateInterval(), "Update not due");
        _updateAllPrices();
    }

    /// @notice Interval the automation actually uses: the admin interval, shortened while any
    ///         methodology is in high-volatility mode.
    function currentUpdateInterval() public view returns (uint256) {
        if (volatileCount > 0 && FAST_UPDATE_INTERVAL < updateInterval) return FAST_UPDATE_INTERVAL;
        return updateInterval;
    }

    // ============ PRICE UPDATE FUNCTIONS (CHAINLINK FUNCTIONS) ============

    function updatePrice(string memory methodology)
        external
        onlyRole(PRICE_UPDATER_ROLE)
    {
        _requestPriceUpdate(methodology);
    }

    function updateAllPrices() external onlyRole(PRICE_UPDATER_ROLE) {
        _updateAllPrices();
    }

    function _updateAllPrices() internal {
        for (uint256 i = 0; i < methodologies.length; i++) {
            _requestPriceUpdate(methodologies[i]);
        }
        lastUpdateTime = block.timestamp;
    }

    function _requestPriceUpdate(string memory methodology) internal {
        require(isSupportedMethodology[methodology], "Unsupported methodology");
        uint256 sourceCount = priceSourceUrls.length;
        require(sourceCount > 0, "No price sources");

        // args: [methodology, maxSourceSpreadBps, url_1 ... url_n]
        string[] memory args = new string[](2 + sourceCount);
        args[0] = methodology;
        args[1] = Strings.toString(maxSourceSpreadBps);
        for (uint256 i = 0; i < sourceCount; i++) {
            args[2 + i] = priceSourceUrls[i];
        }

        bytes32 requestId = _sendFunctionsRequest(args);
        require(bytes(requestMethodology[requestId]).length == 0, "Duplicate request id");

        // Bind the request id to its methodology
        requestMethodology[requestId] = methodology;

        emit PriceRequested(requestId, methodology);
    }

    /**
     * @notice Chainlink Functions callback.
     * @dev Expects `abi.encode(uint256 price, uint256 volume24h, uint256 confidence, uint256 dataPoints)`
     *      (128 bytes, see the contract NatSpec). Reverts only for unknown / replayed request ids; every
     *      other bad answer is dropped with `PriceRequestFailed`.
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        string memory methodology = requestMethodology[requestId];
        require(bytes(methodology).length > 0, "Unknown request");
        delete requestMethodology[requestId];

        if (err.length > 0) {
            emit PriceRequestFailed(methodology, string(err));
            return;
        }
        if (response.length != 128) {
            emit PriceRequestFailed(methodology, "Malformed response");
            return;
        }

        (uint256 price, uint256 volume, uint256 confidence, uint256 dataPoints) =
            abi.decode(response, (uint256, uint256, uint256, uint256));

        // Sanity checks: never store garbage as the "latest price"
        if (price < minPrice || price > maxPrice) {
            emit PriceRequestFailed(methodology, "Price out of bounds");
            return;
        }
        if (confidence > 100 || volume > MAX_VOLUME || dataPoints == 0 || dataPoints > MAX_PRICE_SOURCES) {
            emit PriceRequestFailed(methodology, "Invalid response");
            return;
        }
        if (confidence < minConfidence) {
            emit PriceRequestFailed(methodology, "Confidence too low");
            return;
        }

        lastPriceManual[methodology] = false;
        _storePrice(methodology, price, volume, uint8(confidence), dataPoints);
    }

    // ============ MANUAL FALLBACK ============

    /**
     * @notice Post a price manually (multisig fallback when Chainlink Functions is unavailable).
     * @dev Checks: supported methodology; `observedAt` not in the future and at most MAX_REPORT_AGE old;
     *      price within [minPrice, maxPrice]; volume bounded; at least MIN_REPORT_SPACING after the previous
     *      price of the methodology; and, if that previous price is younger than `maxStaleness`, a change of
     *      at most `maxReportDeviationBps` versus it. Consumers keep using `getLatestPrice` / `getPrice`.
     * @param methodology One of `methodologies`.
     * @param price USD per tonne, 8 decimals.
     * @param volume24h 24h volume in USD, 8 decimals (0 if unknown).
     * @param observedAt Unix time of the underlying observation.
     */
    function reportPrice(
        string calldata methodology,
        uint256 price,
        uint256 volume24h,
        uint256 observedAt
    ) external onlyRole(ORACLE_REPORTER_ROLE) {
        require(isSupportedMethodology[methodology], "Unsupported methodology");
        require(observedAt <= block.timestamp && block.timestamp - observedAt <= MAX_REPORT_AGE, "Stale report");
        require(price >= minPrice && price <= maxPrice, "Price out of bounds");
        require(volume24h <= MAX_VOLUME, "Volume out of bounds");

        PriceData storage last = prices[methodology];
        if (last.timestamp != 0) {
            require(block.timestamp >= last.timestamp + MIN_REPORT_SPACING, "Report too soon");
            if (block.timestamp - last.timestamp < maxStaleness) {
                require(_changeBps(last.price, price) <= maxReportDeviationBps, "Deviation too large");
            }
        }

        lastPriceManual[methodology] = true;
        _storePrice(methodology, price, volume24h, 100, 1);

        emit PriceReported(methodology, msg.sender, price, volume24h, observedAt);
    }

    // ============ SHARED STORAGE PATH ============

    /// @dev Volatility bookkeeping (per methodology; never touches the admin interval), then store and emit.
    function _storePrice(
        string memory methodology,
        uint256 price,
        uint256 volume,
        uint8 confidence,
        uint256 dataPoints
    ) private {
        uint256 oldPrice = prices[methodology].price;
        bool volatileNow = false;
        if (oldPrice > 0) {
            uint256 changePercent = _calculateChangePercent(oldPrice, price);
            if (changePercent >= highVolatilityThreshold) {
                volatileNow = true;
                emit HighVolatilityDetected(methodology, oldPrice, price, changePercent);
            }
        }
        if (volatileNow && !isVolatile[methodology]) {
            isVolatile[methodology] = true;
            volatileCount++;
        } else if (!volatileNow && isVolatile[methodology]) {
            isVolatile[methodology] = false;
            volatileCount--;
        }

        // Update price (history = PriceUpdated events)
        prices[methodology] = PriceData({
            price: price,
            timestamp: block.timestamp,
            volume24h: volume,
            confidence: confidence,
            dataPoints: dataPoints
        });

        emit PriceUpdated(methodology, price, volume, confidence, block.timestamp);
    }

    // ============ VIEW FUNCTIONS ============

    function getPrice(string memory methodology)
        external
        view
        returns (uint256 price, uint256 timestamp)
    {
        PriceData memory data = prices[methodology];
        return (data.price, data.timestamp);
    }

    function getPriceData(string memory methodology)
        external
        view
        returns (PriceData memory)
    {
        return prices[methodology];
    }

    function getLatestPrice(string memory methodology)
        external
        view
        returns (uint256)
    {
        require(prices[methodology].timestamp > 0, "Price not available");
        require(block.timestamp - prices[methodology].timestamp < maxStaleness, "Price too stale");
        return prices[methodology].price;
    }

    function getPriceSources() external view returns (string[] memory) {
        return priceSourceUrls;
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @notice Set the operator-provided data source URL templates the Functions source queries.
     * @dev 1..MAX_PRICE_SOURCES entries, each `https://...` (<= MAX_REQUEST_ARG_LENGTH bytes). Each endpoint
     *      must return JSON `{"price": <USD/tonne>, "volume24h": <USD, optional>}` (see scripts/functions/README.md);
     *      the literal `{methodology}` in a template is replaced by the script.
     */
    function setPriceSources(string[] calldata urls) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(urls.length > 0 && urls.length <= MAX_PRICE_SOURCES, "Invalid source count");
        for (uint256 i = 0; i < urls.length; i++) {
            _requireHttpsUrl(urls[i]);
        }
        delete priceSourceUrls;
        for (uint256 i = 0; i < urls.length; i++) {
            priceSourceUrls.push(urls[i]);
        }
        emit PriceSourcesUpdated(urls);
    }

    /// @notice Max spread between sources (bps of the median) the Functions source tolerates: 1%..50%.
    function setMaxSourceSpread(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps >= 100 && bps <= 5000, "Invalid spread");
        maxSourceSpreadBps = bps;
        emit MaxSourceSpreadChanged(bps);
    }

    function setUpdateInterval(uint256 interval)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(interval >= MIN_UPDATE_INTERVAL && interval <= MAX_UPDATE_INTERVAL, "Invalid interval");
        updateInterval = interval;
        emit UpdateIntervalChanged(interval);
    }

    function setVolatilityThreshold(uint256 threshold)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(threshold > 0 && threshold <= 50, "Invalid threshold");
        highVolatilityThreshold = threshold;
        emit VolatilityThresholdChanged(threshold);
    }

    /// @notice Accepted price range (8 decimals, USD per tonne).
    function setPriceBounds(uint256 minPrice_, uint256 maxPrice_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(minPrice_ > 0 && minPrice_ < maxPrice_ && maxPrice_ <= PRICE_CEILING, "Invalid bounds");
        minPrice = minPrice_;
        maxPrice = maxPrice_;
        emit PriceBoundsChanged(minPrice_, maxPrice_);
    }

    function setMinConfidence(uint8 minConfidence_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(minConfidence_ > 0 && minConfidence_ <= 100, "Invalid confidence");
        minConfidence = minConfidence_;
        emit MinConfidenceChanged(minConfidence_);
    }

    function setMaxStaleness(uint256 maxStaleness_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(maxStaleness_ >= MIN_STALENESS && maxStaleness_ <= MAX_STALENESS, "Invalid staleness");
        maxStaleness = maxStaleness_;
        emit MaxStalenessChanged(maxStaleness_);
    }

    /// @notice Max change of a manual report versus a fresh previous price: 0.1%..50% (bps).
    function setMaxReportDeviation(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps >= 10 && bps <= 5000, "Invalid deviation");
        maxReportDeviationBps = bps;
        emit MaxReportDeviationChanged(bps);
    }

    function grantAutomationRole(address automationRegistry)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _grantRole(AUTOMATION_ROLE, automationRegistry);
    }

    // ============ UTILITIES ============

    function _calculateChangePercent(uint256 oldPrice, uint256 newPrice)
        internal
        pure
        returns (uint256)
    {
        return _changeBps(oldPrice, newPrice) / 100;
    }

    /// @dev |newPrice - oldPrice| / oldPrice in basis points (0 if `oldPrice` is 0).
    function _changeBps(uint256 oldPrice, uint256 newPrice) internal pure returns (uint256) {
        if (oldPrice == 0) return 0;

        uint256 diff = oldPrice > newPrice ? oldPrice - newPrice : newPrice - oldPrice;
        return (diff * BPS) / oldPrice;
    }
}
