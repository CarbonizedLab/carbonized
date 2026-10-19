// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev AUDIT POC ONLY. Mimics the blacklist behaviour of production USDC
 *      (Circle can blacklist any address: transfers from/to it revert).
 *      Configurable decimals (6 for production-like USDC).
 */
contract BlacklistERC20 is ERC20 {
    uint8 private immutable _dec;
    mapping(address => bool) public isBlacklisted;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlacklisted(address a, bool b) external {
        isBlacklisted[a] = b;
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        require(!isBlacklisted[from] && !isBlacklisted[to], "Blacklisted");
        super._beforeTokenTransfer(from, to, amount);
    }
}
