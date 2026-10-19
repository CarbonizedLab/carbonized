// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title CarbTimelock
 * @notice OpenZeppelin TimelockController with a bounded minimum delay: the delay can neither be set (at
 *         construction or later through `updateDelay`) below MIN_DELAY_FLOOR nor above MAX_DELAY_CAP. Governance
 *         can therefore never collapse the public exit window to zero.
 * @dev This contract is what holds the PARAMETER_ROLE / SLASHER_ROLE of the protocol contracts. It holds NO
 *      credit-issuance, escrow or admin role (see contracts/docs/TOKEN.md). Pass `admin = address(0)` (or renounce
 *      TIMELOCK_ADMIN_ROLE after wiring) so the timelock administers itself, i.e. only through governance.
 *
 *      The base contract keeps its delay in a private variable, so this contract tracks the authoritative delay
 *      itself: `getMinDelay()` (used by `schedule` / `scheduleBatch`) and `updateDelay` are both overridden, and
 *      the base's private value is never read again.
 */
contract CarbTimelock is TimelockController {
    uint256 public constant MIN_DELAY_FLOOR = 1 days;
    uint256 public constant MAX_DELAY_CAP = 30 days;

    uint256 private _boundedMinDelay;

    constructor(uint256 minDelay, address[] memory proposers, address[] memory executors, address admin)
        TimelockController(minDelay, proposers, executors, admin)
    {
        require(minDelay >= MIN_DELAY_FLOOR && minDelay <= MAX_DELAY_CAP, "Delay out of bounds");
        _boundedMinDelay = minDelay;
    }

    /// @inheritdoc TimelockController
    function getMinDelay() public view override returns (uint256) {
        return _boundedMinDelay;
    }

    /// @inheritdoc TimelockController
    function updateDelay(uint256 newDelay) external override {
        require(msg.sender == address(this), "TimelockController: caller must be timelock");
        require(newDelay >= MIN_DELAY_FLOOR && newDelay <= MAX_DELAY_CAP, "Delay out of bounds");
        emit MinDelayChange(_boundedMinDelay, newDelay);
        _boundedMinDelay = newDelay;
    }
}
