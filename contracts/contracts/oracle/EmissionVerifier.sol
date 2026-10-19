// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./FunctionsConsumer.sol";
import "../core/CarbonCreditNFT.sol";

/**
 * @title EmissionVerifier
 * @notice Oracle-powered emission verification using Chainlink Functions + Automation
 * @dev Fetches the emission measurement of a project from operator-provided HTTP endpoints (one primary, one optional
 *      cross-check) inside a Chainlink Functions run and records it onchain.
 *
 * Architecture:
 * 1. Project registers with baseline emission data
 * 2. Chainlink Automation triggers periodic verification (monthly/quarterly)
 * 3. Chainlink Functions aggregates multi-source emission data; the cheap `fulfillRequest` callback
 *    only RECORDS the verified measurement
 * 4. Anyone calls `claimCredits(requestId)` to mint the credits for a recorded reduction (the NFT is
 *    always minted to the project owner). Minting is deliberately NOT done inside the callback: the real
 *    Chainlink Functions router caps `callbackGasLimit` (a few hundred thousand gas) and the mint path
 *    (~760k gas measured) would run out of gas, silently dropping the result.
 *
 * Units: ALL emission figures (`baselineEmissions`, `measuredEmissions`, `reductionAchieved`) are tonnes
 * of CO2e with 18 decimals (1000e18 = 1000 tonnes), exactly like `CarbonCreditNFT.co2Tonnes`. The
 * Functions source returns the measurement already scaled to 18 decimals; the reduction is minted 1:1.
 * `baselineEmissions` is the baseline for ONE verification period (same time basis as the measurement).
 *
 * Over-issuance guards (AUD-ORACLE-03):
 * - at most one in-flight request per project (`pendingRequestId`), and the callback only accepts
 *   exactly that request id (request-id binding; superseded / unknown ids are rejected);
 * - a new request is only possible once `verificationInterval` has elapsed since the last successful
 *   verification, and not within MIN_RETRY_DELAY of the previous request;
 * - each (project, period) can be successfully verified once (`periodVerified`) and each verified
 *   request can be claimed once (`claimed`); the NFT serial is deterministic per (project, period),
 *   so the NFT contract's own serial check is a second barrier;
 * - project ids can never be re-registered, so period indexes never repeat.
 *
 * Roles use OpenZeppelin AccessControl; every role can be granted to a multisig (`grantRole`).
 *
 * Chainlink Functions request / response (the JavaScript is admin-uploaded with `setSource`, reference file
 * `scripts/functions/emission.js`; nothing is hard-coded here):
 *   args[0] projectId
 *   args[1] project.iotEndpoint     primary measurement URL template (https; `{projectId}`, `{from}`, `{to}` are replaced)
 *   args[2] project.satelliteRegion optional cross-check URL template (same placeholders; "" = none). The field name is
 *                                   legacy: it holds an https URL, not coordinates.
 *   args[3] crossCheckToleranceBps  max disagreement between the two measurements (decimal string)
 *   args[4] window start = lastVerificationTime (unix seconds, decimal string)
 *   args[5] window end   = block.timestamp of the request (unix seconds, decimal string)
 * The DON must answer with exactly 64 bytes, `abi.encode(uint256 measuredEmissions, uint256 confidence)`:
 *   measuredEmissions  tonnes CO2e of the window, 18 decimals (> 0)
 *   confidence         1..100; a recorded verification only becomes claimable at >= MIN_CLAIM_CONFIDENCE (the reference
 *                      source returns 100 when two sources agree and 70 for a single source)
 * Error bytes, another length, zero or an invalid confidence settle the request as failed (never minted).
 *
 * Data sources: operator-provided per project (`registerProject`); none is assumed by the contract.
 */
contract EmissionVerifier is
    FunctionsConsumer,
    AutomationCompatibleInterface,
    ReentrancyGuard
{
    // ============ ROLES ============
    bytes32 public constant PROJECT_REGISTRAR_ROLE = keccak256("PROJECT_REGISTRAR_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant AUTOMATION_ROLE = keccak256("AUTOMATION_ROLE");

    // ============ LIMITS ============
    /// @notice Max baseline per project/period. Equals the NFT per-credit cap, so a claim can always be minted.
    uint256 public constant MAX_BASELINE = 10_000_000e18;
    uint256 public constant MIN_VERIFICATION_INTERVAL = 1 days;
    uint256 public constant MAX_VERIFICATION_INTERVAL = 365 days;
    uint256 public constant DEFAULT_VERIFICATION_INTERVAL = 30 days;
    /// @notice An unanswered request blocks the project for this long, then it may be re-requested.
    uint256 public constant PENDING_REQUEST_TIMEOUT = 6 hours;
    /// @notice Minimum time between two requests of the same project (stops failure retry loops burning LINK).
    uint256 public constant MIN_RETRY_DELAY = 1 hours;
    /// @notice A recorded verification only becomes claimable at or above this confidence.
    uint8 public constant MIN_CLAIM_CONFIDENCE = 90;
    /// @notice Max byte length of a project id.
    uint256 public constant MAX_PROJECT_ID_LENGTH = 64;

    // ============ STATE VARIABLES ============

    /// @notice Max disagreement (bps) between primary and cross-check measurement tolerated by the Functions source.
    uint256 public crossCheckToleranceBps = 1500; // 15%

    /// @notice Carbon credit NFT contract
    CarbonCreditNFT public immutable nftContract;

    /// @notice Project verification state
    struct Project {
        string projectId;
        address owner;
        string methodology;           // "ICM_COMPLIANCE" | "VERRA_VCS" | "GOLD_STANDARD"
        uint256 baselineEmissions;    // Baseline per verification period, tonnes CO2e, 18 decimals
        uint256 targetReduction;      // Target reduction percentage (e.g., 30 = 30%)
        uint256 lastVerificationTime;
        uint256 verificationInterval; // Seconds between verifications (30 days default)
        bool isActive;
        string iotEndpoint;           // IoT sensor API endpoint
        string satelliteRegion;       // Lat/lon for satellite data
        bytes32 auditorSignature;     // ACVA digital signature
    }

    /// @notice Verification request tracking
    struct VerificationRequest {
        bytes32 requestId;
        string projectId;
        uint256 requestTime;
        bool fulfilled;
        uint256 measuredEmissions;    // Actual emissions measured (18 decimals)
        uint256 reductionAchieved;    // Reduction vs baseline (18 decimals)
        bytes32 dataProofHash;        // keccak256 of the raw oracle response
        uint8 confidenceScore;        // 0-100 confidence level
        uint256 period;               // verification period index this request belongs to
        bool failed;                  // oracle error / malformed or implausible response
        bool claimed;                 // credits for this request already minted
    }

    // ============ MAPPINGS ============
    mapping(string => Project) public projects;
    mapping(bytes32 => VerificationRequest) public verificationRequests;
    mapping(string => bytes32[]) public projectRequests;      // projectId => requestIds
    mapping(string => uint256) public projectCreditsMinted;   // projectId => total tonnes (18 decimals)

    /// @notice In-flight request of a project (0 = none). The callback accepts only this id.
    mapping(string => bytes32) public pendingRequestId;
    mapping(string => uint256) public lastRequestTime;
    mapping(string => uint256) public projectStartTime;
    /// @notice projectId => period index => a measurement for this period was already recorded
    mapping(string => mapping(uint256 => bool)) public periodVerified;

    string[] public activeProjects;                           // For Automation upkeep
    mapping(string => bool) public isProjectIndexed;

    // ============ EVENTS ============
    event ProjectRegistered(
        string indexed projectId,
        address indexed owner,
        uint256 baselineEmissions,
        uint256 targetReduction
    );

    event VerificationRequested(
        bytes32 indexed requestId,
        string indexed projectId,
        uint256 requestTime
    );

    event VerificationFulfilled(
        bytes32 indexed requestId,
        string indexed projectId,
        uint256 measuredEmissions,
        uint256 reductionAchieved,
        uint8 confidenceScore
    );

    event VerificationFailed(bytes32 indexed requestId, string indexed projectId, string reason);

    event CreditsMinted(
        string indexed projectId,
        address indexed owner,
        uint256 amount,
        uint256 tokenId
    );

    event ProjectDeactivated(string indexed projectId, string reason);
    event CrossCheckToleranceChanged(uint256 crossCheckToleranceBps);

    // ============ CONSTRUCTOR ============
    constructor(
        address functionsRouter_,
        address nftContract_
    ) FunctionsConsumer(functionsRouter_) {
        require(nftContract_ != address(0), "Invalid NFT contract");

        nftContract = CarbonCreditNFT(nftContract_);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PROJECT_REGISTRAR_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
    }

    // ============ PROJECT MANAGEMENT ============

    /**
     * @notice Register a new carbon offset project
     * @dev Only authorized registrars (ACVA, project developers with verification). A project id can
     *      never be registered twice, even after deactivation.
     * @param projectId Unique project identifier
     * @param methodology Carbon standard (ICM/Verra/Gold Standard)
     * @param baselineEmissions Baseline emissions per verification period, tonnes CO2e with 18 decimals
     * @param targetReduction Target reduction percentage (e.g., 30 for 30%)
     * @param verificationInterval Seconds between verifications (0 = 30 days; otherwise 1 day .. 365 days)
     * @param iotEndpoint Primary measurement URL template (`https://...`, <= 512 bytes; `{projectId}`, `{from}`, `{to}` placeholders)
     * @param satelliteRegion Optional cross-check URL template (same rules; "" = single-source, which can never reach
     *        MIN_CLAIM_CONFIDENCE with the reference source). Legacy field name.
     * @param auditorSignature ACVA digital signature
     */
    function registerProject(
        string memory projectId,
        address owner,
        string memory methodology,
        uint256 baselineEmissions,
        uint256 targetReduction,
        uint256 verificationInterval,
        string memory iotEndpoint,
        string memory satelliteRegion,
        bytes32 auditorSignature
    ) external onlyRole(PROJECT_REGISTRAR_ROLE) {
        require(
            bytes(projectId).length > 0 && bytes(projectId).length <= MAX_PROJECT_ID_LENGTH,
            "Invalid project ID"
        );
        require(owner != address(0), "Invalid owner");
        require(bytes(methodology).length > 0, "Invalid methodology");
        require(baselineEmissions > 0 && baselineEmissions <= MAX_BASELINE, "Invalid baseline");
        require(targetReduction > 0 && targetReduction <= 100, "Invalid target");
        require(
            verificationInterval == 0
                || (verificationInterval >= MIN_VERIFICATION_INTERVAL && verificationInterval <= MAX_VERIFICATION_INTERVAL),
            "Invalid interval"
        );
        require(!isProjectIndexed[projectId], "Project already registered");
        _requireHttpsUrl(iotEndpoint);
        if (bytes(satelliteRegion).length > 0) _requireHttpsUrl(satelliteRegion);

        projects[projectId] = Project({
            projectId: projectId,
            owner: owner,
            methodology: methodology,
            baselineEmissions: baselineEmissions,
            targetReduction: targetReduction,
            lastVerificationTime: block.timestamp,
            verificationInterval: verificationInterval > 0 ? verificationInterval : DEFAULT_VERIFICATION_INTERVAL,
            isActive: true,
            iotEndpoint: iotEndpoint,
            satelliteRegion: satelliteRegion,
            auditorSignature: auditorSignature
        });
        projectStartTime[projectId] = block.timestamp;

        activeProjects.push(projectId);
        isProjectIndexed[projectId] = true;

        emit ProjectRegistered(projectId, owner, baselineEmissions, targetReduction);
    }

    /**
     * @notice Deactivate a project (e.g., project completed, fraud detected)
     * @dev Also blocks claiming of any not yet claimed verification of the project.
     */
    function deactivateProject(string memory projectId, string memory reason)
        external
        onlyRole(VERIFIER_ROLE)
    {
        require(projects[projectId].isActive, "Project not active");
        projects[projectId].isActive = false;
        delete pendingRequestId[projectId];

        emit ProjectDeactivated(projectId, reason);
    }

    // ============ CHAINLINK AUTOMATION (SCHEDULED VERIFICATION) ============

    /**
     * @notice Chainlink Automation calls this to check if verification is needed
     * @dev Lists active projects that are due: interval elapsed, no live request in flight and the
     *      retry delay respected.
     */
    function checkUpkeep(bytes calldata /* checkData */)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        string[] memory projectsToVerify = new string[](activeProjects.length);
        uint256 count = 0;

        for (uint256 i = 0; i < activeProjects.length; i++) {
            string memory projectId = activeProjects[i];
            if (_isDue(projectId)) {
                projectsToVerify[count] = projectId;
                count++;
            }
        }

        if (count > 0) {
            // Resize array to actual count
            string[] memory result = new string[](count);
            for (uint256 i = 0; i < count; i++) {
                result[i] = projectsToVerify[i];
            }

            upkeepNeeded = true;
            performData = abi.encode(result);
        } else {
            upkeepNeeded = false;
            performData = "";
        }
    }

    /**
     * @notice Chainlink Automation calls this to perform verification
     * @dev Triggers Chainlink Functions requests for all listed projects that are (still) due.
     *      Projects that are not due any more are skipped, so one stale entry cannot revert the batch.
     */
    function performUpkeep(bytes calldata performData)
        external
        override
        onlyRole(AUTOMATION_ROLE)
    {
        string[] memory projectsToVerify = abi.decode(performData, (string[]));

        for (uint256 i = 0; i < projectsToVerify.length; i++) {
            if (_isDue(projectsToVerify[i])) {
                _requestVerification(projectsToVerify[i]);
            }
        }
    }

    // ============ CHAINLINK FUNCTIONS (DATA FETCHING) ============

    /**
     * @notice Manually trigger verification (for testing or on-demand verification)
     * @dev Subject to the same interval / pending-request / retry-delay rules as the automated path.
     */
    function requestVerification(string memory projectId)
        external
        onlyRole(VERIFIER_ROLE)
    {
        require(projects[projectId].isActive, "Project not active");
        require(!_hasLivePendingRequest(projectId), "Request pending");
        require(
            block.timestamp >= projects[projectId].lastVerificationTime + projects[projectId].verificationInterval,
            "Verification interval not elapsed"
        );
        require(block.timestamp >= lastRequestTime[projectId] + MIN_RETRY_DELAY, "Retry too soon");
        _requestVerification(projectId);
    }

    /// @dev Whether `projectId` currently qualifies for a new verification request.
    function _isDue(string memory projectId) internal view returns (bool) {
        Project storage project = projects[projectId];
        return project.isActive
            && !_hasLivePendingRequest(projectId)
            && block.timestamp >= project.lastVerificationTime + project.verificationInterval
            && block.timestamp >= lastRequestTime[projectId] + MIN_RETRY_DELAY;
    }

    function _hasLivePendingRequest(string memory projectId) internal view returns (bool) {
        bytes32 pending = pendingRequestId[projectId];
        return pending != bytes32(0)
            && block.timestamp < verificationRequests[pending].requestTime + PENDING_REQUEST_TIMEOUT;
    }

    /// @dev Verification period index of a request made at `time`: periods are consecutive
    ///      `verificationInterval` windows counted from project registration.
    function _periodOf(string memory projectId, uint256 time) internal view returns (uint256) {
        return (time - projectStartTime[projectId]) / projects[projectId].verificationInterval;
    }

    /**
     * @notice Internal function to request emission data via Chainlink Functions
     */
    function _requestVerification(string memory projectId)
        internal
        nonReentrant
    {
        Project storage project = projects[projectId];
        require(project.isActive, "Project not active");

        // args: [projectId, measurement URL, cross-check URL, tolerance bps, window start, window end]
        string[] memory args = new string[](6);
        args[0] = projectId;
        args[1] = project.iotEndpoint;
        args[2] = project.satelliteRegion;
        args[3] = Strings.toString(crossCheckToleranceBps);
        args[4] = Strings.toString(project.lastVerificationTime);
        args[5] = Strings.toString(block.timestamp);

        // Send request to Chainlink DON (stored source, optional DON-hosted secrets, configured sub / DON / gas)
        bytes32 requestId = _sendFunctionsRequest(args);
        require(verificationRequests[requestId].requestTime == 0, "Duplicate request id");

        // Track request; it supersedes any timed-out earlier request of this project
        verificationRequests[requestId] = VerificationRequest({
            requestId: requestId,
            projectId: projectId,
            requestTime: block.timestamp,
            fulfilled: false,
            measuredEmissions: 0,
            reductionAchieved: 0,
            dataProofHash: bytes32(0),
            confidenceScore: 0,
            period: _periodOf(projectId, block.timestamp),
            failed: false,
            claimed: false
        });

        pendingRequestId[projectId] = requestId;
        lastRequestTime[projectId] = block.timestamp;
        projectRequests[projectId].push(requestId);

        emit VerificationRequested(requestId, projectId, block.timestamp);
    }

    /**
     * @notice Chainlink Functions callback - receives emission data
     * @dev Called by the Functions router (through FunctionsClient.handleOracleFulfillment). Cheap by
     *      design: it only records the measurement; credits are minted by `claimCredits`.
     *      Rejects unknown and superseded request ids (request-id binding).
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        VerificationRequest storage request = verificationRequests[requestId];
        require(request.requestTime != 0, "Unknown request");
        require(!request.fulfilled, "Request already fulfilled");
        require(pendingRequestId[request.projectId] == requestId, "Request superseded");

        // The request is settled whatever the answer is; the project can be requested again later.
        delete pendingRequestId[request.projectId];
        request.fulfilled = true;

        if (err.length > 0) {
            _failRequest(request, requestId, "Oracle error");
            return;
        }
        if (response.length != 64) {
            _failRequest(request, requestId, "Malformed response");
            return;
        }

        // Decode response: abi.encode(uint256 measuredEmissions [tonnes CO2e, 18 decimals], uint256 confidence [1..100])
        (uint256 measuredEmissions, uint256 confidence) = abi.decode(response, (uint256, uint256));
        if (measuredEmissions == 0) {
            // A zero reading is indistinguishable from a dead sensor; never turn it into a full-baseline credit.
            _failRequest(request, requestId, "Zero measurement");
            return;
        }
        if (confidence == 0 || confidence > 100) {
            _failRequest(request, requestId, "Invalid confidence");
            return;
        }
        require(!periodVerified[request.projectId][request.period], "Period already verified");

        Project storage project = projects[request.projectId];

        // Calculate reduction (both operands are 18-decimal tonnes)
        uint256 reductionAchieved = 0;
        if (measuredEmissions < project.baselineEmissions) {
            reductionAchieved = project.baselineEmissions - measuredEmissions;
        }

        uint8 confidenceScore = uint8(confidence);

        // Update request
        request.measuredEmissions = measuredEmissions;
        request.reductionAchieved = reductionAchieved;
        request.confidenceScore = confidenceScore;
        request.dataProofHash = keccak256(response); // In production, store IPFS CID

        // Update project / period bookkeeping
        periodVerified[request.projectId][request.period] = true;
        project.lastVerificationTime = block.timestamp;

        emit VerificationFulfilled(
            requestId,
            request.projectId,
            measuredEmissions,
            reductionAchieved,
            confidenceScore
        );
    }

    /// @dev Settle `request` as failed (oracle error / malformed or implausible answer): nothing is minted.
    function _failRequest(VerificationRequest storage request, bytes32 requestId, string memory reason) private {
        request.failed = true;
        emit VerificationFailed(requestId, request.projectId, reason);
        emit VerificationFulfilled(requestId, request.projectId, 0, 0, 0);
    }

    // ============ CREDIT CLAIM ============

    /**
     * @notice Mint the credits for a recorded verification to the project owner. Callable by anyone
     *         (the recipient and the amount are fixed by the oracle result), once per request.
     * @return tokenId The minted credit NFT
     */
    function claimCredits(bytes32 requestId) external nonReentrant returns (uint256 tokenId) {
        VerificationRequest storage request = verificationRequests[requestId];
        require(request.requestTime != 0, "Unknown request");
        require(request.fulfilled && !request.failed, "Not verified");
        require(!request.claimed, "Already claimed");
        require(request.reductionAchieved > 0, "No reduction");
        require(request.confidenceScore >= MIN_CLAIM_CONFIDENCE, "Confidence too low");
        require(projects[request.projectId].isActive, "Project not active");

        request.claimed = true;
        tokenId = _mintCreditsForProject(request.projectId, request.reductionAchieved, requestId, request.period, request.requestTime);
    }

    /**
     * @notice Mint carbon credits based on verified emission reduction
     * @dev `reductionTonnes` is already 18-decimal tonnes and is minted as is (AUD-ORACLE-01).
     */
    function _mintCreditsForProject(
        string memory projectId,
        uint256 reductionTonnes,
        bytes32 requestId,
        uint256 period,
        uint256 requestTime
    ) internal returns (uint256 tokenId) {
        Project memory project = projects[projectId];

        // Prepare metadata
        string memory tokenURI = string(abi.encodePacked(
            "ipfs://Qm", // Placeholder - in production, upload to IPFS
            projectId
        ));

        // Deterministic serial: one credit per (project, period)
        string memory serialNumber = string(abi.encodePacked(
            project.methodology,
            "-",
            projectId,
            "-P",
            _toString(period)
        ));

        // Mint NFT
        tokenId = nftContract.mintCredit(
            project.owner,
            projectId,
            projectId, // projectName
            serialNumber,
            project.methodology,
            reductionTonnes, // already 18 decimals
            _yearOf(requestTime), // Vintage year = year the measurement was requested
            "India", // Geography - make dynamic in production
            requestId, // Oracle proof hash
            "", // Satellite data CID - add in production
            tokenURI
        );

        projectCreditsMinted[projectId] += reductionTonnes;

        emit CreditsMinted(projectId, project.owner, reductionTonnes, tokenId);
    }

    // ============ VIEW FUNCTIONS ============

    function getProject(string memory projectId)
        external
        view
        returns (Project memory)
    {
        return projects[projectId];
    }

    function getVerificationRequest(bytes32 requestId)
        external
        view
        returns (VerificationRequest memory)
    {
        return verificationRequests[requestId];
    }

    function getProjectRequests(string memory projectId)
        external
        view
        returns (bytes32[] memory)
    {
        return projectRequests[projectId];
    }

    function getActiveProjectCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < activeProjects.length; i++) {
            if (projects[activeProjects[i]].isActive) {
                count++;
            }
        }
        return count;
    }

    // ============ ADMIN FUNCTIONS ============

    /// @notice Max disagreement between primary and cross-check measurement the Functions source tolerates (bps, 1%..50%).
    function setCrossCheckTolerance(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps >= 100 && bps <= 5000, "Invalid tolerance");
        crossCheckToleranceBps = bps;
        emit CrossCheckToleranceChanged(bps);
    }

    function grantAutomationRole(address automationRegistry)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _grantRole(AUTOMATION_ROLE, automationRegistry);
    }

    // ============ UTILITIES ============

    /// @dev Calendar year of a unix timestamp (proleptic Gregorian, Hinnant's civil_from_days).
    function _yearOf(uint256 timestamp) internal pure returns (uint256) {
        int256 z = int256(timestamp / 1 days) + 719468;
        int256 era = z / 146097;
        int256 doe = z - era * 146097;
        int256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        int256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        int256 mp = (5 * doy + 2) / 153;
        int256 month = mp < 10 ? mp + 3 : mp - 9;
        int256 year = yoe + era * 400 + (month <= 2 ? int256(1) : int256(0));
        return uint256(year);
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
