// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./FunctionsConsumer.sol";
import "../core/CarbonCreditNFT.sol";

/**
 * @title RegistrySync
 * @notice Prevents double-counting by checking credit serials against external registries
 * @dev Uses Chainlink Functions to query Verra, Gold Standard, and ICM registries
 *
 * Problem: Same carbon reduction could be tokenized on multiple platforms
 * Solution: Before tokenizing an EXTERNAL registry credit, check its serial number at the source.
 *
 * Semantics of the oracle answer (per registry + serial):
 * - NOT_FOUND  -> the serial is unknown at the source. It is NOT verified (a typo or a fabricated serial
 *                 must never be "cleared"); any earlier verified/used flag is cleared.
 * - ACTIVE     -> the credit still circulates at the source: tokenizing it would double count. It is
 *                 flagged as used (`registrySerials`) and NOT verified.
 * - RETIRED    -> the credit exists and is retired/locked at the source: it is cleared for tokenization
 *                 (`isCreditVerified == true`).
 * - oracle error -> no state change (fail closed: never verified).
 * The newest request wins; an answer to an older request for the same serial is recorded on the check
 * but does not overwrite a newer verdict.
 *
 * HOW THE NFT SHOULD CONSUME THIS (ADVISORY - NOT ENFORCED ON-CHAIN):
 * `CarbonCreditNFT.mintCredit` does not call this contract. This contract is an advisory oracle that an
 * ISSUER (a trusted minting backend / multisig) MUST consult before issuing a credit that originates in an
 * external registry: `require(registrySync.isCreditVerified(registry, serial) && !registrySync.isSerialUsed(registry, serial))`.
 * Registry names here are "VERRA" | "GOLD_STANDARD" | "ICM", which differ from the NFT methodology strings
 * ("VERRA_VCS", ...). Credits minted natively by `EmissionVerifier` do not originate in an external
 * registry and are protected by the verifier's own per-period guard and the NFT's serial uniqueness.
 * Wiring `isCreditVerified` into `mintCredit` would be a change to the NFT contract's trust model and is
 * intentionally left to that contract's owners.
 *
 * Chainlink Functions request / response (the JavaScript is admin-uploaded with `setSource`, reference file
 * `scripts/functions/registry-check.js`; no registry API is hard-coded):
 *   args[0] registry name ("VERRA" | "GOLD_STANDARD" | "ICM" | any added with `addRegistry`)
 *   args[1] serial number
 *   args[2] the registry's admin-configured `apiEndpoint`: an https URL template containing `{serial}`
 * The DON must answer with exactly 32 bytes, `abi.encode(uint256 status)`: 0 = NOT_FOUND, 1 = ACTIVE, 2 = RETIRED.
 * Any other value, another length or error bytes is recorded as "ERROR" and changes no verdict (fail closed).
 *
 * The three default registries are created INACTIVE and without endpoint: the operator provides the real endpoint
 * with `setRegistryEndpoint` and then enables it with `setRegistryStatus`.
 *
 * Roles use OpenZeppelin AccessControl; they can be granted to a multisig (`grantRole`).
 */
contract RegistrySync is FunctionsConsumer, ReentrancyGuard {
    // ============ ROLES ============
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // ============ LIMITS ============
    uint256 public constant MAX_BATCH_SIZE = 20;
    uint256 public constant MAX_SERIAL_LENGTH = 128;


    CarbonCreditNFT public immutable nftContract;

    /// @notice Registry verification request
    struct RegistryCheck {
        bytes32 requestId;
        string registry;              // "VERRA" | "GOLD_STANDARD" | "ICM"
        string serialNumber;
        address requester;
        uint256 requestTime;
        bool fulfilled;
        bool existsInRegistry;        // true = the serial exists at the external registry
        string registryStatus;        // "ACTIVE" | "RETIRED" | "NOT_FOUND" | "ERROR"
        bytes32 registryProofHash;
    }

    /// @notice Whitelist of verified registries
    struct Registry {
        string name;
        string apiEndpoint;
        bool isActive;
        uint256 checksPerformed;
        uint256 duplicatesFound;
    }

    // ============ MAPPINGS ============
    mapping(bytes32 => RegistryCheck) public registryChecks;
    mapping(string => Registry) public registries;
    /// @notice registry => serial => the credit still circulates (ACTIVE) at the external registry
    mapping(string => mapping(string => bool)) public registrySerials;
    /// @notice keccak256(abi.encode(registry, serial)) => credit exists AND is retired at the source
    mapping(bytes32 => bool) public verifiedCredits;
    /// @notice Request timestamp for the currently accepted RETIRED verdict.
    mapping(bytes32 => uint256) private _verificationTimestamps;
    /// @dev Monotonic request ordering prevents same-block timestamps from accepting stale oracle answers.
    uint256 private _requestSequence;
    mapping(bytes32 => uint256) private _requestSequences;
    mapping(bytes32 => uint256) private _latestRequestSequences;

    string[] public registryList;

    // ============ EVENTS ============
    event RegistryCheckRequested(
        bytes32 indexed requestId,
        string indexed registry,
        string serialNumber
    );

    event RegistryCheckFulfilled(
        bytes32 indexed requestId,
        string indexed registry,
        string serialNumber,
        bool existsInRegistry,
        string status
    );

    event DuplicateCreditDetected(
        string indexed registry,
        string serialNumber,
        address requester
    );

    event RegistryAdded(string indexed registry, string apiEndpoint);

    event RegistryStatusChanged(string indexed registry, bool isActive);

    event CreditVerified(
        bytes32 indexed creditHash,
        string registry,
        string serialNumber
    );

    event CreditVerificationRevoked(
        bytes32 indexed creditHash,
        string registry,
        string serialNumber
    );

    event RegistryEndpointUpdated(string indexed registry, string apiEndpoint);

    // ============ CONSTRUCTOR ============
    constructor(
        address functionsRouter_,
        address nftContract_
    ) FunctionsConsumer(functionsRouter_) {
        require(nftContract_ != address(0), "Invalid NFT contract");

        nftContract = CarbonCreditNFT(nftContract_);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);

        // Default registry names: inactive and without endpoint until the operator configures a real one
        _addRegistry("VERRA", "", false);
        _addRegistry("GOLD_STANDARD", "", false);
        _addRegistry("ICM", "", false);
    }

    // ============ CORE FUNCTIONS ============

    /**
     * @notice Ask the oracle whether a serial number exists / is retired in an external registry
     * @dev Result is advisory input for issuers, see the contract-level NatSpec.
     * @param registry Registry name ("VERRA", "GOLD_STANDARD", "ICM")
     * @param serialNumber Credit serial number to check
     * @return requestId Chainlink Functions request ID
     */
    function checkRegistry(
        string memory registry,
        string memory serialNumber
    ) external onlyRole(VERIFIER_ROLE) nonReentrant returns (bytes32 requestId) {
        return _checkRegistry(registry, serialNumber, msg.sender);
    }

    /**
     * @notice Batch check multiple serials (gas-optimized)
     * @dev Uses the internal request path so the caller (not this contract) is the recorded requester
     *      and keeps its VERIFIER_ROLE check.
     */
    function batchCheckRegistry(
        string memory registry,
        string[] memory serialNumbers
    ) external onlyRole(VERIFIER_ROLE) nonReentrant returns (bytes32[] memory requestIds) {
        require(serialNumbers.length > 0 && serialNumbers.length <= MAX_BATCH_SIZE, "Invalid batch size");

        requestIds = new bytes32[](serialNumbers.length);

        for (uint256 i = 0; i < serialNumbers.length; i++) {
            requestIds[i] = _checkRegistry(registry, serialNumbers[i], msg.sender);
        }

        return requestIds;
    }

    function _checkRegistry(
        string memory registry,
        string memory serialNumber,
        address requester
    ) internal returns (bytes32 requestId) {
        require(registries[registry].isActive, "Registry not supported");
        require(
            bytes(serialNumber).length > 0 && bytes(serialNumber).length <= MAX_SERIAL_LENGTH,
            "Invalid serial number"
        );

        // args: [registry, serialNumber, endpoint template containing {serial}]
        string[] memory args = new string[](3);
        args[0] = registry;
        args[1] = serialNumber;
        args[2] = registries[registry].apiEndpoint;

        // Send request (stored source, optional DON-hosted secrets, configured sub / DON / gas)
        requestId = _sendFunctionsRequest(args);
        require(registryChecks[requestId].requestTime == 0, "Duplicate request id");
        bytes32 creditHash = keccak256(abi.encode(registry, serialNumber));
        uint256 sequence = ++_requestSequence;
        _requestSequences[requestId] = sequence;
        _latestRequestSequences[creditHash] = sequence;

        // Track request
        registryChecks[requestId] = RegistryCheck({
            requestId: requestId,
            registry: registry,
            serialNumber: serialNumber,
            requester: requester,
            requestTime: block.timestamp,
            fulfilled: false,
            existsInRegistry: false,
            registryStatus: "",
            registryProofHash: bytes32(0)
        });

        registries[registry].checksPerformed++;

        emit RegistryCheckRequested(requestId, registry, serialNumber);
    }

    /**
     * @notice Chainlink Functions callback - receives registry check result
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        RegistryCheck storage check = registryChecks[requestId];
        require(check.requestTime != 0, "Unknown request");
        require(!check.fulfilled, "Request already fulfilled");

        // Oracle error / malformed answer: record it, but change NO verdict (fail closed).
        // Valid answer: abi.encode(uint256 status), 0 = NOT_FOUND, 1 = ACTIVE, 2 = RETIRED.
        if (err.length > 0 || response.length != 32 || abi.decode(response, (uint256)) > 2) {
            check.fulfilled = true;
            check.existsInRegistry = false;
            check.registryStatus = "ERROR";
            emit RegistryCheckFulfilled(requestId, check.registry, check.serialNumber, false, "ERROR");
            return;
        }

        uint8 statusCode = uint8(abi.decode(response, (uint256)));
        bool exists = statusCode != 0;
        string memory status = statusCode == 2 ? "RETIRED" : (statusCode == 1 ? "ACTIVE" : "NOT_FOUND");

        // Update check
        check.fulfilled = true;
        check.existsInRegistry = exists;
        check.registryStatus = status;
        check.registryProofHash = keccak256(response);

        // Apply only the latest request for this credit. A timestamp comparison is unsafe because
        // batch requests share block.timestamp and a stale answer could otherwise overwrite a newer one.
        bytes32 creditHash = keccak256(abi.encode(check.registry, check.serialNumber));
        if (_requestSequences[requestId] == _latestRequestSequences[creditHash]) {
            _applyVerdict(creditHash, check, exists, statusCode);
        }

        emit RegistryCheckFulfilled(requestId, check.registry, check.serialNumber, exists, status);
    }

    function _applyVerdict(
        bytes32 creditHash,
        RegistryCheck storage check,
        bool exists,
        uint8 statusCode
    ) private {
        bool nowVerified = exists && statusCode == 2; // exists AND retired at the source
        bool stillCirculating = exists && statusCode != 2; // ACTIVE (or unrecognised status): double-count risk

        registrySerials[check.registry][check.serialNumber] = stillCirculating;

        if (stillCirculating) {
            registries[check.registry].duplicatesFound++;
            emit DuplicateCreditDetected(check.registry, check.serialNumber, check.requester);
        }

        bool wasVerified = verifiedCredits[creditHash];
        if (nowVerified) {
            verifiedCredits[creditHash] = true;
            _verificationTimestamps[creditHash] = check.requestTime;
            if (!wasVerified) emit CreditVerified(creditHash, check.registry, check.serialNumber);
        } else if (wasVerified) {
            delete verifiedCredits[creditHash];
            delete _verificationTimestamps[creditHash];
            emit CreditVerificationRevoked(creditHash, check.registry, check.serialNumber);
        }
    }

    /**
     * @notice Is this credit cleared for tokenization? True ONLY if the oracle saw the serial at the
     *         external registry in status RETIRED. Unknown / never-checked / ACTIVE / errored => false.
     * @dev Advisory: see the contract-level NatSpec for how an issuer / the NFT must use it.
     */
    function isCreditVerified(string memory registry, string memory serialNumber)
        external
        view
        returns (bool)
    {
        return verifiedCredits[keccak256(abi.encode(registry, serialNumber))];
    }

    function verificationTimestamp(string memory registry, string memory serialNumber)
        external
        view
        returns (uint256)
    {
        return _verificationTimestamps[keccak256(abi.encode(registry, serialNumber))];
    }

    /**
     * @notice Check if serial exists in local cache (fast check before oracle)
     */
    function isSerialUsed(string memory registry, string memory serialNumber)
        external
        view
        returns (bool)
    {
        // Check local NFT contract
        bool usedLocally = nftContract.isSerialTokenized(registry, serialNumber);

        // Check external registry cache
        bool usedExternally = registrySerials[registry][serialNumber];

        return usedLocally || usedExternally;
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @notice Add an ACTIVE registry with its operator-provided endpoint.
     * @param name Registry name used in `checkRegistry`.
     * @param apiEndpoint https URL template containing `{serial}`; the endpoint must answer 404 for unknown serials and
     *        JSON `{"status": "ACTIVE" | "RETIRED"}` otherwise (see scripts/functions/README.md).
     */
    function addRegistry(string memory name, string memory apiEndpoint)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _addRegistry(name, apiEndpoint, true);
    }

    function _addRegistry(string memory name, string memory apiEndpoint, bool active) internal {
        require(bytes(name).length > 0, "Invalid registry name");
        require(bytes(registries[name].name).length == 0, "Registry exists");
        if (active) _requireEndpoint(apiEndpoint);

        registries[name] = Registry({
            name: name,
            apiEndpoint: apiEndpoint,
            isActive: active,
            checksPerformed: 0,
            duplicatesFound: 0
        });

        registryList.push(name);

        emit RegistryAdded(name, apiEndpoint);
    }

    /// @notice Set / replace the endpoint template of an existing registry (does not change its active flag).
    function setRegistryEndpoint(string memory name, string memory apiEndpoint)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(bytes(registries[name].name).length != 0, "Unknown registry");
        _requireEndpoint(apiEndpoint);
        registries[name].apiEndpoint = apiEndpoint;
        emit RegistryEndpointUpdated(name, apiEndpoint);
    }

    /// @dev A registry can only be active with an endpoint configured.
    function setRegistryStatus(string memory name, bool isActive)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(bytes(registries[name].name).length != 0, "Unknown registry");
        require(!isActive || bytes(registries[name].apiEndpoint).length != 0, "Endpoint not set");
        registries[name].isActive = isActive;
        emit RegistryStatusChanged(name, isActive);
    }

    /// @dev https URL template that contains the literal `{serial}` placeholder.
    function _requireEndpoint(string memory apiEndpoint) internal pure {
        _requireHttpsUrl(apiEndpoint);
        bytes memory b = bytes(apiEndpoint);
        bytes memory needle = "{serial}";
        bool found = false;
        for (uint256 i = 0; i + needle.length <= b.length && !found; i++) {
            found = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (b[i + j] != needle[j]) {
                    found = false;
                    break;
                }
            }
        }
        require(found, "Endpoint needs {serial}");
    }

    // ============ VIEW FUNCTIONS ============

    function getRegistryCheck(bytes32 requestId)
        external
        view
        returns (RegistryCheck memory)
    {
        return registryChecks[requestId];
    }

    function getRegistry(string memory name)
        external
        view
        returns (Registry memory)
    {
        return registries[name];
    }

    function getSupportedRegistries() external view returns (string[] memory) {
        return registryList;
    }

    function getRegistryStats(string memory name)
        external
        view
        returns (
            uint256 checksPerformed,
            uint256 duplicatesFound,
            bool isActive
        )
    {
        Registry memory reg = registries[name];
        return (reg.checksPerformed, reg.duplicatesFound, reg.isActive);
    }
}
