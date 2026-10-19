// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../core/CarbonCreditNFT.sol";

/**
 * @title MaliciousRetirer
 * @notice Mock contract to test reentrancy protection
 */
contract MaliciousRetirer {
    CarbonCreditNFT public nft;
    bool public attacking = false;

    constructor(address nftAddress) {
        nft = CarbonCreditNFT(nftAddress);
    }

    function attack(uint256 tokenId, string memory reason) external {
        attacking = true;
        nft.retireCredit(tokenId, reason);
    }

    // Attempt reentrancy on receive
    receive() external payable {
        if (attacking) {
            // Try to retire again
            nft.retireCredit(1, "Reentrancy attempt");
        }
    }
}
