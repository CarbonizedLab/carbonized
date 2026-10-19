// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "./TokenChecks.sol";

/**
 * @title CarbGovernor
 * @notice CARB-weighted onchain governance over PROTOCOL PARAMETERS only.
 *
 * - Voting power: the votes token `token_` (delegation required), timestamp clock => every duration is in SECONDS.
 *   `token_` is CarbToken, an external CARB that is itself ERC-5805 with a timestamp clock, or the CarbVotes
 *   wrapper around an external CARB without votes (see TOKEN.md). Its `decimals()` scale the proposal-threshold bound.
 * - Counting: for / against / abstain (GovernorCountingSimple); quorum = a fraction of the votes token's total
 *   supply at the proposal snapshot (for CarbVotes: of the WRAPPED supply only).
 * - Execution: through CarbTimelock. The timelock - not the governor - is the account holding the
 *   parameter / slasher roles on the protocol contracts, so governance power is exactly what those roles allow:
 *   marketplace fee / min price / KYC gate / discount provider, staking thresholds / discounts, issuer-bond
 *   minimum / bond switch / slash treasury, slashing. It holds no issuance, escrow or admin role.
 * - Defence in depth: proposals may only target an ALLOWLIST of protocol contracts (set at construction, and
 *   changeable only by a passed proposal) and may not send ETH.
 * - Every tunable has a hard bound so a captured vote cannot disable the safeguards below: voting delay,
 *   voting period, proposal threshold and quorum fraction are range-checked at construction and on update.
 */
contract CarbGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    // ============ BOUNDS (seconds / CARB base units / percent) ============
    uint256 public constant MIN_VOTING_DELAY = 1 hours;
    uint256 public constant MAX_VOTING_DELAY = 7 days;
    uint256 public constant MIN_VOTING_PERIOD = 1 days;
    uint256 public constant MAX_VOTING_PERIOD = 14 days;
    /// @notice Highest proposal threshold: 50,000,000 WHOLE votes-token units (`50_000_000 * 10 ** decimals` base
    ///         units), fixed at construction from the votes token's `decimals()`. Storage (not immutable) because
    ///         the bound is checked from a base constructor, which cannot read immutables.
    uint256 public MAX_PROPOSAL_THRESHOLD;
    uint256 public constant MIN_QUORUM_PERCENT = 1;
    uint256 public constant MAX_QUORUM_PERCENT = 20;

    /// @notice Contracts proposals may call (through the timelock)
    mapping(address => bool) public allowedTargets;

    event TargetAllowanceUpdated(address indexed target, bool allowed);

    constructor(
        IVotes token_,
        TimelockController timelock_,
        uint256 votingDelay_,
        uint256 votingPeriod_,
        uint256 proposalThreshold_,
        uint256 quorumPercent_,
        address[] memory initialTargets
    )
        Governor("Carbonized Governor")
        GovernorSettings(votingDelay_, votingPeriod_, proposalThreshold_)
        GovernorVotes(token_)
        GovernorVotesQuorumFraction(quorumPercent_)
        GovernorTimelockControl(timelock_)
    {
        uint8 decimals_ = TokenChecks.readDecimals(address(token_));
        MAX_PROPOSAL_THRESHOLD = 50_000_000 * 10 ** uint256(decimals_);
        require(proposalThreshold_ <= MAX_PROPOSAL_THRESHOLD, "Threshold too high");
        _setTargetAllowed(address(this), true);
        _setTargetAllowed(address(timelock_), true);
        for (uint256 i = 0; i < initialTargets.length; i++) {
            _setTargetAllowed(initialTargets[i], true);
        }
    }

    // ============ ALLOWLIST ============

    /// @notice Add / remove a contract proposals may target. Only callable through a passed proposal.
    function setTargetAllowed(address target, bool allowed) external onlyGovernance {
        _setTargetAllowed(target, allowed);
    }

    function _setTargetAllowed(address target, bool allowed) private {
        require(target != address(0), "Invalid target");
        allowedTargets[target] = allowed;
        emit TargetAllowanceUpdated(target, allowed);
    }

    /// @dev Proposals may only call allowlisted contracts and cannot carry ETH.
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override(Governor, IGovernor) returns (uint256) {
        for (uint256 i = 0; i < targets.length; i++) {
            require(allowedTargets[targets[i]], "Target not allowed");
        }
        for (uint256 i = 0; i < values.length; i++) {
            require(values[i] == 0, "ETH value not allowed");
        }
        return super.propose(targets, values, calldatas, description);
    }

    // ============ BOUNDED SETTINGS ============

    function _setVotingDelay(uint256 newVotingDelay) internal override {
        require(newVotingDelay >= MIN_VOTING_DELAY && newVotingDelay <= MAX_VOTING_DELAY, "Voting delay out of bounds");
        super._setVotingDelay(newVotingDelay);
    }

    function _setVotingPeriod(uint256 newVotingPeriod) internal override {
        require(
            newVotingPeriod >= MIN_VOTING_PERIOD && newVotingPeriod <= MAX_VOTING_PERIOD, "Voting period out of bounds"
        );
        super._setVotingPeriod(newVotingPeriod);
    }

    function _setProposalThreshold(uint256 newProposalThreshold) internal override {
        // `MAX_PROPOSAL_THRESHOLD` is derived from the votes token's decimals in the constructor body; GovernorSettings
        // sets the initial value earlier (immutables cannot be read during construction), so the constructor
        // validates that one itself.
        uint256 max = MAX_PROPOSAL_THRESHOLD;
        require(max == 0 || newProposalThreshold <= max, "Threshold too high");
        super._setProposalThreshold(newProposalThreshold);
    }

    function _updateQuorumNumerator(uint256 newQuorumNumerator) internal override {
        require(
            newQuorumNumerator >= MIN_QUORUM_PERCENT && newQuorumNumerator <= MAX_QUORUM_PERCENT,
            "Quorum out of bounds"
        );
        super._updateQuorumNumerator(newQuorumNumerator);
    }

    // ============ REQUIRED OVERRIDES ============

    function votingDelay() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber) public view override(IGovernor, GovernorVotesQuorumFraction) returns (uint256) {
        return super.quorum(blockNumber);
    }

    function state(uint256 proposalId) public view override(Governor, GovernorTimelockControl) returns (ProposalState) {
        return super.state(proposalId);
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor() internal view override(Governor, GovernorTimelockControl) returns (address) {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
