// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Audit helper (AUD-WEBAPP): emits a CreditRetired-shaped event identical to CarbonCreditNFT's,
///      to test whether the certificate page can be fooled by a log from a foreign contract.
contract FakeCreditRetiredEmitter {
    event CreditRetired(uint256 indexed tokenId, address indexed retiredBy, uint256 timestamp, uint256 co2Tonnes, string reason);

    function forge(uint256 tokenId, address retiredBy, uint256 co2Tonnes, string calldata reason) external {
        emit CreditRetired(tokenId, retiredBy, block.timestamp, co2Tonnes, reason);
    }
}
