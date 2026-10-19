// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../core/CarbonCreditNFT.sol";

/**
 * Test helpers for the `nft` audit area. TEST ONLY - never deploy.
 */

/// @dev Receiver that tries to re-enter CarbonCreditNFT.retireCredit from
///      onERC721Received while the issuer is still minting to it.
contract PocReentrantClaimer {
    CarbonCreditNFT public immutable nft;
    uint256 public reentered;   // callbacks in which retireCredit succeeded
    uint256 public blocked;     // callbacks in which retireCredit was rejected

    constructor(CarbonCreditNFT nft_) {
        nft = nft_;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        if (msg.sender == address(nft)) {
            try nft.retireCredit(tokenId, "cb") {
                reentered++;
            } catch {
                blocked++;
            }
        }
        return this.onERC721Received.selector;
    }
}

/// @dev Minimal NFT stand-in that can hold UNVERIFIED credits (empty serial / zero proof),
///      which the real CarbonCreditNFT can no longer mint. Used to prove the CCT wrap gate.
contract PocLooseNft {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => CarbonCreditNFT.CarbonCredit) private _c;

    function put(
        uint256 id,
        address owner_,
        string calldata methodology,
        uint256 tonnes,
        string calldata serial,
        bytes32 proof
    ) external {
        ownerOf[id] = owner_;
        CarbonCreditNFT.CarbonCredit storage c = _c[id];
        c.methodology = methodology;
        c.co2Tonnes = tonnes;
        c.serialNumber = serial;
        c.oracleProofHash = proof;
    }

    function getCreditDetails(uint256 id) external view returns (CarbonCreditNFT.CarbonCredit memory) {
        return _c[id];
    }

    function transferFrom(address, address to, uint256 id) external {
        ownerOf[id] = to;
    }
}
