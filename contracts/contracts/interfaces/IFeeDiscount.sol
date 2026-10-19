// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IFeeDiscount
 * @notice Optional fee-discount provider queried by CarbonMarketplace.
 * @dev The marketplace calls `discountBps` with a bounded `staticcall`: a reverting, out-of-gas, malformed or
 *      absent provider is treated as "no discount" and can never block trading. The marketplace additionally
 *      clamps the returned value to MAX_FEE_DISCOUNT_BPS (50% of the base fee).
 */
interface IFeeDiscount {
    /// @notice Share of the trading fee waived for `user`, in basis points of the fee (5000 = 50% off the fee).
    function discountBps(address user) external view returns (uint256);
}
