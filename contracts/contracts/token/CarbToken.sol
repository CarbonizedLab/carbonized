// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

/**
 * @title CarbToken (CARB)
 * @notice Utility / governance token of the Carbonized protocol: stake for access tiers (fee discounts), bond as an
 *         issuer, vote on protocol parameters. It carries NO profit share, NO rewards and NO rebasing.
 *
 * @dev Deliberately minimal and immutable:
 *      - fixed supply minted exactly once in the constructor to `recipient` (a multisig / treasury);
 *      - no `mint`, no owner, no admin, no pause, no blacklist, no transfer fee, no upgradeability;
 *      - holders can burn their own tokens (`burn`, `burnFrom`), which is the only way supply changes;
 *      - ERC-2612 `permit` and ERC-5805 / ERC20Votes for onchain governance.
 *
 *      Voting clock: TIMESTAMP (ERC-6372 `mode=timestamp`), not block number. Robinhood Chain is an Arbitrum
 *      Orbit L2 whose `block.number` is not a reliable wall-clock; every governance duration in
 *      CarbGovernor / CarbTimelock is therefore expressed in seconds. Voting power must be delegated
 *      (`delegate(self)` is enough) before it counts; tokens held by CarbStaking / IssuerBond carry no votes.
 */
contract CarbToken is ERC20, ERC20Burnable, ERC20Permit, ERC20Votes {
    /// @notice Total supply minted at deployment: 1,000,000,000 CARB (18 decimals). This is a launch PARAMETER
    ///         chosen by the owner, not a recommendation; changing it requires redeploying the token.
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000e18;

    constructor(address recipient) ERC20("Carbonized Carbon", "CARB") ERC20Permit("Carbonized Carbon") {
        require(recipient != address(0), "Invalid recipient");
        _mint(recipient, INITIAL_SUPPLY);
    }

    /// @inheritdoc ERC20Votes
    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    /// @inheritdoc ERC20Votes
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    // ============ REQUIRED OVERRIDES ============

    function _afterTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._burn(account, amount);
    }
}
