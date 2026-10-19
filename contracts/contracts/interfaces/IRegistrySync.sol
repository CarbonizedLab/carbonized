// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRegistrySync {
    function isCreditVerified(string calldata registry, string calldata serialNumber)
        external
        view
        returns (bool);

    function isSerialUsed(string calldata registry, string calldata serialNumber)
        external
        view
        returns (bool);

    function verificationTimestamp(string calldata registry, string calldata serialNumber)
        external
        view
        returns (uint256);
}
