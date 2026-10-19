// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./TokenChecks.sol";

/**
 * @title CarbVotes (vCARB)
 * @notice Voting-power wrapper for a CARB token that has no ERC20Votes of its own (e.g. a launchpad token).
 *         Deposit CARB 1:1, receive vCARB (same decimals), delegate it, vote with it in `CarbGovernor`;
 *         burn vCARB to withdraw the CARB at any time.
 *
 * @dev - 1:1 and immediately redeemable: there is NO lock, fee, admin, owner, upgrade or pause. The wrapper's CARB
 *        balance always covers `totalSupply()` (donations only add surplus that nobody can claim).
 *      - `depositFor` measures the CARB actually received and REVERTS unless it equals `amount`: fee-on-transfer /
 *        tax tokens are rejected, so vCARB can never be minted against CARB the wrapper did not receive. Rebasing
 *        tokens are unsupported (a negative rebase would make the wrapper insolvent for the last withdrawers).
 *      - Voting clock: TIMESTAMP (ERC-6372 `mode=timestamp`), identical to `CarbToken`, so every governor
 *        duration is in seconds.
 *      - Votes must be DELEGATED (`delegate(self)` is enough) and only count from the next clock tick. CARB held by
 *        CarbStaking / IssuerBond, or sitting in the wallet un-wrapped, carries no votes.
 *      - Quorum is a percentage of the vCARB supply at the snapshot, i.e. of the CARB that chose to be wrapped,
 *        NOT of the CARB total supply. A small wrapped supply therefore means a small quorum: see TOKEN.md.
 */
contract CarbVotes is ERC20, ERC20Permit, ERC20Votes, ERC20Wrapper, ReentrancyGuard {
    constructor(IERC20 carb_)
        ERC20("Carbonized Carbon Voting Power", "vCARB")
        ERC20Permit("Carbonized Carbon Voting Power")
        ERC20Wrapper(carb_)
    {
        // Fail at deployment, not at the first vote, if the underlying token is unusable for the governor.
        TokenChecks.readDecimals(address(carb_));
    }

    /// @notice Same decimals as the wrapped token
    function decimals() public view override(ERC20, ERC20Wrapper) returns (uint8) {
        return super.decimals();
    }

    /// @inheritdoc ERC20Wrapper
    /// @dev Reverts unless exactly `amount` CARB was received.
    function depositFor(address account, uint256 amount) public override nonReentrant returns (bool) {
        address sender = _msgSender();
        require(sender != address(this), "ERC20Wrapper: wrapper can't deposit");
        require(account != address(this), "ERC20Wrapper: cannot mint to wrapper");
        TokenChecks.pullExact(underlying(), sender, amount);
        _mint(account, amount);
        return true;
    }

    /// @inheritdoc ERC20Wrapper
    function withdrawTo(address account, uint256 amount) public override nonReentrant returns (bool) {
        return super.withdrawTo(account, amount);
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
