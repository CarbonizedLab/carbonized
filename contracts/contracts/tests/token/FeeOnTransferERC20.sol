// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title FeeOnTransferERC20 (TEST ONLY - never part of a deployment)
 * @notice Transfer-tax token: every transfer between non-exempt parties burns `feeBps` of the amount, so the
 *         recipient receives less than `amount`. The fee can be switched on later (`setFeeBps`), like a launchpad
 *         token whose owner enables a tax after the protocol was deployed.
 */
contract FeeOnTransferERC20 is ERC20 {
    uint8 private immutable _decimals;
    uint256 public feeBps;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 feeBps_) ERC20(name_, symbol_) {
        _decimals = decimals_;
        feeBps = feeBps_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFeeBps(uint256 feeBps_) external {
        feeBps = feeBps_;
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        uint256 fee = (amount * feeBps) / 10_000;
        if (fee > 0) {
            _burn(from, fee);
        }
        super._transfer(from, to, amount - fee);
    }
}
