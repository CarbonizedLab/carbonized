// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ICarbonMarketplace
 * @notice Interface for CarbonMarketplace
 */
interface ICarbonMarketplace {
    
    struct Order {
        uint256 orderId;
        address trader;
        bool isBuyOrder;
        uint256 amount;
        uint256 pricePerTonne;
        uint256 filled;
        bool isActive;
        uint256 createdAt;
        uint256 expiresAt;
        bool requiresKYC;
    }

    struct Pool {
        uint256 carbonReserve;
        uint256 stableReserve;
        uint256 totalLPTokens;
        uint256 lastPrice;
        uint256 lastUpdate;
    }

    // Events
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

    event FeeDiscountProviderUpdated(address indexed oldProvider, address indexed newProvider);

    event FeeDiscountApplied(address indexed payer, uint256 discountBps, uint256 feeCharged);

    event Swap(
        address indexed trader,
        bool carbonToStable,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );

    // Order Book Functions
    function createBuyOrder(
        uint256 amount,
        uint256 pricePerTonne,
        uint256 expiresIn,
        bool requiresKYC_
    ) external returns (uint256 orderId);

    function createSellOrder(
        uint256 amount,
        uint256 pricePerTonne,
        uint256 expiresIn,
        bool requiresKYC_
    ) external returns (uint256 orderId);

    function fillOrder(uint256 orderId, uint256 amount) external;

    function cancelOrder(uint256 orderId) external;

    // AMM Functions
    function addLiquidity(
        uint256 carbonDesired,
        uint256 stableDesired,
        uint256 carbonMin,
        uint256 stableMin,
        uint256 minLiquidity
    ) external returns (uint256 carbonUsed, uint256 stableUsed, uint256 lpMinted);

    function removeLiquidity(uint256 lpAmount, uint256 carbonMin, uint256 stableMin)
        external
        returns (uint256 carbonAmount, uint256 stableAmount);

    function quoteAddLiquidity(uint256 carbonDesired, uint256 stableDesired)
        external
        view
        returns (uint256 carbonUsed, uint256 stableUsed, uint256 lpMinted);

    function swap(
        bool carbonToStable,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut);

    // Auctions (endTime must be within MIN_AUCTION_DURATION..MAX_AUCTION_DURATION of now)
    function createAuction(uint256 amount, uint256 startPrice, uint256 endTime)
        external
        returns (uint256 auctionId);

    function placeBid(uint256 auctionId, uint256 bidAmount) external;

    function finalizeAuction(uint256 auctionId) external;

    function cancelAuction(uint256 auctionId) external;

    // Pull payments / fees
    function claim() external returns (uint256 amount);

    function pendingWithdrawals(address account) external view returns (uint256);

    function withdrawFees(address to) external returns (uint256 amount);

    function accruedFees() external view returns (uint256);

    // Fee discount (optional IFeeDiscount provider, e.g. CARB staking tiers; address(0) = off)
    function feeDiscountProvider() external view returns (address);

    /// @notice Share of the fee waived for `user` (bps of the fee, clamped to 50%)
    function feeDiscountBpsOf(address user) external view returns (uint256);

    function setFeeDiscountProvider(address provider) external;

    // View Functions
    function getPrice() external view returns (uint256);

    function getOrder(uint256 orderId) external view returns (Order memory);

    function getUserOrders(address user) external view returns (uint256[] memory);

    function ammPool() external view returns (Pool memory);
}
