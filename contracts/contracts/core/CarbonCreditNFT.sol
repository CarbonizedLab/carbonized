// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "../interfaces/IRegistrySync.sol";

/**
 * @title CarbonCreditNFT
 * @notice Core carbon credit asset registry - Each NFT represents verified CO2 reduction
 * @dev ERC-721 with oracle-verified metadata and retirement mechanism
 *
 * Key Features:
 * - Oracle-backed minting (oracle proof hash required)
 * - Double-counting prevention (canonical serial-number hashing)
 * - Permanent retirement with audit trail
 * - Multi-methodology support (ICM/Verra/Gold Standard)
 * - Batch operations for gas optimization
 *
 * Issuance model: native credits use `mintCredit` / `batchMint` and require
 * NATIVE_ISSUER_ROLE (EmissionVerifier). External registry credits use
 * `mintExternalCredit` / `batchMintExternal` and require a RegistrySync attestation.
 * There is no public / faucet minting path.
 *
 * Roles (OpenZeppelin AccessControl): DEFAULT_ADMIN_ROLE, PAUSER_ROLE, ISSUER_ROLE, NATIVE_ISSUER_ROLE,
 * ISSUER_ADMIN_ROLE, ORACLE_ROLE. The deployer receives DEFAULT_ADMIN_ROLE, PAUSER_ROLE and
 * ISSUER_ADMIN_ROLE and SHOULD `grantRole` all of them to a multisig and renounce its own, so no
 * single EOA holds issuance or pause power on mainnet.
 *
 * ISSUER_ROLE is administered by the dedicated ISSUER_ADMIN_ROLE (not DEFAULT_ADMIN_ROLE). Holders of
 * ISSUER_ADMIN_ROLE (the multisig for "trusted issuers", and the IssuerBond contract for bonded
 * issuers) can grant/revoke ISSUER_ROLE. DEFAULT_ADMIN_ROLE administers ISSUER_ADMIN_ROLE itself, so
 * the multisig can always re-point issuer administration.
 */
contract CarbonCreditNFT is
    ERC721URIStorage,
    ERC721Enumerable,
    AccessControl,
    Pausable,
    ReentrancyGuard
{
    using Counters for Counters.Counter;

    // ============ ROLES ============
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    /// @notice Native issuance is reserved for the attested EmissionVerifier flow.
    bytes32 public constant NATIVE_ISSUER_ROLE = keccak256("NATIVE_ISSUER_ROLE");
    /// @notice Administers ISSUER_ROLE (grant/revoke). Held by the multisig and by the IssuerBond contract.
    bytes32 public constant ISSUER_ADMIN_ROLE = keccak256("ISSUER_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant EXTERNAL_ISSUER_ROLE = keccak256("EXTERNAL_ISSUER_ROLE");

    // ============ LIMITS ============
    /// @notice Upper bound on the tonnes of a single credit (18 decimals): 10,000,000 t
    uint256 public constant MAX_TONNES_PER_CREDIT = 10_000_000 ether;
    uint256 public constant MIN_VINTAGE_YEAR = 2015;
    uint256 public constant MAX_VINTAGE_YEAR = 2050;
    uint256 public constant MAX_BATCH_MINT = 100;
    uint256 public constant MAX_REGISTRY_ATTESTATION_AGE = 7 days;

    // ============ STATE VARIABLES ============
    Counters.Counter private _tokenIds;
    IRegistrySync public registrySync;

    /// @notice Carbon credit metadata structure
    struct CarbonCredit {
        string projectId;              // Unique project identifier
        string projectName;            // Human-readable project name
        string methodology;            // "ICM_COMPLIANCE" | "VERRA_VCS" | "GOLD_STANDARD"
        uint256 co2Tonnes;            // Carbon offset amount (18 decimals)
        uint256 vintageYear;          // Year of emission reduction
        string geography;              // Country/region code (ISO 3166)
        bytes32 oracleProofHash;      // Oracle attestation
        string satelliteDataCID;       // IPFS CID for satellite verification
        address verificationSource;    // Issuer that minted the credit
        uint256 verificationDate;     // Timestamp of verification
        bool isRetired;               // Retirement status
        uint256 issuanceDate;         // Minting timestamp
        string serialNumber;          // External registry serial (mandatory)
    }

    /// @notice Retirement certificate for ESG reporting
    struct RetirementCertificate {
        uint256 originalTokenId;
        address retiredBy;
        uint256 retirementDate;
        string retirementReason;
        uint256 co2Tonnes;
    }

    // ============ MAPPINGS ============
    mapping(uint256 => CarbonCredit) public credits;
    /// @dev canonical serial key (see `_serialKey`) => already tokenized
    mapping(bytes32 => bool) public issuedSerials;           // Prevent double-counting
    mapping(uint256 => RetirementCertificate) public retirementCertificates;
    mapping(string => uint256[]) public projectCredits;      // projectId => tokenIds
    mapping(address => uint256) public userRetiredTonnes;    // ESG tracking

    // ============ GLOBAL STATS ============
    uint256 public totalMintedTonnes;
    uint256 public totalRetiredTonnes;
    uint256 public totalActiveCredits;

    // Methodology-specific counters
    mapping(string => uint256) public methodologyTonnes;     // "VERRA_VCS" => total tonnes

    // ============ EVENTS ============
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

    event CreditBatchMinted(
        uint256[] tokenIds,
        string projectId,
        uint256 totalTonnes
    );

    event VerificationUpdated(
        uint256 indexed tokenId,
        address verifier,
        bytes32 newProofHash
    );

    event SerialNumberRegistered(
        bytes32 indexed serialHash,
        string serialNumber,
        uint256 tokenId
    );
    event RegistrySyncUpdated(address indexed previousRegistrySync, address indexed newRegistrySync);

    // ============ CONSTRUCTOR ============
    constructor() ERC721("Carbonized Credit", "CBZ") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ISSUER_ADMIN_ROLE, msg.sender);
        _setRoleAdmin(ISSUER_ROLE, ISSUER_ADMIN_ROLE);
        _setRoleAdmin(NATIVE_ISSUER_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(EXTERNAL_ISSUER_ROLE, ISSUER_ADMIN_ROLE);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    // ============ CORE FUNCTIONS ============

    /**
     * @notice Mint a single carbon credit with oracle verification
     * @dev Only callable by addresses with NATIVE_ISSUER_ROLE. External registry credits
     *      must use `mintExternalCredit`. Serial numbers MUST carry the
     *      registry prefix (e.g. "VCS-12345"): the double-counting key is the
     *      canonical (trimmed, upper-cased) serial only and does NOT include the
     *      free-form methodology label.
     * @param to Recipient address
     * @param projectId Unique project identifier
     * @param serialNumber External registry serial (e.g., "VCS-12345"), mandatory
     * @param methodology Carbon standard methodology
     * @param co2Tonnes Amount of CO2 offset (18 decimals: 1000e18 = 1000 tonnes)
     * @param vintageYear Year of emission reduction
     * @param geography ISO 3166 country code
     * @param oracleProofHash Oracle attestation hash
     * @param tokenURI IPFS metadata URI
     * @return tokenId The newly minted token ID
     */
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
    )
        external
        onlyRole(NATIVE_ISSUER_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        return _issueCredit(
            to,
            projectId,
            CreditData({
                projectName: projectName,
                serialNumber: serialNumber,
                methodology: methodology,
                co2Tonnes: co2Tonnes,
                vintageYear: vintageYear,
                geography: geography,
                oracleProofHash: oracleProofHash,
                satelliteDataCID: satelliteDataCID,
                tokenURI: tokenURI
            })
        );
    }

    /**
     * @notice Batch mint carbon credits for gas optimization
     * @dev Use for large project issuances (e.g., 100+ credits). Every item goes through
     *      the same validation and emits the same events as `mintCredit`.
     * @param to Recipient address
     * @param projectId Shared project identifier
     * @param credits_ Array of credit data structs
     * @return tokenIds Array of newly minted token IDs
     */
    function batchMint(
        address to,
        string memory projectId,
        CreditData[] calldata credits_
    )
        external
        onlyRole(NATIVE_ISSUER_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256[] memory tokenIds)
    {
        require(credits_.length > 0 && credits_.length <= MAX_BATCH_MINT, "Invalid batch size");

        tokenIds = new uint256[](credits_.length);
        uint256 totalBatchTonnes = 0;

        for (uint256 i = 0; i < credits_.length; i++) {
            CreditData memory data = credits_[i];
            tokenIds[i] = _issueCredit(to, projectId, data);
            totalBatchTonnes += data.co2Tonnes;
        }

        emit CreditBatchMinted(tokenIds, projectId, totalBatchTonnes);

        return tokenIds;
    }

    function mintExternalCredit(
        address to,
        string memory projectId,
        string memory projectName,
        string memory registry,
        string memory serialNumber,
        string memory methodology,
        uint256 co2Tonnes,
        uint256 vintageYear,
        string memory geography,
        bytes32 oracleProofHash,
        string memory satelliteDataCID,
        string memory tokenURI
    )
        external
        onlyRole(EXTERNAL_ISSUER_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        _requireExternalRegistryAttestation(registry, serialNumber);
        return _issueCredit(
            to,
            projectId,
            CreditData({
                projectName: projectName,
                serialNumber: serialNumber,
                methodology: methodology,
                co2Tonnes: co2Tonnes,
                vintageYear: vintageYear,
                geography: geography,
                oracleProofHash: oracleProofHash,
                satelliteDataCID: satelliteDataCID,
                tokenURI: tokenURI
            })
        );
    }

    function batchMintExternal(
        address to,
        string memory projectId,
        string memory registry,
        CreditData[] calldata credits_
    )
        external
        onlyRole(EXTERNAL_ISSUER_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256[] memory tokenIds)
    {
        require(credits_.length > 0 && credits_.length <= MAX_BATCH_MINT, "Invalid batch size");
        tokenIds = new uint256[](credits_.length);
        uint256 totalBatchTonnes = 0;

        for (uint256 i = 0; i < credits_.length; i++) {
            _requireExternalRegistryAttestation(registry, credits_[i].serialNumber);
            CreditData memory data = credits_[i];
            tokenIds[i] = _issueCredit(to, projectId, data);
            totalBatchTonnes += data.co2Tonnes;
        }

        emit CreditBatchMinted(tokenIds, projectId, totalBatchTonnes);
    }

    function setRegistrySync(address newRegistrySync) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRegistrySync.code.length > 0, "RegistrySync must be a contract");
        address previous = address(registrySync);
        registrySync = IRegistrySync(newRegistrySync);
        emit RegistrySyncUpdated(previous, newRegistrySync);
    }

    /**
     * @dev Shared validation + issuance for `mintCredit` and `batchMint`.
     *      Effects (credit data, counters, serial registration) are written BEFORE the
     *      external `_safeMint` receiver callback; callers are additionally `nonReentrant`.
     */
    function _issueCredit(
        address to,
        string memory projectId,
        CreditData memory data
    ) private returns (uint256 tokenId) {
        require(to != address(0), "Invalid recipient");
        require(bytes(projectId).length > 0, "Project required");
        require(bytes(data.methodology).length > 0, "Methodology required");
        require(data.co2Tonnes > 0 && data.co2Tonnes <= MAX_TONNES_PER_CREDIT, "Invalid CO2 amount");
        require(
            data.vintageYear >= MIN_VINTAGE_YEAR && data.vintageYear <= MAX_VINTAGE_YEAR,
            "Invalid vintage year"
        );
        require(data.oracleProofHash != bytes32(0), "Oracle proof required");

        // Prevent double-counting across registries / methodology labels
        bytes32 serialHash = _serialKey(data.serialNumber);
        require(serialHash != bytes32(0), "Serial required");
        require(!issuedSerials[serialHash], "Credit already tokenized");
        issuedSerials[serialHash] = true;

        _tokenIds.increment();
        tokenId = _tokenIds.current();

        credits[tokenId] = CarbonCredit({
            projectId: projectId,
            projectName: data.projectName,
            methodology: data.methodology,
            co2Tonnes: data.co2Tonnes,
            vintageYear: data.vintageYear,
            geography: data.geography,
            oracleProofHash: data.oracleProofHash,
            satelliteDataCID: data.satelliteDataCID,
            verificationSource: msg.sender,
            verificationDate: block.timestamp,
            isRetired: false,
            issuanceDate: block.timestamp,
            serialNumber: data.serialNumber
        });

        totalMintedTonnes += data.co2Tonnes;
        totalActiveCredits++;
        methodologyTonnes[data.methodology] += data.co2Tonnes;
        projectCredits[projectId].push(tokenId);

        emit CreditMinted(tokenId, projectId, to, data.co2Tonnes, data.methodology);
        emit SerialNumberRegistered(serialHash, data.serialNumber, tokenId);

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, data.tokenURI);
    }

    function _requireExternalRegistryAttestation(string memory registry, string memory serialNumber) private view {
        require(bytes(registry).length > 0, "Registry required");
        require(address(registrySync) != address(0), "RegistrySync not configured");
        require(registrySync.isCreditVerified(registry, serialNumber), "External registry credit not verified");
        require(!registrySync.isSerialUsed(registry, serialNumber), "External registry serial already used");
        uint256 verifiedAt = registrySync.verificationTimestamp(registry, serialNumber);
        require(verifiedAt != 0 && block.timestamp <= verifiedAt + MAX_REGISTRY_ATTESTATION_AGE, "Registry attestation stale");
    }

    /**
     * @notice Retire (burn) a carbon credit for offsetting
     * @dev Emits retirement certificate for ESG reporting
     * @param tokenId Token to retire
     * @param reason Retirement reason (e.g., "Q1 2026 Corporate Offsetting")
     */
    function retireCredit(uint256 tokenId, string memory reason)
        external
        nonReentrant
    {
        require(ownerOf(tokenId) == msg.sender, "Not credit owner");
        require(!credits[tokenId].isRetired, "Already retired");
        require(bytes(reason).length > 0, "Reason required");

        CarbonCredit storage credit = credits[tokenId];
        require(credit.co2Tonnes > 0, "Credit not initialised");
        credit.isRetired = true;

        // Create retirement certificate
        retirementCertificates[tokenId] = RetirementCertificate({
            originalTokenId: tokenId,
            retiredBy: msg.sender,
            retirementDate: block.timestamp,
            retirementReason: reason,
            co2Tonnes: credit.co2Tonnes
        });

        // Update global stats
        totalRetiredTonnes += credit.co2Tonnes;
        totalActiveCredits--;
        userRetiredTonnes[msg.sender] += credit.co2Tonnes;

        emit CreditRetired(tokenId, msg.sender, block.timestamp, credit.co2Tonnes, reason);

        // Burn NFT (permanent destruction)
        _burn(tokenId);
    }

    /**
     * @notice Batch retirement for enterprises (gas-optimized)
     * @param tokenIds Array of token IDs to retire
     * @param reason Shared retirement reason
     */
    function batchRetire(uint256[] calldata tokenIds, string memory reason)
        external
        nonReentrant
    {
        require(tokenIds.length > 0 && tokenIds.length <= 50, "Invalid batch size");

        uint256 totalRetiredBatch = 0;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            require(ownerOf(tokenId) == msg.sender, "Not owner");
            require(!credits[tokenId].isRetired, "Already retired");

            CarbonCredit storage credit = credits[tokenId];
            require(credit.co2Tonnes > 0, "Credit not initialised");
            credit.isRetired = true;

            retirementCertificates[tokenId] = RetirementCertificate({
                originalTokenId: tokenId,
                retiredBy: msg.sender,
                retirementDate: block.timestamp,
                retirementReason: reason,
                co2Tonnes: credit.co2Tonnes
            });

            totalRetiredBatch += credit.co2Tonnes;

            emit CreditRetired(tokenId, msg.sender, block.timestamp, credit.co2Tonnes, reason);

            _burn(tokenId);
        }

        totalRetiredTonnes += totalRetiredBatch;
        totalActiveCredits -= tokenIds.length;
        userRetiredTonnes[msg.sender] += totalRetiredBatch;
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get comprehensive credit information
     */
    function getCreditDetails(uint256 tokenId)
        external
        view
        returns (CarbonCredit memory)
    {
        require(_exists(tokenId), "Token does not exist");
        return credits[tokenId];
    }

    /**
     * @notice Get all credits for a specific project
     */
    function getProjectCredits(string memory projectId)
        external
        view
        returns (uint256[] memory)
    {
        return projectCredits[projectId];
    }

    /**
     * @notice Get user's retirement certificate for ESG reporting
     */
    function getRetirementCertificate(uint256 tokenId)
        external
        view
        returns (RetirementCertificate memory)
    {
        require(retirementCertificates[tokenId].retiredBy != address(0), "Not retired");
        return retirementCertificates[tokenId];
    }

    /**
     * @notice Get global carbon statistics
     */
    function getGlobalStats()
        external
        view
        returns (
            uint256 minted,
            uint256 retired,
            uint256 active,
            uint256 totalTokens
        )
    {
        return (
            totalMintedTonnes,
            totalRetiredTonnes,
            totalActiveCredits,
            _tokenIds.current()
        );
    }

    /**
     * @notice Get methodology-specific statistics
     */
    function getMethodologyStats(string memory methodology)
        external
        view
        returns (uint256 totalTonnes)
    {
        return methodologyTonnes[methodology];
    }

    /**
     * @notice Verify if a serial number has been tokenized (anti-fraud)
     * @dev The registry/methodology argument is intentionally IGNORED: the double-counting
     *      key is the canonical serial only. The parameter is kept so existing callers
     *      (RegistrySync, frontend ABI) keep working.
     */
    function isSerialTokenized(string memory /* methodology */, string memory serialNumber)
        external
        view
        returns (bool)
    {
        return issuedSerials[_serialKey(serialNumber)];
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @notice Emergency pause (e.g., oracle compromise detected)
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Update oracle proof (e.g., reverification after audit)
     * @dev A zero proof is rejected: it would silently turn a verified credit into an
     *      unverified one that wrappers/CCT pools no longer accept.
     */
    function updateVerification(
        uint256 tokenId,
        bytes32 newProofHash,
        string memory newSatelliteCID
    )
        external
        onlyRole(ORACLE_ROLE)
    {
        require(_exists(tokenId), "Token does not exist");
        require(newProofHash != bytes32(0), "Oracle proof required");

        credits[tokenId].oracleProofHash = newProofHash;
        credits[tokenId].satelliteDataCID = newSatelliteCID;
        credits[tokenId].verificationDate = block.timestamp;

        emit VerificationUpdated(tokenId, msg.sender, newProofHash);
    }

    // ============ INTERNAL HELPERS ============

    /**
     * @dev Canonical double-counting key: trims ASCII whitespace, upper-cases a-z, then
     *      hashes with `abi.encode` (length-delimited, no packed ambiguity).
     *      Returns bytes32(0) for an empty / whitespace-only serial.
     */
    function _serialKey(string memory serialNumber) private pure returns (bytes32) {
        bytes memory s = bytes(serialNumber);
        uint256 start = 0;
        uint256 end = s.length;
        while (start < end && _isSpace(s[start])) start++;
        while (end > start && _isSpace(s[end - 1])) end--;
        if (end == start) return bytes32(0);

        bytes memory out = new bytes(end - start);
        for (uint256 i = 0; i < out.length; i++) {
            bytes1 c = s[start + i];
            if (c >= 0x61 && c <= 0x7a) {
                c = bytes1(uint8(c) - 32);
            }
            out[i] = c;
        }
        return keccak256(abi.encode(string(out)));
    }

    function _isSpace(bytes1 c) private pure returns (bool) {
        return c == 0x20 || c == 0x09 || c == 0x0a || c == 0x0d;
    }

    // ============ REQUIRED OVERRIDES ============

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function _burn(uint256 tokenId)
        internal
        override(ERC721, ERC721URIStorage)
    {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

// ============ HELPER STRUCT FOR MINTING ============
struct CreditData {
    string projectName;
    string serialNumber;
    string methodology;
    uint256 co2Tonnes;
    uint256 vintageYear;
    string geography;
    bytes32 oracleProofHash;
    string satelliteDataCID;
    string tokenURI;
}
