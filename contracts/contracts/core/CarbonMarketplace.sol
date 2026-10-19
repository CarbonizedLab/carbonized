// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./CarbonCreditToken.sol";
import "./CarbonCreditNFT.sol";
import "../interfaces/IFeeDiscount.sol";

/**
 * @title CarbonMarketplace
 * @notice Hybrid order book + AMM for carbon credit trading
 * @dev Supports both OTC enterprise trades and retail liquidity pools
 *
 * Features:
 * - Order book for large OTC trades (enterprises)
 * - Timed auctions (bounded duration, pull-payment fallback)
 * - AMM pool for retail liquidity (locked minimum liquidity, proportional deposits, slippage params)
 * - KYC gating for compliance trades (order-book opt-in; optional global gate for AMM + auctions)
 *
 * PRICE UNITS
 * - CCT has 18 decimals; 1 tonne = 1e18 CCT base units.
 * - Every price in this contract (`pricePerTonne`, `minPricePerTonne`, `getPrice()`, `ammPool.lastPrice`)
 *   is expressed in PAYMENT-TOKEN BASE UNITS PER TONNE, i.e. 10**paymentDecimals == 1 USD for a USD stablecoin.
 *   With 6-decimal USDC, $15 / tonne is 15_000_000; with an 18-decimal token it is 15e18.
 *   Cost of `amount` CCT base units = amount * pricePerTonne / 1e18 (payment-token base units).
 * - `startPrice` / bids of an auction are TOTAL amounts in payment-token base units.
 *
 * ROLES (OpenZeppelin AccessControl; every role can be granted to a multisig / timelock)
 * - DEFAULT_ADMIN_ROLE: fee, min price, KYC-gate parameters, role management. Hand it to a multisig and
 *   renounce the deployer's roles after deployment.
 * - PARAMETER_ROLE: the governance-grade subset of the above: `setTradingFee`, `setMinPricePerTonne`,
 *   `setKYCGate`, `setFeeDiscountProvider` (all hard-bounded). Not granted at construction; the admin grants it
 *   to a governance timelock. It cannot pause, manage roles, set KYC status, withdraw fees or touch escrow.
 * - FEE_MANAGER_ROLE: `withdrawFees` only (can only ever move tracked `accruedFees`, never escrow).
 * - KYC_ROLE: `setKYCStatus`. PAUSER_ROLE: `pause` / `unpause`. MATCHER_ROLE: reserved.
 *
 * FEE DISCOUNT (optional, e.g. CARB staking tiers)
 * - `feeDiscountProvider` (address(0) = off) implements `IFeeDiscount.discountBps(user)`: the share of the fee
 *   waived. The order-book / auction fee is always paid by the CCT SELLER (maker of a sell order, taker of a
 *   buy order, seller of an auction); that party's discount is read once at settlement with a gas-bounded
 *   `staticcall`. A provider that reverts, runs out of gas or returns garbage means "no discount".
 * - The discount is clamped to MAX_FEE_DISCOUNT_BPS (50%) and applies to the fee SNAPSHOTTED on the order /
 *   auction at creation, so it can only ever lower, never raise, what a user was promised. AMM swap fees stay in
 *   the pool for LPs and are NOT discounted.
 *
 * KYC
 * - Orders created with `requiresKYC_` can only be filled by KYC'd takers and only while the maker is still
 *   KYC'd (re-checked at fill time). A revoked maker can still cancel and withdraw.
 * - AMM and auctions are open (non-KYC) by default; the admin can switch `kycGateEnabled` to require
 *   KYC for addLiquidity / swap / createAuction / placeBid. Exits (remove liquidity, cancel, finalize, claim)
 *   are never gated. KYC does not follow the CCT token once it is transferred.
 */
contract CarbonMarketplace is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ ROLES ============
    bytes32 public constant MATCHER_ROLE = keccak256("MATCHER_ROLE");
    bytes32 public constant KYC_ROLE = keccak256("KYC_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
    bytes32 public constant PARAMETER_ROLE = keccak256("PARAMETER_ROLE");

    // ============ STATE VARIABLES ============

    /// @notice Supported payment token (USDC/USDT)
    IERC20 public immutable paymentToken;

    /// @notice Carbon credit token being traded
    CarbonCreditToken public immutable carbonToken;

    /// @notice NFT contract for direct NFT trades
    CarbonCreditNFT public immutable nftContract;

    /// @notice Decimals of the payment token (read once at deployment)
    uint8 public immutable paymentDecimals;

    /// @notice Order structure
    struct Order {
        uint256 orderId;
        address trader;
        bool isBuyOrder;          // true = buy, false = sell
        uint256 amount;           // CCT tokens or NFT count
        uint256 pricePerTonne;    // payment-token base units per tonne (1e18 CCT base units)
        uint256 filled;           // amount filled
        bool isActive;
        uint256 createdAt;
        uint256 expiresAt;
        bool requiresKYC;         // for compliance trades
    }

    /// @notice Auction structure
    struct Auction {
        uint256 auctionId;
        address seller;
        uint256 amount;           // CCT tokens
        uint256 startPrice;       // total bid amount in payment-token base units
        uint256 highestBid;       // total bid amount in payment-token base units
        address highestBidder;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
    }

    /// @notice AMM pool state
    struct Pool {
        uint256 carbonReserve;    // CCT balance
        uint256 stableReserve;    // USDC balance
        uint256 totalLPTokens;    // Liquidity provider tokens (includes the permanently locked MINIMUM_LIQUIDITY)
        uint256 lastPrice;        // Last trade price (payment-token base units per tonne)
        uint256 lastUpdate;
    }

    // ============ MAPPINGS ============
    mapping(uint256 => Order) public orders;
    mapping(uint256 => Auction) public auctions;
    mapping(address => bool) public kycVerified;
    mapping(address => uint256) public lpTokens;       // LP token balances (address(0) = locked minimum liquidity)
    mapping(address => uint256[]) public userOrders;   // user => orderIds
    mapping(address => uint256[]) public userAuctions; // user => auctionIds

    /// @notice Trading fee (bps) snapshotted when an order was created; fee changes are not retroactive
    mapping(uint256 => uint256) public orderFeeBps;
    /// @notice Trading fee (bps) snapshotted when an auction was created; fee changes are not retroactive
    mapping(uint256 => uint256) public auctionFeeBps;
    /// @notice Payment-token amounts that could not be pushed to a recipient (e.g. USDC-blacklisted); see `claim`
    mapping(address => uint256) public pendingWithdrawals;

    Pool public ammPool;
    uint256 public nextOrderId = 1;
    uint256 public nextAuctionId = 1;
    uint256 public tradingFeePercent = 25;  // 0.25% (in basis points)
    uint256 public constant FEE_DENOMINATOR = 10000;
    /// @notice Hard cap on the admin-configurable trading fee (1%)
    uint256 public constant MAX_TRADING_FEE = 100;

    /// @notice Order-book and auction fees accrued and not yet withdrawn (payment-token base units).
    /// @dev AMM swap fees are not tracked here: they stay in the pool reserves and accrue to LPs.
    uint256 public accruedFees;

    /// @notice 1 tonne in CCT base units (CCT has 18 decimals, asserted in the constructor)
    uint256 public constant CARBON_UNIT = 1e18;

    /// @notice Minimum price per tonne accepted for orders/auctions, in payment-token base units
    uint256 public minPricePerTonne;
    /// @notice Hard cap on the admin-configurable minimum price: 1,000,000 payment-token units / tonne
    uint256 public immutable MAX_MIN_PRICE_PER_TONNE;
    /// @notice Initial minimum price: 0.01 payment-token units / tonne (10**(decimals-2))
    uint256 public immutable DEFAULT_MIN_PRICE_PER_TONNE;
    /// @notice Sanity cap on any order/auction price: 1e9 payment-token units / tonne. Rejects prices entered
    ///         with the wrong decimal scale (e.g. 1e18-scaled prices against a 6-decimal USDC).
    uint256 public immutable MAX_PRICE_PER_TONNE;

    /// @notice LP shares permanently locked on the first deposit (anti share-inflation)
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    /// @notice Auction duration bounds (endTime - block.timestamp at creation)
    uint256 public constant MIN_AUCTION_DURATION = 1 hours;
    uint256 public constant MAX_AUCTION_DURATION = 30 days;

    /// @notice If true, addLiquidity / swap / createAuction / placeBid require `kycVerified[msg.sender]`
    bool public kycGateEnabled;

    /// @notice Optional fee-discount provider (`IFeeDiscount`); address(0) = no discounts
    address public feeDiscountProvider;
    /// @notice Hard cap on any fee discount: 50% of the (snapshotted) base fee
    uint256 public constant MAX_FEE_DISCOUNT_BPS = 5000;
    /// @notice Gas forwarded to the discount provider per query
    uint256 public constant DISCOUNT_GAS_LIMIT = 60_000;

    // ============ EVENTS ============
    event OrderCreated(
        uint256 indexed orderId,
        address indexed trader,
        bool isBuyOrder,
        uint256 amount,
        uint256 pricePerTonne
    );

    event OrderFilled(
        uint256 indexed orderId,
        address indexed taker,
        uint256 amountFilled,
        uint256 totalCost
    );

    event OrderCancelled(uint256 indexed orderId);

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        uint256 amount,
        uint256 startPrice,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 bidAmount
    );

    event AuctionFinalized(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 winningBid
    );

    event AuctionCancelled(uint256 indexed auctionId);

    event LiquidityAdded(
        address indexed provider,
        uint256 carbonAmount,
        uint256 stableAmount,
        uint256 lpTokens
    );

    event LiquidityRemoved(
        address indexed provider,
        uint256 carbonAmount,
        uint256 stableAmount,
        uint256 lpTokens
    );

    event Swap(
        address indexed trader,
        bool carbonToStable,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );

    event KYCStatusUpdated(address indexed user, bool status);
    event KYCGateUpdated(bool enabled);
    event MinPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event TradingFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);
    /// @notice A payment could not be pushed and was credited to `pendingWithdrawals` instead
    event PaymentDeferred(address indexed to, uint256 amount);
    event PaymentClaimed(address indexed to, uint256 amount);
    event FeeDiscountProviderUpdated(address indexed oldProvider, address indexed newProvider);
    /// @notice `payer` (the CCT seller) received a fee discount of `discountBps` (bps of the fee) on a settlement
    event FeeDiscountApplied(address indexed payer, uint256 discountBps, uint256 feeCharged);

    // ============ MODIFIERS ============

    /// @dev Optional global KYC gate for the AMM and auction entry points (off by default).
    modifier kycGate() {
        if (kycGateEnabled) {
            require(kycVerified[msg.sender], "KYC required");
        }
        _;
    }

    /// @dev Governance-grade parameter gate: PARAMETER_ROLE (e.g. a timelock) or the DEFAULT_ADMIN_ROLE holder.
    modifier onlyParameterAdmin() {
        if (!hasRole(PARAMETER_ROLE, msg.sender)) _checkRole(DEFAULT_ADMIN_ROLE);
        _;
    }

    // ============ CONSTRUCTOR ============
    constructor(
        address paymentToken_,
        address carbonToken_,
        address nftContract_
    ) {
        require(paymentToken_ != address(0), "Invalid payment token");
        require(carbonToken_ != address(0), "Invalid carbon token");
        require(nftContract_ != address(0), "Invalid NFT contract");

        uint8 decimals_ = IERC20Metadata(paymentToken_).decimals();
        require(decimals_ >= 2 && decimals_ <= 18, "Unsupported payment decimals");
        require(IERC20Metadata(carbonToken_).decimals() == 18, "Carbon token must have 18 decimals");

        paymentToken = IERC20(paymentToken_);
        carbonToken = CarbonCreditToken(carbonToken_);
        nftContract = CarbonCreditNFT(nftContract_);
        paymentDecimals = decimals_;

        uint256 unit = 10 ** uint256(decimals_);
        DEFAULT_MIN_PRICE_PER_TONNE = unit / 100;      // 0.01 USD per tonne
        MAX_MIN_PRICE_PER_TONNE = 1_000_000 * unit;    // 1,000,000 USD per tonne
        MAX_PRICE_PER_TONNE = 1_000_000_000 * unit;    // 1,000,000,000 USD per tonne

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MATCHER_ROLE, msg.sender);
        _grantRole(KYC_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(FEE_MANAGER_ROLE, msg.sender);

        minPricePerTonne = unit / 100;
    }

    // ============ ORDER BOOK FUNCTIONS ============

    /**
     * @notice Create a buy order (bid)
     * @param amount CCT base units to buy
     * @param pricePerTonne Price per tonne in payment-token base units
     * @param expiresIn Seconds until order expires (0 = never)
     * @param requiresKYC_ If true, only KYC users can fill
     */
    function createBuyOrder(
        uint256 amount,
        uint256 pricePerTonne,
        uint256 expiresIn,
        bool requiresKYC_
    ) external whenNotPaused nonReentrant returns (uint256 orderId) {
        require(amount > 0, "Invalid amount");
        require(pricePerTonne >= minPricePerTonne, "Price below minimum");
        require(pricePerTonne <= MAX_PRICE_PER_TONNE, "Price above maximum");

        if (requiresKYC_) {
            require(kycVerified[msg.sender], "KYC required");
        }

        uint256 totalCost = (amount * pricePerTonne) / CARBON_UNIT;
        paymentToken.safeTransferFrom(msg.sender, address(this), totalCost);

        orderId = nextOrderId++;
        uint256 expiresAt = expiresIn > 0 ? block.timestamp + expiresIn : type(uint256).max;

        orders[orderId] = Order({
            orderId: orderId,
            trader: msg.sender,
            isBuyOrder: true,
            amount: amount,
            pricePerTonne: pricePerTonne,
            filled: 0,
            isActive: true,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            requiresKYC: requiresKYC_
        });
        orderFeeBps[orderId] = tradingFeePercent;

        userOrders[msg.sender].push(orderId);

        emit OrderCreated(orderId, msg.sender, true, amount, pricePerTonne);

        return orderId;
    }

    /**
     * @notice Create a sell order (ask)
     */
    function createSellOrder(
        uint256 amount,
        uint256 pricePerTonne,
        uint256 expiresIn,
        bool requiresKYC_
    ) external whenNotPaused nonReentrant returns (uint256 orderId) {
        require(amount > 0, "Invalid amount");
        require(pricePerTonne >= minPricePerTonne, "Price below minimum");
        require(pricePerTonne <= MAX_PRICE_PER_TONNE, "Price above maximum");

        if (requiresKYC_) {
            require(kycVerified[msg.sender], "KYC required");
        }

        // Lock seller's CCT tokens
        carbonToken.transferFrom(msg.sender, address(this), amount);

        orderId = nextOrderId++;
        uint256 expiresAt = expiresIn > 0 ? block.timestamp + expiresIn : type(uint256).max;

        orders[orderId] = Order({
            orderId: orderId,
            trader: msg.sender,
            isBuyOrder: false,
            amount: amount,
            pricePerTonne: pricePerTonne,
            filled: 0,
            isActive: true,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            requiresKYC: requiresKYC_
        });
        orderFeeBps[orderId] = tradingFeePercent;

        userOrders[msg.sender].push(orderId);

        emit OrderCreated(orderId, msg.sender, false, amount, pricePerTonne);

        return orderId;
    }

    /**
     * @notice Fill an existing order (taker)
     * @param orderId Order to fill
     * @param amount Amount to fill (can be partial)
     */
    function fillOrder(uint256 orderId, uint256 amount)
        external
        whenNotPaused
        nonReentrant
    {
        Order storage order = orders[orderId];

        require(order.isActive, "Order not active");
        require(msg.sender != order.trader, "Cannot fill own order");
        require(block.timestamp < order.expiresAt, "Order expired");
        require(amount > 0 && amount <= (order.amount - order.filled), "Invalid fill amount");

        if (order.requiresKYC) {
            require(kycVerified[msg.sender], "KYC required");
            // Re-check the maker at fill time: a revoked maker's KYC-only order is no longer fillable
            require(kycVerified[order.trader], "Maker KYC revoked");
        }

        uint256 totalCost = (amount * order.pricePerTonne) / CARBON_UNIT;
        require(totalCost > 0, "Fill too small");
        // The fee is always paid by the CCT seller: the taker of a buy order, the maker of a sell order
        uint256 fee = _settlementFee(totalCost, orderFeeBps[orderId], order.isBuyOrder ? msg.sender : order.trader);

        // Effects before interactions
        order.filled += amount;
        if (order.filled == order.amount) {
            order.isActive = false;
        }
        accruedFees += fee;

        if (order.isBuyOrder) {
            // Taker is selling CCT to buyer
            carbonToken.transferFrom(msg.sender, order.trader, amount);
            paymentToken.safeTransfer(msg.sender, totalCost - fee);
        } else {
            // Taker is buying CCT from seller
            paymentToken.safeTransferFrom(msg.sender, address(this), totalCost);
            carbonToken.transfer(msg.sender, amount);
            // A maker the payment token refuses to pay (e.g. blacklisted) must not block the fill
            _payOrCredit(order.trader, totalCost - fee);
        }

        emit OrderFilled(orderId, msg.sender, amount, totalCost);
    }

    /**
     * @notice Cancel an active order
     */
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = orders[orderId];

        require(order.trader == msg.sender, "Not order creator");
        require(order.isActive, "Order not active");

        uint256 unfilled = order.amount - order.filled;
        order.isActive = false;

        if (order.isBuyOrder) {
            // Refund locked payment tokens
            uint256 refund = (unfilled * order.pricePerTonne) / CARBON_UNIT;
            paymentToken.safeTransfer(msg.sender, refund);
        } else {
            // Return locked CCT
            carbonToken.transfer(msg.sender, unfilled);
        }

        emit OrderCancelled(orderId);
    }

    // ============ AUCTION FUNCTIONS ============

    /**
     * @notice Create an auction for CCT tokens
     * @param amount Amount of CCT tokens to auction
     * @param startPrice Minimum total bid in payment-token base units
     * @param endTime Auction end timestamp (unix); must be between
     *        MIN_AUCTION_DURATION and MAX_AUCTION_DURATION from now
     */
    function createAuction(
        uint256 amount,
        uint256 startPrice,
        uint256 endTime
    ) external whenNotPaused nonReentrant kycGate returns (uint256 auctionId) {
        require(amount > 0, "Invalid amount");
        require(startPrice > 0, "Invalid start price");
        uint256 pricePerTonne = (startPrice * CARBON_UNIT) / amount;
        require(pricePerTonne >= minPricePerTonne, "Price below minimum");
        require(pricePerTonne <= MAX_PRICE_PER_TONNE, "Price above maximum");
        require(endTime >= block.timestamp + MIN_AUCTION_DURATION, "Duration too short");
        require(endTime <= block.timestamp + MAX_AUCTION_DURATION, "Duration too long");

        carbonToken.transferFrom(msg.sender, address(this), amount);

        auctionId = nextAuctionId++;

        auctions[auctionId] = Auction({
            auctionId: auctionId,
            seller: msg.sender,
            amount: amount,
            startPrice: startPrice,
            highestBid: 0,
            highestBidder: address(0),
            startTime: block.timestamp,
            endTime: endTime,
            isActive: true
        });
        auctionFeeBps[auctionId] = tradingFeePercent;

        userAuctions[msg.sender].push(auctionId);

        emit AuctionCreated(auctionId, msg.sender, amount, startPrice, endTime);

        return auctionId;
    }

    /**
     * @notice Place a bid on an active auction
     * @param auctionId Auction to bid on
     * @param bidAmount Total bid amount in payment-token base units
     */
    function placeBid(uint256 auctionId, uint256 bidAmount)
        external
        whenNotPaused
        nonReentrant
        kycGate
    {
        Auction storage auction = auctions[auctionId];

        require(auction.isActive, "Auction not active");
        require(block.timestamp < auction.endTime, "Auction ended");
        require(msg.sender != auction.seller, "Seller cannot bid");
        require(bidAmount >= auction.startPrice, "Bid below start price");
        require(bidAmount > auction.highestBid, "Bid too low");

        address previousBidder = auction.highestBidder;
        uint256 previousBid = auction.highestBid;

        auction.highestBid = bidAmount;
        auction.highestBidder = msg.sender;

        paymentToken.safeTransferFrom(msg.sender, address(this), bidAmount);

        // Refund the outbid bidder; if the payment token refuses (e.g. blacklisted) it is credited for `claim`
        if (previousBid > 0) {
            _payOrCredit(previousBidder, previousBid);
        }

        emit BidPlaced(auctionId, msg.sender, bidAmount);
    }

    /**
     * @notice Finalize an auction and transfer assets
     */
    function finalizeAuction(uint256 auctionId)
        external
        nonReentrant
    {
        Auction storage auction = auctions[auctionId];

        require(auction.isActive, "Auction not active");
        require(block.timestamp >= auction.endTime, "Auction not ended");

        auction.isActive = false;

        if (auction.highestBid == 0) {
            carbonToken.transfer(auction.seller, auction.amount);
            emit AuctionFinalized(auctionId, address(0), 0);
            return;
        }

        uint256 fee = _settlementFee(auction.highestBid, auctionFeeBps[auctionId], auction.seller);
        uint256 payout = auction.highestBid - fee;
        accruedFees += fee;

        carbonToken.transfer(auction.highestBidder, auction.amount);
        // A seller the payment token refuses to pay (e.g. blacklisted) must not freeze settlement
        _payOrCredit(auction.seller, payout);

        emit AuctionFinalized(auctionId, auction.highestBidder, auction.highestBid);
    }

    /**
     * @notice Cancel an auction before any bids
     */
    function cancelAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];

        require(auction.seller == msg.sender, "Not auction creator");
        require(auction.isActive, "Auction not active");
        require(auction.highestBid == 0, "Auction has bids");

        auction.isActive = false;
        carbonToken.transfer(auction.seller, auction.amount);

        emit AuctionCancelled(auctionId);
    }

    // ============ PULL PAYMENTS ============

    /**
     * @notice Withdraw payment-token amounts that could not be pushed to you (refunds / proceeds)
     * @dev Reverts if the payment token still refuses to pay `msg.sender` (e.g. still blacklisted).
     */
    function claim() external nonReentrant returns (uint256 amount) {
        amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to claim");

        pendingWithdrawals[msg.sender] = 0;
        paymentToken.safeTransfer(msg.sender, amount);

        emit PaymentClaimed(msg.sender, amount);
    }

    // ============ AMM FUNCTIONS ============

    /**
     * @notice Add liquidity to AMM pool (Uniswap-V2-router style: only the proportional amounts are pulled)
     * @param carbonDesired Max CCT base units to deposit
     * @param stableDesired Max payment-token base units to deposit
     * @param carbonMin Min CCT actually deposited (reverts otherwise)
     * @param stableMin Min payment token actually deposited (reverts otherwise)
     * @param minLiquidity Min LP shares to mint (reverts otherwise)
     * @return carbonUsed CCT actually deposited
     * @return stableUsed Payment token actually deposited
     * @return lpMinted LP shares minted to the caller
     * @dev The first deposit permanently locks MINIMUM_LIQUIDITY LP shares and sets the pool price; use
     *      the min parameters. Excess of the over-supplied token is simply not pulled.
     */
    function addLiquidity(
        uint256 carbonDesired,
        uint256 stableDesired,
        uint256 carbonMin,
        uint256 stableMin,
        uint256 minLiquidity
    )
        external
        whenNotPaused
        nonReentrant
        kycGate
        returns (uint256 carbonUsed, uint256 stableUsed, uint256 lpMinted)
    {
        require(carbonDesired > 0 && stableDesired > 0, "Invalid amounts");

        (carbonUsed, stableUsed, lpMinted) = _quoteAddLiquidity(carbonDesired, stableDesired);

        require(carbonUsed >= carbonMin, "Carbon below minimum");
        require(stableUsed >= stableMin, "Stable below minimum");
        require(lpMinted > 0 && lpMinted >= minLiquidity, "Insufficient liquidity minted");

        if (ammPool.totalLPTokens == 0) {
            // Permanently lock the minimum liquidity (held by address(0), cannot be removed)
            lpTokens[address(0)] = MINIMUM_LIQUIDITY;
            ammPool.totalLPTokens = MINIMUM_LIQUIDITY;
        }

        // Update pool
        ammPool.carbonReserve += carbonUsed;
        ammPool.stableReserve += stableUsed;
        ammPool.totalLPTokens += lpMinted;
        ammPool.lastUpdate = block.timestamp;

        // Mint LP tokens
        lpTokens[msg.sender] += lpMinted;

        // Transfer tokens
        carbonToken.transferFrom(msg.sender, address(this), carbonUsed);
        paymentToken.safeTransferFrom(msg.sender, address(this), stableUsed);

        emit LiquidityAdded(msg.sender, carbonUsed, stableUsed, lpMinted);
    }

    /**
     * @notice Remove liquidity from AMM pool (always allowed, also while paused)
     * @param lpAmount LP tokens to burn
     * @param carbonMin Min CCT to receive (reverts otherwise)
     * @param stableMin Min payment token to receive (reverts otherwise)
     */
    function removeLiquidity(uint256 lpAmount, uint256 carbonMin, uint256 stableMin)
        external
        nonReentrant
        returns (uint256 carbonAmount, uint256 stableAmount)
    {
        require(lpAmount > 0 && lpAmount <= lpTokens[msg.sender], "Invalid LP amount");

        carbonAmount = (lpAmount * ammPool.carbonReserve) / ammPool.totalLPTokens;
        stableAmount = (lpAmount * ammPool.stableReserve) / ammPool.totalLPTokens;

        require(carbonAmount > 0 && stableAmount > 0, "Insufficient liquidity burned");
        require(carbonAmount >= carbonMin, "Carbon below minimum");
        require(stableAmount >= stableMin, "Stable below minimum");

        // Update pool
        ammPool.carbonReserve -= carbonAmount;
        ammPool.stableReserve -= stableAmount;
        ammPool.totalLPTokens -= lpAmount;
        ammPool.lastUpdate = block.timestamp;

        // Burn LP tokens
        lpTokens[msg.sender] -= lpAmount;

        // Transfer tokens
        carbonToken.transfer(msg.sender, carbonAmount);
        paymentToken.safeTransfer(msg.sender, stableAmount);

        emit LiquidityRemoved(msg.sender, carbonAmount, stableAmount, lpAmount);
    }

    /**
     * @notice Swap tokens via AMM (constant product formula)
     * @param carbonToStable true = sell CCT for USDC, false = buy CCT with USDC
     * @param amountIn Input token amount
     * @param minAmountOut Minimum output (slippage protection)
     */
    function swap(
        bool carbonToStable,
        uint256 amountIn,
        uint256 minAmountOut
    ) external whenNotPaused nonReentrant kycGate returns (uint256 amountOut) {
        require(amountIn > 0, "Invalid input");
        require(ammPool.totalLPTokens > 0, "No liquidity");

        uint256 fee = (amountIn * tradingFeePercent) / FEE_DENOMINATOR;
        uint256 amountInAfterFee = amountIn - fee;

        if (carbonToStable) {
            // Sell CCT for USDC
            amountOut = (amountInAfterFee * ammPool.stableReserve) /
                        (ammPool.carbonReserve + amountInAfterFee);

            require(amountOut > 0, "Insufficient output");
            require(amountOut >= minAmountOut, "Slippage exceeded");
            require(amountOut < ammPool.stableReserve, "Insufficient liquidity");

            ammPool.carbonReserve += amountIn;
            ammPool.stableReserve -= amountOut;

            carbonToken.transferFrom(msg.sender, address(this), amountIn);
            paymentToken.safeTransfer(msg.sender, amountOut);
        } else {
            // Buy CCT with USDC
            amountOut = (amountInAfterFee * ammPool.carbonReserve) /
                        (ammPool.stableReserve + amountInAfterFee);

            require(amountOut > 0, "Insufficient output");
            require(amountOut >= minAmountOut, "Slippage exceeded");
            require(amountOut < ammPool.carbonReserve, "Insufficient liquidity");

            ammPool.stableReserve += amountIn;
            ammPool.carbonReserve -= amountOut;

            paymentToken.safeTransferFrom(msg.sender, address(this), amountIn);
            carbonToken.transfer(msg.sender, amountOut);
        }

        ammPool.lastPrice = (ammPool.stableReserve * CARBON_UNIT) / ammPool.carbonReserve;
        ammPool.lastUpdate = block.timestamp;

        emit Swap(msg.sender, carbonToStable, amountIn, amountOut, fee);

        return amountOut;
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Spot AMM price: payment-token base units per tonne (1e18 CCT base units)
     */
    function getPrice() external view returns (uint256) {
        if (ammPool.carbonReserve == 0) return 0;
        return (ammPool.stableReserve * CARBON_UNIT) / ammPool.carbonReserve;
    }

    /**
     * @notice Quote the amounts `addLiquidity` would take / mint for the given desired amounts
     */
    function quoteAddLiquidity(uint256 carbonDesired, uint256 stableDesired)
        external
        view
        returns (uint256 carbonUsed, uint256 stableUsed, uint256 lpMinted)
    {
        return _quoteAddLiquidity(carbonDesired, stableDesired);
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    function getUserOrders(address user) external view returns (uint256[] memory) {
        return userOrders[user];
    }

    function getUserAuctions(address user) external view returns (uint256[] memory) {
        return userAuctions[user];
    }

    /// @notice Share of the trading fee currently waived for `user` (bps of the fee, clamped to 50%); 0 if no
    ///         provider is set or the provider misbehaves.
    function feeDiscountBpsOf(address user) external view returns (uint256) {
        return _discountBps(user);
    }

    // ============ ADMIN FUNCTIONS ============

    function setKYCStatus(address user, bool status) external onlyRole(KYC_ROLE) {
        kycVerified[user] = status;
        emit KYCStatusUpdated(user, status);
    }

    /// @notice Require KYC for addLiquidity / swap / createAuction / placeBid (exits are never gated)
    function setKYCGate(bool enabled) external onlyParameterAdmin {
        kycGateEnabled = enabled;
        emit KYCGateUpdated(enabled);
    }

    /// @notice Set (or clear with address(0)) the optional fee-discount provider. A non-zero provider must be a
    ///         contract; a broken provider can never block trading (see `_discountBps`).
    function setFeeDiscountProvider(address provider) external onlyParameterAdmin {
        require(provider == address(0) || provider.code.length > 0, "Provider not a contract");
        address old = feeDiscountProvider;
        feeDiscountProvider = provider;
        emit FeeDiscountProviderUpdated(old, provider);
    }

    /// @notice Set the trading fee (bps, max 1%). Applies only to orders/auctions created afterwards
    ///         and to AMM swaps; existing order-book / auction escrow keeps the fee it was created with.
    function setTradingFee(uint256 newFeePercent) external onlyParameterAdmin {
        require(newFeePercent <= MAX_TRADING_FEE, "Fee too high"); // Max 1%
        uint256 oldFee = tradingFeePercent;
        tradingFeePercent = newFeePercent;
        emit TradingFeeUpdated(oldFee, newFeePercent);
    }

    function setMinPricePerTonne(uint256 newMinPrice) external onlyParameterAdmin {
        require(newMinPrice > 0, "Invalid min price");
        require(newMinPrice <= MAX_MIN_PRICE_PER_TONNE, "Min price too high");
        uint256 oldPrice = minPricePerTonne;
        minPricePerTonne = newMinPrice;
        emit MinPriceUpdated(oldPrice, newMinPrice);
    }

    /**
     * @notice Withdraw accrued order-book / auction fees to `to`
     * @dev Only the tracked `accruedFees` counter can be withdrawn; user escrow, pending withdrawals and AMM
     *      reserves are never reachable. Grant FEE_MANAGER_ROLE to a multisig / treasury controller.
     */
    function withdrawFees(address to) external onlyRole(FEE_MANAGER_ROLE) nonReentrant returns (uint256 amount) {
        require(to != address(0), "Invalid recipient");
        amount = accruedFees;
        require(amount > 0, "No fees");

        accruedFees = 0;
        paymentToken.safeTransfer(to, amount);

        emit FeesWithdrawn(to, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ============ INTERNALS ============

    /**
     * @dev Fee for `amount` (payment-token base units) at the SNAPSHOTTED `baseBps`, reduced by the payer's
     *      discount at settlement. Never exceeds the snapshotted fee.
     */
    function _settlementFee(uint256 amount, uint256 baseBps, address payer) private returns (uint256 fee) {
        uint256 discount = _discountBps(payer);
        fee = (amount * baseBps * (FEE_DENOMINATOR - discount)) / (FEE_DENOMINATOR * FEE_DENOMINATOR);
        if (discount > 0) {
            emit FeeDiscountApplied(payer, discount, fee);
        }
    }

    /**
     * @dev Gas-bounded, return-data-bounded `staticcall` to the discount provider. Any failure (no provider,
     *      revert, out-of-gas, short/garbage return) yields 0. At most 32 bytes of return data are copied, so a
     *      hostile provider cannot grief with a returndata bomb. The value is clamped to MAX_FEE_DISCOUNT_BPS.
     */
    function _discountBps(address user) private view returns (uint256 discount) {
        address provider = feeDiscountProvider;
        if (provider == address(0)) return 0;

        bytes memory callData = abi.encodeCall(IFeeDiscount.discountBps, (user));
        uint256 gasLimit = DISCOUNT_GAS_LIMIT;
        bool ok;
        uint256 size;
        assembly {
            ok := staticcall(gasLimit, provider, add(callData, 0x20), mload(callData), 0x00, 0x20)
            size := returndatasize()
            discount := mload(0x00)
        }
        if (!ok || size < 32) return 0;
        if (discount > MAX_FEE_DISCOUNT_BPS) discount = MAX_FEE_DISCOUNT_BPS;
    }

    /**
     * @dev Push `amount` of the payment token to `to`; if the token refuses (revert / false, e.g. USDC
     *      blacklist) credit `pendingWithdrawals[to]` so settlement of the rest of the system is never blocked.
     *      The payment token is a trusted, admin-chosen contract (return data size is not a concern).
     */
    function _payOrCredit(address to, uint256 amount) private {
        if (amount == 0) return;

        (bool ok, bytes memory ret) = address(paymentToken).call(
            abi.encodeCall(IERC20.transfer, (to, amount))
        );
        if (ok && (ret.length == 0 || (ret.length >= 32 && abi.decode(ret, (bool))))) {
            return;
        }

        pendingWithdrawals[to] += amount;
        emit PaymentDeferred(to, amount);
    }

    function _quoteAddLiquidity(uint256 carbonDesired, uint256 stableDesired)
        private
        view
        returns (uint256 carbonUsed, uint256 stableUsed, uint256 lpMinted)
    {
        Pool memory pool = ammPool;

        if (pool.totalLPTokens == 0) {
            // Initial liquidity: sets the price; MINIMUM_LIQUIDITY shares are locked forever
            uint256 root = sqrt(carbonDesired * stableDesired);
            require(root > MINIMUM_LIQUIDITY, "Insufficient initial liquidity");
            return (carbonDesired, stableDesired, root - MINIMUM_LIQUIDITY);
        }

        require(pool.carbonReserve > 0 && pool.stableReserve > 0, "Empty reserves");

        // Proportional deposit (Uniswap V2 router "optimal amount" logic)
        uint256 stableOptimal = (carbonDesired * pool.stableReserve) / pool.carbonReserve;
        if (stableOptimal <= stableDesired) {
            carbonUsed = carbonDesired;
            stableUsed = stableOptimal;
        } else {
            carbonUsed = (stableDesired * pool.carbonReserve) / pool.stableReserve;
            stableUsed = stableDesired;
        }

        uint256 lpFromCarbon = (carbonUsed * pool.totalLPTokens) / pool.carbonReserve;
        uint256 lpFromStable = (stableUsed * pool.totalLPTokens) / pool.stableReserve;
        lpMinted = lpFromCarbon < lpFromStable ? lpFromCarbon : lpFromStable;
    }

    function sqrt(uint256 x) private pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
}
