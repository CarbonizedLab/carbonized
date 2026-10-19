// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ICarbonCreditNFT
 * @notice Interface for CarbonCreditNFT contract
 */
interface ICarbonCreditNFT {
    struct CarbonCredit {
        string projectId;
        string projectName;
        string methodology;
        uint256 co2Tonnes;
        uint256 vintageYear;
        string geography;
        bytes32 oracleProofHash;
        string satelliteDataCID;
        address verificationSource;
        uint256 verificationDate;
        bool isRetired;
        uint256 issuanceDate;
        string serialNumber;
    }

    struct RetirementCertificate {
        uint256 originalTokenId;
        address retiredBy;
        uint256 retirementDate;
        string retirementReason;
        uint256 co2Tonnes;
    }

    // Events
    event CreditMinted(
        uint256 indexed tokenId,
        string indexed projectId,
        address indexed recipient,
        uint256 co2Tonnes,
        string methodology
    );

    event CreditRetired(
        uint256 indexed tokenId,
        address indexed retiredBy,
        uint256 timestamp,
        uint256 co2Tonnes,
        string reason
    );

    // Core Functions
    function mintCredit(
        address to,
        string memory projectId,
        string memory projectName,
        string memory serialNumber,
        string memory methodology,
        uint256 co2Tonnes,
        uint256 vintageYear,
        string memory geography,
        bytes32 oracleProofHash,
        string memory satelliteDataCID,
        string memory tokenURI
    ) external returns (uint256);

    function retireCredit(uint256 tokenId, string memory reason) external;

    function batchRetire(uint256[] calldata tokenIds, string memory reason) external;

    // View Functions
    function getCreditDetails(uint256 tokenId) external view returns (CarbonCredit memory);

    function getRetirementCertificate(uint256 tokenId) 
        external 
        view 
        returns (RetirementCertificate memory);

    function getGlobalStats() 
        external 
        view 
        returns (
            uint256 minted,
            uint256 retired,
            uint256 active,
            uint256 totalTokens
        );

    /// @dev The methodology argument is ignored: the double-counting key is the canonical
    ///      (trimmed, upper-cased) serial number only.
    function isSerialTokenized(string memory methodology, string memory serialNumber) 
        external 
        view 
        returns (bool);
}
