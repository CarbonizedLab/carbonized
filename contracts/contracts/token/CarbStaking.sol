// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./TokenChecks.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IFeeDiscount.sol";

/**
 * @title CarbStaking
 * @notice Stake CARB to unlock access TIERS (0..3). There is NO reward token, NO emission, NO yield: staking
 *         earns nothing except the tier, which the marketplace reads as a trading-fee discount
 *         (`IFeeDiscount.discountBps`). Staked tokens are never lent, rehypothecated or touched by any admin.
 *
 * FLASH-STAKE PROTECTION (warm-up)
 * - Newly staked CARB sits in a `pending` bucket for WARMUP seconds and counts for NO tier meanwhile. Only
 *   `matured` stake (pending that has aged >= WARMUP) is used by `tierOf`. Borrowing CARB, staking and reading
 *   the tier within one transaction (or one block, or anything shorter than WARMUP) therefore always yields
 *   the tier of the previously matured stake, i.e. no uplift. A top-up resets the age of the *pending* bucket
 *   only; matured stake keeps its tier.
 * - `unstake` takes effect on the tier IMMEDIATELY (it consumes pending first, then matured) and starts the
 *   COOLDOWN: tokens can be `withdraw`n only COOLDOWN seconds after the latest `unstake`. Unstaked tokens in
 *   cooldown count for nothing.
 * - Combined, a tier requires capital that stays committed >= WARMUP going in and COOLDOWN going out.
 *
 * ADMIN SURFACE (intentionally tiny)
 * - PARAMETER_ROLE (multisig at bootstrap, later a governance timelock): `setTierThresholds`,
 *   `setTierDiscounts`, both hard-bounded. WARMUP / COOLDOWN are immutable.
 * - No role can move, freeze, seize or redirect staked tokens.
 * - The stake does not vote (tokens sit in this contract, which delegates nowhere); holders who want voting
 *   power for a token keep it in their wallet and delegate it. This trade-off is intentional and documented.
 *
 * EXTERNAL / LAUNCHPAD TOKEN SUPPORT
 * - Works with any plain ERC-20 of up to 24 decimals; `burn`, votes and 18 decimals are NOT required. Thresholds are
 *   token base units; the bounds scale with `tokenDecimals` (1 .. 50,000,000 WHOLE tokens).
 * - `stake` measures the balance change and REVERTS unless exactly `amount` arrived: fee-on-transfer / tax tokens
 *   are rejected. REBASING tokens (balances change without transfers) are UNSUPPORTED: a negative rebase would leave
 *   the contract short of the recorded stakes.
 */
contract CarbStaking is AccessControl, ReentrancyGuard, IFeeDiscount {
    using SafeERC20 for IERC20;

    bytes32 public constant PARAMETER_ROLE = keccak256("PARAMETER_ROLE");

    // ============ BOUNDS ============
    uint256 public constant TIER_COUNT = 4; // tiers 0..3
    uint256 public constant MIN_WARMUP = 1 hours;
    uint256 public constant MAX_WARMUP = 14 days;
    uint256 public constant MIN_COOLDOWN = 1 days;
    uint256 public constant MAX_COOLDOWN = 30 days;
    /// @notice Smallest tier-1 threshold: 1 whole token (`10 ** tokenDecimals` base units)
    uint256 public immutable MIN_THRESHOLD;
    /// @notice Largest tier-3 threshold: 50,000,000 whole tokens (`50_000_000 * 10 ** tokenDecimals` base units)
    uint256 public immutable MAX_THRESHOLD;
    /// @notice Hard cap on any tier's fee discount (the marketplace independently clamps to the same 50%)
    uint16 public constant MAX_DISCOUNT_BPS = 5000;

    // ============ IMMUTABLES ============
    IERC20 public immutable carb;
    /// @notice `decimals()` of the staked token, read once at construction (display only; the contract itself
    ///         works in base units). Thresholds are base units of the token.
    uint8 public immutable tokenDecimals;
    /// @notice Seconds new stake must age before it counts for a tier
    uint256 public immutable WARMUP;
    /// @notice Seconds between `unstake` and `withdraw`
    uint256 public immutable COOLDOWN;

    // ============ STATE ============
    struct Position {
        uint128 matured;      // staked and warmed up: counts for the tier
        uint128 pending;      // staked, still warming up
        uint64 pendingSince;  // timestamp of the latest stake into `pending`
        uint128 cooling;      // unstaked, waiting for the cooldown
        uint64 unlockAt;      // timestamp at which `cooling` becomes withdrawable
    }

    mapping(address => Position) private _positions;

    /// @notice Minimum matured stake for tier 1, 2, 3 (strictly increasing)
    uint256[3] public tierThresholds;
    /// @notice Fee discount (bps of the fee) granted by tier 0..3 (non-decreasing, <= MAX_DISCOUNT_BPS)
    uint16[4] public tierDiscountBps;

    /// @notice Sum of all stake (pending + matured) across users; excludes tokens in cooldown
    uint256 public totalStaked;

    // ============ EVENTS ============
    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount, uint256 unlockAt);
    event Withdrawn(address indexed account, uint256 amount);
    event TierThresholdsUpdated(uint256[3] thresholds);
    event TierDiscountsUpdated(uint16[4] discountsBps);

    constructor(
        address carb_,
        address admin,
        uint256 warmup,
        uint256 cooldown,
        uint256[3] memory thresholds,
        uint16[4] memory discountsBps
    ) {
        require(carb_ != address(0), "Invalid token");
        require(admin != address(0), "Invalid admin");
        require(warmup >= MIN_WARMUP && warmup <= MAX_WARMUP, "Warmup out of bounds");
        require(cooldown >= MIN_COOLDOWN && cooldown <= MAX_COOLDOWN, "Cooldown out of bounds");

        uint8 decimals_ = TokenChecks.readDecimals(carb_);
        uint256 unit = 10 ** uint256(decimals_);

        carb = IERC20(carb_);
        tokenDecimals = decimals_;
        MIN_THRESHOLD = unit;
        MAX_THRESHOLD = 50_000_000 * unit;
        WARMUP = warmup;
        COOLDOWN = cooldown;
        _setTierThresholds(thresholds, unit, 50_000_000 * unit);
        _setTierDiscounts(discountsBps);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PARAMETER_ROLE, admin);
    }

    // ============ STAKING ============

    /**
     * @notice Stake `amount` CARB (requires prior approval). The new stake counts for a tier after WARMUP.
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Invalid amount");
        require(amount <= type(uint128).max, "Amount too large");

        Position storage p = _positions[msg.sender];
        _roll(p);

        p.pending += uint128(amount);
        p.pendingSince = uint64(block.timestamp);
        totalStaked += amount;

        TokenChecks.pullExact(carb, msg.sender, amount);

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Start withdrawing `amount`: it stops counting for the tier immediately and becomes withdrawable
     *         COOLDOWN seconds from now. A further `unstake` restarts the cooldown for the whole cooling amount.
     */
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Invalid amount");

        Position storage p = _positions[msg.sender];
        _roll(p);
        require(amount <= uint256(p.matured) + p.pending, "Insufficient stake");

        // Consume the youngest (pending) stake first so matured stake keeps its tier as long as possible
        uint256 fromPending = amount < p.pending ? amount : p.pending;
        p.pending -= uint128(fromPending);
        p.matured -= uint128(amount - fromPending);

        p.cooling += uint128(amount);
        p.unlockAt = uint64(block.timestamp + COOLDOWN);
        totalStaked -= amount;

        emit Unstaked(msg.sender, amount, p.unlockAt);
    }

    /**
     * @notice Withdraw all tokens whose cooldown has elapsed.
     */
    function withdraw() external nonReentrant returns (uint256 amount) {
        Position storage p = _positions[msg.sender];
        amount = p.cooling;
        require(amount > 0, "Nothing to withdraw");
        require(block.timestamp >= p.unlockAt, "Cooldown active");

        p.cooling = 0;
        p.unlockAt = 0;

        carb.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    // ============ VIEWS ============

    /// @notice Stake counting for the tier: matured stake, plus pending stake that has finished warming up
    function effectiveStake(address account) public view returns (uint256) {
        Position storage p = _positions[account];
        if (p.pending > 0 && block.timestamp >= uint256(p.pendingSince) + WARMUP) {
            return uint256(p.matured) + p.pending;
        }
        return p.matured;
    }

    /// @notice Tier 0..3 of `account` from its warmed-up stake and the current thresholds
    function tierOf(address account) public view returns (uint256 tier) {
        uint256 stakeAmount = effectiveStake(account);
        if (stakeAmount == 0) return 0;
        uint256[3] memory t = tierThresholds;
        if (stakeAmount >= t[2]) return 3;
        if (stakeAmount >= t[1]) return 2;
        if (stakeAmount >= t[0]) return 1;
        return 0;
    }

    /// @inheritdoc IFeeDiscount
    function discountBps(address user) external view returns (uint256) {
        return tierDiscountBps[tierOf(user)];
    }

    /// @notice Full position of `account` (matured, pending, pendingSince, cooling, unlockAt) as stored
    function positionOf(address account)
        external
        view
        returns (uint256 matured, uint256 pending, uint256 pendingSince, uint256 cooling, uint256 unlockAt)
    {
        Position storage p = _positions[account];
        return (p.matured, p.pending, p.pendingSince, p.cooling, p.unlockAt);
    }

    /// @notice Total CARB `account` has in this contract (staked + cooling)
    function balanceOf(address account) external view returns (uint256) {
        Position storage p = _positions[account];
        return uint256(p.matured) + p.pending + p.cooling;
    }

    // ============ PARAMETERS (PARAMETER_ROLE) ============

    /// @notice Set the tier-1/2/3 thresholds: strictly increasing, within [MIN_THRESHOLD, MAX_THRESHOLD].
    ///         Takes effect immediately for every account.
    function setTierThresholds(uint256[3] calldata thresholds) external onlyRole(PARAMETER_ROLE) {
        _setTierThresholds(thresholds, MIN_THRESHOLD, MAX_THRESHOLD);
    }

    /// @notice Set the per-tier fee discounts: tier 0 must be 0, non-decreasing, each <= MAX_DISCOUNT_BPS.
    function setTierDiscounts(uint16[4] calldata discountsBps) external onlyRole(PARAMETER_ROLE) {
        _setTierDiscounts(discountsBps);
    }

    // ============ INTERNALS ============

    /// @dev Move pending stake that has finished warming up into `matured`
    function _roll(Position storage p) private {
        if (p.pending > 0 && block.timestamp >= uint256(p.pendingSince) + WARMUP) {
            p.matured += p.pending;
            p.pending = 0;
        }
    }

    function _setTierThresholds(uint256[3] memory t, uint256 minThreshold, uint256 maxThreshold) private {
        require(t[0] >= minThreshold, "Threshold too low");
        require(t[0] < t[1] && t[1] < t[2], "Thresholds not increasing");
        require(t[2] <= maxThreshold, "Threshold too high");
        tierThresholds = t;
        emit TierThresholdsUpdated(t);
    }

    function _setTierDiscounts(uint16[4] memory d) private {
        require(d[0] == 0, "Tier 0 has no discount");
        for (uint256 i = 1; i < TIER_COUNT; i++) {
            require(d[i] >= d[i - 1], "Discounts decreasing");
        }
        require(d[3] <= MAX_DISCOUNT_BPS, "Discount too high");
        tierDiscountBps = d;
        emit TierDiscountsUpdated(d);
    }
}
