// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./TokenChecks.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @dev The subset of CarbToken (ERC20Burnable) used to burn slashed bonds.
interface IBurnableERC20 is IERC20 {
    function burn(uint256 amount) external;
}

/**
 * @title IssuerBond
 * @notice Slashable CARB bond for issuer accountability; it never grants issuance authority.
 *
 * A bond is not an issuance credential. Issuance roles are granted separately by the NFT administrator,
 * so paying a bond can never grant or restore effective mint authority.
 *
 * LIFECYCLE
 * 1. `bond(amount)`: lock CARB once the bond is >= `minBond`.
 * 2. `startUnbond()`: starts the exit; the bond is withdrawable
 *    after UNBOND_DELAY (long, so that misbehaviour found after the last mint can still be slashed).
 * 3. `withdraw()`: after the delay and only if no slash proposal is active.
 *
 * SLASHING (SLASHER_ROLE: governance timelock / multisig)
 * - `proposeSlash(issuer, amount, reason)` opens a proposal. For DISPUTE_WINDOW seconds nothing executes and the
 *   issuer cannot start unbonding or withdraw (an active proposal always freezes the exit).
 * - The issuer can `disputeSlash(id, evidenceHash)`: records an onchain dispute so that the proposal can no
 *   longer be executed by just anyone: only a SLASHER_ROLE holder may execute a disputed proposal (explicit
 *   re-confirmation after reviewing the evidence).
 * - After the window, an undisputed proposal can be executed by anyone (liveness: a vanished slasher cannot
 *   hold a bond hostage); the proposal is valid for EXECUTION_WINDOW more seconds, then it lapses and stops
 *   freezing the exit. The slasher can `cancelSlash` at any time.
 * - Slashed tokens go to `slashTreasury` if configured; otherwise they are BURNED if the token really supports
 *   `burn(uint256)` (verified by the balance change), otherwise sent to `slashSink` (default 0x...dEaD). A slash
 *   never reverts because of a missing / failing burn. `Slashed.sink` is address(0) when burned, else the actual
 *   destination. At most `amount` (capped to the bond) is slashed; if the remaining bond is < `minBond` the
 *   bonded role is revoked until topped up.
 * - EXTERNAL TOKEN: any plain ERC-20 (up to 24 decimals) works; `burn` is optional. `bond` REVERTS unless exactly
 *   `amount` arrived (fee-on-transfer / tax tokens are rejected); rebasing tokens are UNSUPPORTED. The minimum-bond
 *   bounds scale with `tokenDecimals` (1 .. 100,000,000 whole tokens); `minBond` itself is in base units.
 * - Only one active proposal per issuer; at most one proposal can freeze an exit for
 *   DISPUTE_WINDOW + EXECUTION_WINDOW seconds, which bounds how long a slasher can lock a bond without acting.
 *
 * GOVERNANCE BOUNDARY
 * - PARAMETER_ROLE: `setMinBond` (bounded), `setBondRequired`, `setSlashTreasury`, `setSlashSink`.
 * - SLASHER_ROLE: propose / cancel / execute disputed slashes.
 * - DEFAULT_ADMIN_ROLE (multisig): role management and `setIssuerBlocked` (bars an address from the bond path
 *   after the multisig revoked it). Neither the admin nor governance can withdraw or redirect a bond except
 *   through the slash flow, and nobody can mint credits through this contract.
 */
contract IssuerBond is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant PARAMETER_ROLE = keccak256("PARAMETER_ROLE");
    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");

    // ============ BOUNDS ============
    uint256 public constant MIN_UNBOND_DELAY = 7 days;
    uint256 public constant MAX_UNBOND_DELAY = 90 days;
    uint256 public constant MIN_DISPUTE_WINDOW = 1 days;
    uint256 public constant MAX_DISPUTE_WINDOW = 30 days;
    /// @notice After the dispute window a proposal can be executed for this long, then it lapses
    uint256 public constant EXECUTION_WINDOW = 14 days;
    /// @notice Smallest allowed minimum bond: 1 whole token (`10 ** tokenDecimals` base units)
    uint256 public immutable MIN_BOND_FLOOR;
    /// @notice Largest allowed minimum bond: 100,000,000 whole tokens
    uint256 public immutable MAX_MIN_BOND;
    /// @notice Default `slashSink`
    address public constant DEFAULT_SLASH_SINK = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MAX_REASON_LENGTH = 512;

    // ============ IMMUTABLES ============
    IERC20 public immutable carb;
    /// @notice `decimals()` of the bonded token, read once at construction (display only; amounts are base units)
    uint8 public immutable tokenDecimals;

    uint256 public immutable UNBOND_DELAY;
    uint256 public immutable DISPUTE_WINDOW;

    // ============ STATE ============
    struct Bond {
        uint128 amount;       // CARB locked (shrinks only by slashing / withdrawal)
        uint64 releaseAt;     // withdrawable at (only meaningful while `unbonding`)
        bool unbonding;       // exit started
    }

    struct SlashProposal {
        address issuer;
        uint128 amount;
        uint64 executableAt;  // proposal time + DISPUTE_WINDOW
        uint64 expiresAt;     // executableAt + EXECUTION_WINDOW
        bool disputed;
        bool resolved;        // executed or cancelled
    }

    mapping(address => Bond) public bonds;
    mapping(uint256 => SlashProposal) public slashProposals;
    /// @notice Latest proposal id per issuer (0 = none); active only if unresolved and not lapsed
    mapping(address => uint256) public activeSlashOf;
    /// @notice Addresses barred from the bond path (set by the DEFAULT_ADMIN_ROLE holder)
    mapping(address => bool) public blocked;
    uint256 public nextSlashId = 1;

    uint256 public minBond;
    /// @notice True = the bond path is open (min bond enforced); false = no NEW bonding. See contract docs.
    bool public bondRequired;
    /// @notice address(0) = slashed CARB is burned; otherwise it is transferred there
    address public slashTreasury;
    /// @notice Destination of slashed tokens when `slashTreasury` is unset and the token cannot be burned
    ///         (default: the conventional dead address)
    address public slashSink;

    // ============ EVENTS ============
    event Bonded(address indexed issuer, uint256 amount, uint256 totalBond);
    event UnbondStarted(address indexed issuer, uint256 amount, uint256 releaseAt);
    event Withdrawn(address indexed issuer, uint256 amount);
    event SlashProposed(
        uint256 indexed id, address indexed issuer, uint256 amount, string reason, uint256 executableAt, uint256 expiresAt
    );
    event SlashDisputed(uint256 indexed id, address indexed issuer, bytes32 evidenceHash);
    event SlashCancelled(uint256 indexed id, address indexed issuer);
    event Slashed(uint256 indexed id, address indexed issuer, uint256 amount, address indexed sink, bool burned);

    event MinBondUpdated(uint256 oldMinBond, uint256 newMinBond);
    event BondRequiredUpdated(bool enabled);
    event SlashTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event SlashSinkUpdated(address indexed oldSink, address indexed newSink);
    event IssuerBlockedUpdated(address indexed issuer, bool blocked);

    constructor(
        address carb_,
        address admin,
        uint256 minBond_,
        uint256 unbondDelay,
        uint256 disputeWindow,
        bool bondRequired_,
        address slashTreasury_
    ) {
        require(carb_ != address(0) && admin != address(0), "Invalid address");
        uint8 decimals_ = TokenChecks.readDecimals(carb_);
        uint256 unit = 10 ** uint256(decimals_);
        require(minBond_ >= unit && minBond_ <= 100_000_000 * unit, "Min bond out of bounds");
        require(unbondDelay >= MIN_UNBOND_DELAY && unbondDelay <= MAX_UNBOND_DELAY, "Unbond delay out of bounds");
        require(
            disputeWindow >= MIN_DISPUTE_WINDOW && disputeWindow <= MAX_DISPUTE_WINDOW, "Dispute window out of bounds"
        );

        carb = IERC20(carb_);
        tokenDecimals = decimals_;
        MIN_BOND_FLOOR = unit;
        MAX_MIN_BOND = 100_000_000 * unit;
        UNBOND_DELAY = unbondDelay;
        DISPUTE_WINDOW = disputeWindow;
        minBond = minBond_;
        bondRequired = bondRequired_;
        slashTreasury = slashTreasury_;
        slashSink = DEFAULT_SLASH_SINK;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PARAMETER_ROLE, admin);
        _grantRole(SLASHER_ROLE, admin);
    }

    // ============ ISSUER FLOW ============

    /**
     * @notice Lock `amount` CARB (requires approval). This never grants an issuer role.
     *         May be called again to top up (e.g. after a slash). Not allowed while unbonding.
     */
    function bond(uint256 amount) external nonReentrant {
        require(bondRequired, "Bond path closed");
        require(!blocked[msg.sender], "Issuer blocked");
        require(amount > 0 && amount <= type(uint128).max, "Invalid amount");

        Bond storage b = bonds[msg.sender];
        require(!b.unbonding, "Unbonding");
        uint256 total = uint256(b.amount) + amount;
        require(total <= type(uint128).max, "Amount too large");
        require(total >= minBond, "Below minimum bond");

        b.amount = uint128(total);

        TokenChecks.pullExact(carb, msg.sender, amount);

        emit Bonded(msg.sender, amount, total);
    }

    /**
     * @notice Begin the exit; the bond is withdrawable after UNBOND_DELAY.
     *         Blocked while a slash proposal is active.
     */
    function startUnbond() external nonReentrant {
        Bond storage b = bonds[msg.sender];
        require(b.amount > 0, "No bond");
        require(!b.unbonding, "Already unbonding");
        require(!_slashActive(msg.sender), "Slash pending");

        b.unbonding = true;
        b.releaseAt = uint64(block.timestamp + UNBOND_DELAY);

        emit UnbondStarted(msg.sender, b.amount, b.releaseAt);
    }

    /**
     * @notice Withdraw the whole remaining bond after the unbonding delay, if no slash proposal is active.
     */
    function withdraw() external nonReentrant returns (uint256 amount) {
        Bond storage b = bonds[msg.sender];
        require(b.unbonding, "Not unbonding");
        require(block.timestamp >= b.releaseAt, "Unbonding delay active");
        require(!_slashActive(msg.sender), "Slash pending");

        amount = b.amount;
        delete bonds[msg.sender];

        if (amount > 0) {
            IERC20(address(carb)).safeTransfer(msg.sender, amount);
        }

        emit Withdrawn(msg.sender, amount);
    }

    // ============ SLASHING ============

    /**
     * @notice Open a slash proposal against `issuer` for up to `amount` CARB. `reason` is mandatory (emitted).
     * @dev One active proposal per issuer. Allowed while the issuer is unbonding. Freezes `startUnbond` and
     *      `withdraw` until it is executed, cancelled or lapses.
     */
    function proposeSlash(address issuer, uint256 amount, string calldata reason)
        external
        onlyRole(SLASHER_ROLE)
        returns (uint256 id)
    {
        require(bonds[issuer].amount > 0, "No bond");
        require(amount > 0 && amount <= type(uint128).max, "Invalid amount");
        require(bytes(reason).length > 0 && bytes(reason).length <= MAX_REASON_LENGTH, "Invalid reason");
        require(!_slashActive(issuer), "Slash already pending");

        id = nextSlashId++;
        uint64 executableAt = uint64(block.timestamp + DISPUTE_WINDOW);
        uint64 expiresAt = uint64(uint256(executableAt) + EXECUTION_WINDOW);
        slashProposals[id] = SlashProposal({
            issuer: issuer,
            amount: uint128(amount),
            executableAt: executableAt,
            expiresAt: expiresAt,
            disputed: false,
            resolved: false
        });
        activeSlashOf[issuer] = id;

        emit SlashProposed(id, issuer, amount, reason, executableAt, expiresAt);
    }

    /**
     * @notice The slashed issuer disputes proposal `id` (before execution). Records `evidenceHash` onchain and
     *         requires a SLASHER_ROLE holder to execute it (instead of anyone).
     */
    function disputeSlash(uint256 id, bytes32 evidenceHash) external {
        SlashProposal storage s = slashProposals[id];
        require(s.issuer == msg.sender, "Not the slashed issuer");
        require(_isActive(s), "Proposal not active");
        require(!s.disputed, "Already disputed");

        s.disputed = true;

        emit SlashDisputed(id, msg.sender, evidenceHash);
    }

    /// @notice Withdraw a proposal (e.g. after review); unfreezes the issuer's exit.
    function cancelSlash(uint256 id) external onlyRole(SLASHER_ROLE) {
        SlashProposal storage s = slashProposals[id];
        require(s.issuer != address(0), "Unknown proposal");
        require(!s.resolved, "Already resolved");

        s.resolved = true;

        emit SlashCancelled(id, s.issuer);
    }

    /**
     * @notice Execute a proposal once its dispute window has elapsed (and before it lapses). Anyone may execute
     *         an undisputed proposal; a disputed one needs SLASHER_ROLE.
     * @return slashed CARB actually slashed (min of the proposed amount and the remaining bond)
     */
    function executeSlash(uint256 id) external nonReentrant returns (uint256 slashed) {
        SlashProposal storage s = slashProposals[id];
        require(s.issuer != address(0), "Unknown proposal");
        require(!s.resolved, "Already resolved");
        require(block.timestamp >= s.executableAt, "Dispute window active");
        require(block.timestamp <= s.expiresAt, "Proposal lapsed");
        if (s.disputed) {
            _checkRole(SLASHER_ROLE);
        }

        s.resolved = true;

        address issuer = s.issuer;
        Bond storage b = bonds[issuer];
        slashed = s.amount < b.amount ? s.amount : b.amount;
        b.amount -= uint128(slashed);


        // Outcome: treasury (if configured) > burn (if the token really burns) > `slashSink`. A token without a
        // working `burn(uint256)` must never make a slash revert, so the burn is attempted with try/catch and
        // verified through the balance change.
        address treasury = slashTreasury;
        address sink;
        bool burned;
        if (slashed > 0) {
            if (treasury != address(0)) {
                sink = treasury;
            } else {
                burned = _tryBurn(slashed);
                if (!burned) sink = slashSink;
            }
            if (!burned) IERC20(address(carb)).safeTransfer(sink, slashed);
        }

        emit Slashed(id, issuer, slashed, sink, burned);
    }

    /// @dev True only if `burn(uint256)` succeeded AND this contract's balance dropped by exactly `amount`
    ///      (a token with a non-reverting fallback or a no-op burn counts as "cannot burn").
    function _tryBurn(uint256 amount) private returns (bool) {
        uint256 balanceBefore = carb.balanceOf(address(this));
        try IBurnableERC20(address(carb)).burn(amount) {} catch {
            return false;
        }
        uint256 balanceAfter = carb.balanceOf(address(this));
        return balanceAfter <= balanceBefore && balanceBefore - balanceAfter == amount;
    }

    // ============ VIEWS ============

    /// @notice True while `issuer` has an unresolved, unlapsed slash proposal (exit frozen)
    function hasActiveSlash(address issuer) external view returns (bool) {
        return _slashActive(issuer);
    }

    /// @notice True if `issuer` has an active bond. This is not an issuance authorization.
    function isBondedIssuer(address issuer) external view returns (bool) {
        Bond storage b = bonds[issuer];
        return !b.unbonding && b.amount >= minBond;
    }

    // ============ PARAMETERS ============

    /// @notice Set the minimum bond for NEW bonding / top-ups (existing bonds are grandfathered until slashed)
    function setMinBond(uint256 newMinBond) external onlyRole(PARAMETER_ROLE) {
        require(newMinBond >= MIN_BOND_FLOOR && newMinBond <= MAX_MIN_BOND, "Min bond out of bounds");
        emit MinBondUpdated(minBond, newMinBond);
        minBond = newMinBond;
    }

    /// @notice Open / close the bond path to new bonding. Does not touch trusted issuers or existing bonds.
    function setBondRequired(bool enabled) external onlyRole(PARAMETER_ROLE) {
        bondRequired = enabled;
        emit BondRequiredUpdated(enabled);
    }

    /// @notice address(0) = burn slashed CARB, otherwise send it to `treasury`
    function setSlashTreasury(address treasury) external onlyRole(PARAMETER_ROLE) {
        emit SlashTreasuryUpdated(slashTreasury, treasury);
        slashTreasury = treasury;
    }

    /// @notice Where slashed tokens go when `slashTreasury` is unset and the token cannot be burned. Never zero.
    function setSlashSink(address sink) external onlyRole(PARAMETER_ROLE) {
        require(sink != address(0) && sink != address(this), "Invalid sink");
        emit SlashSinkUpdated(slashSink, sink);
        slashSink = sink;
    }

    /// @notice Bar / unbar an address from the bond path (admin = multisig; not a governance power)
    function setIssuerBlocked(address issuer, bool isBlocked) external onlyRole(DEFAULT_ADMIN_ROLE) {
        blocked[issuer] = isBlocked;
        emit IssuerBlockedUpdated(issuer, isBlocked);
    }

    // ============ INTERNALS ============

    function _isActive(SlashProposal storage s) private view returns (bool) {
        return s.issuer != address(0) && !s.resolved && block.timestamp <= s.expiresAt;
    }

    function _slashActive(address issuer) private view returns (bool) {
        uint256 id = activeSlashOf[issuer];
        return id != 0 && _isActive(slashProposals[id]);
    }
}
