// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal 1-of-1 admin contract used ONLY to satisfy the "admin must be a contract, not an
/// EOA" guard during a mainnet pipeline exercise. NOT a real multisig, NOT for production use.
/// Owner can execute arbitrary calls (role grants, role transfers) exactly like a Safe would.
contract ExerciseOnlyAdmin {
    address public owner;

    event Executed(address indexed target, uint256 value, bytes data, bool success);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address owner_) {
        require(owner_ != address(0), "zero owner");
        owner = owner_;
    }

    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyOwner
        returns (bytes memory)
    {
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        emit Executed(target, value, data, ok);
        require(ok, "call failed");
        return ret;
    }

    receive() external payable {}
}
