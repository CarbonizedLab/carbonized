// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TokenChecks
 * @notice Defensive helpers for talking to a CARB token that Carbonized did not write (a launchpad token): the
 *         protocol only assumes the plain ERC-20 surface and verifies the two assumptions that matter onchain.
 *
 *  - `readDecimals`: reads `decimals()` once (callers store it as an immutable); reverts on a token without it,
 *    and on absurd values so that `10 ** decimals` style bounds can never overflow a uint128 position.
 *  - `pullExact`: pulls `amount` and REVERTS unless exactly `amount` arrived. This rejects fee-on-transfer /
 *    transfer-tax tokens, and any token that moves its balance in another way during a transfer (hooks that
 *    skim, reflection, negative rebase), instead of silently crediting more than the contract received.
 *
 * Rebasing tokens (balances that change without transfers) cannot be detected by a single transfer and are
 * NOT supported: see TOKEN.md. Withdrawals are plain transfers: a tax enabled later hits the recipient, never the
 * protocol's accounting.
 */
library TokenChecks {
    using SafeERC20 for IERC20;

    /// @notice Highest supported `decimals()`; with 5e7 whole tokens x 10**24 the bounds still fit a uint128.
    uint8 internal constant MAX_DECIMALS = 24;

    function readDecimals(address token) internal view returns (uint8 decimals_) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("decimals()"));
        require(ok && data.length == 32, "Token has no decimals()");
        uint256 value = abi.decode(data, (uint256));
        require(value <= MAX_DECIMALS, "Token decimals unsupported");
        decimals_ = uint8(value);
    }

    function pullExact(IERC20 token, address from, uint256 amount) internal {
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        uint256 balanceAfter = token.balanceOf(address(this));
        require(
            balanceAfter >= balanceBefore && balanceAfter - balanceBefore == amount,
            "Received amount differs (fee-on-transfer unsupported)"
        );
    }
}
