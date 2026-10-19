// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/FunctionsClient.sol";
import "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/libraries/FunctionsRequest.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title FunctionsConsumer
 * @notice Shared Chainlink Functions plumbing of the three Carbonized oracle contracts
 *         (CarbonPriceOracle, EmissionVerifier, RegistrySync).
 *
 * @dev What lives here, and why:
 *  - The JavaScript that runs on the DON is NOT embedded in Solidity. The admin uploads it with
 *    `setSource(string)` (bounded length, event, `sourceHash` exposed for off-chain verification). The
 *    reference sources are versioned in `scripts/functions/*.js`; compare `keccak256(file)` with
 *    `sourceHash()` to prove which code the oracle runs.
 *  - The request arguments are built ON-CHAIN by the concrete contract from validated state
 *    (methodology, URL templates configured by the admin, project/serial data), never from free-form
 *    caller input. `_sendFunctionsRequest` bounds the number and size of the args.
 *  - Optional secrets are attached with the standard DON-hosted reference (`slotId` + `version`), set by
 *    the admin through `setDONHostedSecrets`. Version 0 means "no secrets" (the default: the reference
 *    sources work without any secret). Remote (URL-encrypted) secrets are intentionally not supported.
 *  - `fulfillRequest` implementations MUST NOT revert on bad DON output (the router would swallow the
 *    revert and the answer would be lost): they settle the request and emit a failure event instead.
 *
 * Everything here is `DEFAULT_ADMIN_ROLE` gated, so it can be handed to a multisig.
 *
 * The exact Chainlink Functions Router / DON id / subscription of the target chain are NOT assumed by this
 * code: they are constructor / `setFunctionsConfig` inputs that must come from Chainlink's official
 * documentation for that chain (and Functions availability on the chain must be verified first).
 */
abstract contract FunctionsConsumer is FunctionsClient, AccessControl {
    using FunctionsRequest for FunctionsRequest.Request;

    // ============ LIMITS ============
    /// @notice Callback gas bounds enforced by `setFunctionsConfig` (the router may cap it lower).
    uint32 public constant MIN_GAS_LIMIT = 200_000;
    uint32 public constant MAX_GAS_LIMIT = 1_000_000;
    /// @notice Max byte length of the stored JavaScript source (Functions requests are size-limited by the
    ///         router; the reference sources are well below this).
    uint256 public constant MAX_SOURCE_LENGTH = 16_000;
    /// @notice Max number of string arguments and max byte length of each one in a request.
    uint256 public constant MAX_REQUEST_ARGS = 8;
    uint256 public constant MAX_REQUEST_ARG_LENGTH = 512;

    // ============ STATE ============
    address public functionsRouter;
    bytes32 public donId;
    uint64 public subscriptionId;
    uint32 public gasLimit = 300_000;

    /// @notice JavaScript executed by the DON (inline source of every request). Empty until `setSource`.
    string public source;
    /// @notice keccak256 of `source` (bytes32(0) while no source is set).
    bytes32 public sourceHash;

    /// @notice DON-hosted secrets reference attached to each request; `secretsVersion == 0` => none.
    uint8 public secretsSlotId;
    uint64 public secretsVersion;

    // ============ EVENTS ============
    event FunctionsConfigUpdated(bytes32 donId, uint64 subscriptionId, uint32 gasLimit);
    event SourceUpdated(bytes32 indexed sourceHash, uint256 length);
    event DONHostedSecretsUpdated(uint8 slotId, uint64 version);

    constructor(address functionsRouter_) FunctionsClient(functionsRouter_) {
        require(functionsRouter_ != address(0), "Invalid router");
        functionsRouter = functionsRouter_;
    }

    // ============ ADMIN ============

    /**
     * @notice Point the contract at a DON and a funded Functions subscription.
     * @param donId_ DON id (bytes32, e.g. the encoded string "fun-<chain>-<n>") from Chainlink's docs.
     * @param subscriptionId_ Functions subscription that pays for the requests; this contract must be
     *        added to it as a consumer.
     * @param gasLimit_ Callback gas limit; MIN_GAS_LIMIT..MAX_GAS_LIMIT (the router enforces its own,
     *        possibly lower, maximum).
     */
    function setFunctionsConfig(
        bytes32 donId_,
        uint64 subscriptionId_,
        uint32 gasLimit_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(gasLimit_ >= MIN_GAS_LIMIT && gasLimit_ <= MAX_GAS_LIMIT, "Gas limit out of bounds");
        donId = donId_;
        subscriptionId = subscriptionId_;
        gasLimit = gasLimit_;
        emit FunctionsConfigUpdated(donId_, subscriptionId_, gasLimit_);
    }

    /**
     * @notice Upload the JavaScript the DON executes for this contract's requests.
     * @dev 1..MAX_SOURCE_LENGTH bytes. `sourceHash` is updated and emitted so anyone can compare it with
     *      the audited file. Requests already in flight keep the source they were sent with.
     */
    function setSource(string calldata newSource) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 length = bytes(newSource).length;
        require(length > 0 && length <= MAX_SOURCE_LENGTH, "Invalid source length");
        source = newSource;
        bytes32 hash = keccak256(bytes(newSource));
        sourceHash = hash;
        emit SourceUpdated(hash, length);
    }

    /**
     * @notice Attach (or detach) DON-hosted secrets to every request.
     * @param slotId_ Slot the secrets were uploaded to (`SecretsManager.uploadEncryptedSecretsToDON`).
     * @param version_ Version returned by the upload; 0 disables secrets.
     */
    function setDONHostedSecrets(uint8 slotId_, uint64 version_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        secretsSlotId = slotId_;
        secretsVersion = version_;
        emit DONHostedSecretsUpdated(slotId_, version_);
    }

    // ============ INTERNAL ============

    /// @dev Sends one Functions request with the stored source, optional DON-hosted secrets, the given
    ///      args, the configured subscription / DON / callback gas limit. Reverts if not configured.
    function _sendFunctionsRequest(string[] memory args) internal returns (bytes32 requestId) {
        require(bytes(source).length > 0, "Source not set");
        require(subscriptionId != 0 && donId != bytes32(0), "Functions not configured");
        require(args.length > 0 && args.length <= MAX_REQUEST_ARGS, "Invalid args");
        for (uint256 i = 0; i < args.length; i++) {
            require(bytes(args[i]).length <= MAX_REQUEST_ARG_LENGTH, "Arg too long");
        }

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(source);
        if (secretsVersion != 0) {
            req.addDONHostedSecrets(secretsSlotId, secretsVersion);
        }
        req.setArgs(args);

        requestId = _sendRequest(req.encodeCBOR(), subscriptionId, gasLimit, donId);
    }

    /// @dev Operator-supplied URL templates must be non-empty, at most `MAX_REQUEST_ARG_LENGTH` bytes and
    ///      start with `https://` (the reference sources additionally refuse anything else at run time).
    function _requireHttpsUrl(string memory url) internal pure {
        bytes memory b = bytes(url);
        require(b.length > 8 && b.length <= MAX_REQUEST_ARG_LENGTH, "Invalid URL length");
        bytes memory prefix = "https://";
        for (uint256 i = 0; i < 8; i++) {
            require(b[i] == prefix[i], "URL must be https");
        }
    }
}
