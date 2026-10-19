// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ICarbonCreditToken
 * @notice Interface for CarbonCreditToken (ERC-20 wrapper)
 */
interface ICarbonCreditToken is IERC20 {
    
    event CreditWrapped(
        address indexed user,
        uint256 indexed tokenId,
        uint256 co2Tonnes
    );

    event CreditUnwrapped(
        address indexed user,
        uint256 indexed tokenId,
        uint256 co2Tonnes
    );

    function wrapCredit(uint256 tokenId) external returns (uint256 tonnesMinted);

    function batchWrap(uint256[] calldata tokenIds) external returns (uint256 totalMinted);

    function unwrapCredit(uint256 tokenId) external returns (uint256 tonnesBurned);

    function unwrapAny(uint256 amount) external returns (uint256 tokenId);

    function getUserWrappedNFTs(address user) external view returns (uint256[] memory);

    /// @notice Original wrapper of a wrapped NFT (zero address if not wrapped)
    function wrapperOf(uint256 tokenId) external view returns (address);

    /// @notice Tonnes (18 dec) locked for a wrapped NFT
    function wrappedTonnes(uint256 tokenId) external view returns (uint256);

    /// @notice Number of wrapped NFTs redeemable through unwrapAny(amount)
    function wrappedCountByTonnes(uint256 amount) external view returns (uint256);

    function getBackingInfo() 
        external 
        view 
        returns (
            uint256 nftsLocked,
            uint256 tonnesLocked,
            uint256 tokensCirculating
        );

    function isFullyBacked() external view returns (bool);

    function nftContract() external view returns (address);

    function methodology() external view returns (string memory);
}
