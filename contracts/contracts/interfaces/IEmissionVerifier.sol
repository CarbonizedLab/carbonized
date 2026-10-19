// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IEmissionVerifier
 * @notice Interface for EmissionVerifier oracle contract
 */
interface IEmissionVerifier {
    
    struct Project {
        string projectId;
        address owner;
        string methodology;
        uint256 baselineEmissions;
        uint256 targetReduction;
        uint256 lastVerificationTime;
        uint256 verificationInterval;
        bool isActive;
        string iotEndpoint;
        string satelliteRegion;
        bytes32 auditorSignature;
    }

    struct VerificationRequest {
        bytes32 requestId;
        string projectId;
        uint256 requestTime;
        bool fulfilled;
        uint256 measuredEmissions;
        uint256 reductionAchieved;
        bytes32 dataProofHash;
        uint8 confidenceScore;
    }

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
    ) external;

    function requestVerification(string memory projectId) external;

    function getProject(string memory projectId) external view returns (Project memory);

    function getVerificationRequest(bytes32 requestId) 
        external 
        view 
        returns (VerificationRequest memory);
}
