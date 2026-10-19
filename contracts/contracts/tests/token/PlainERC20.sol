// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title PlainERC20 (TEST ONLY - never part of a deployment)
 * @notice Stand-in for a launchpad token: custom decimals, free `mint`, and NO `burn`, NO votes, NO permit.
 */
contract PlainERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice A token whose `burn(uint256)` exists but does nothing (e.g. a launchpad token with a non-reverting
///         stub / fallback): IssuerBond must detect that nothing was burned and use the sink instead.
contract NoopBurnERC20 is PlainERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) PlainERC20(name_, symbol_, decimals_) {}

    function burn(uint256) external {}
}

/// @notice A token with a real `burn(uint256)` (burns the caller's balance) and custom decimals.
contract BurnableDecimalsERC20 is PlainERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) PlainERC20(name_, symbol_, decimals_) {}

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
